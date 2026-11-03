package com.catholicgram.android

import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Message
import android.provider.MediaStore
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.browser.customtabs.CustomTabColorSchemeParams
import androidx.browser.customtabs.CustomTabsIntent
import androidx.core.content.FileProvider
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewFeature
import java.io.File

/**
 * 가톨릭그램 하이브리드 앱의 화면 하나.
 * 크롬·삼성 인터넷을 거치지 않고 앱 안의 웹뷰로 가톨릭그램 사이트를 띄운다.
 * (크롬 '검색 띠'·삼성 인터넷 알림 꺼짐·억지 어두운 화면 같은 브라우저 문제가 없어진다)
 *
 * 앱이 직접 하는 일: 사진 고르기·찍기, 바깥 링크 열기(카카오톡·Play 스토어·다른 사이트), 뒤로가기,
 * 화면 위아래 여백(시계 줄·아래 막대), 동영상 전체 화면, 내려받기, 로그인(크롬 창), 알림을 눌러 열기.
 * 웹 화면과 주고받는 일(공유·저장·로그인·알림 켜기 등)은 [AppBridge].
 */
class MainActivity : ComponentActivity() {

    lateinit var web: WebView
        private set
    private lateinit var root: FrameLayout
    private lateinit var bridge: AppBridge

    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var cameraOutput: Uri? = null
    private var fullscreenView: View? = null
    private var fullscreenCallback: WebChromeClient.CustomViewCallback? = null
    private var barColor = Color.parseColor("#FAF7F2")
    private var barDark = false
    private var pageLoaded = false

    private val pickFiles = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val callback = fileCallback ?: return@registerForActivityResult
        fileCallback = null
        val uris = mutableListOf<Uri>()
        if (result.resultCode == RESULT_OK) {
            val data = result.data
            data?.clipData?.let { clip -> for (i in 0 until clip.itemCount) uris.add(clip.getItemAt(i).uri) }
            if (uris.isEmpty()) data?.data?.let { uris.add(it) }
            if (uris.isEmpty()) cameraOutput?.let { uris.add(it) } // 사진·동영상 찍기는 결과 대신 미리 정한 파일에 담김
        }
        cameraOutput = null
        callback.onReceiveValue(if (uris.isEmpty()) null else uris.toTypedArray())
    }

    val askNotificationPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        bridge.onNotificationPermission(granted)
    }
    val askStoragePermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        bridge.onStoragePermission(granted)
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        applyBars()

        root = FrameLayout(this)
        root.setBackgroundColor(barColor)
        web = WebView(this)
        root.addView(web, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        setContentView(root)

        // 시계 줄·아래 막대·자판만큼 비워 웹 화면이 그 밑으로 들어가지 않게 (안드로이드 15부터는 앱이 화면 끝까지 그려짐)
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            view.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, ime.bottom))
            WindowInsetsCompat.CONSUMED
        }

        setupWebView()
        bridge = AppBridge(this)
        bridge.attach(web)
        Notifications.ensureChannel(this)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                when {
                    fullscreenView != null -> hideFullscreen()
                    web.canGoBack() -> web.goBack()
                    else -> {
                        // 웹 화면의 맨 첫 칸(종료 안내 뒤)에서 뒤로가기 = 앱을 뒤로 보냄 (다시 열면 그대로)
                        moveTaskToBack(true)
                    }
                }
            }
        })

        val restored = savedInstanceState?.let { web.restoreState(it) } != null
        if (!restored && !bridge.handleLoginReturn(intent)) web.loadUrl(startUrl(intent))
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (bridge.handleLoginReturn(intent)) return
        val url = linkFromIntent(intent) ?: return
        openInApp(url)
    }

    override fun onResume() {
        super.onResume()
        PushService.setForeground(this)
        web.onResume()
        bridge.onResume()
    }

    override fun onPause() {
        if (PushService.foreground() === this) PushService.setForeground(null)
        web.onPause()
        CookieManager.getInstance().flush()
        super.onPause()
    }

    override fun onDestroy() {
        root.removeView(web)
        web.destroy()
        super.onDestroy()
    }

    /** 앱이 먼저 웹에 알림 (알림 도착·토큰 바뀜 등) */
    fun bridgeEmit(type: String, data: org.json.JSONObject) = bridge.emit(type, data)

    // ---------- 웹뷰 ----------

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            @Suppress("DEPRECATION")
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false // 공간 배경음악·영상 저절로 재생
            allowFileAccess = false
            javaScriptCanOpenWindowsAutomatically = false
            setSupportMultipleWindows(true) // target=_blank 링크를 onCreateWindow 로 받아 바깥에서 연다
            textZoom = 100 // 글씨 크기는 앱 안 '설정 → 글씨 크기'로 (휴대폰 글씨 크기에 화면이 깨지지 않게)
            mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
            userAgentString = "$userAgentString CatholicgramApp/${BuildConfig.VERSION_NAME} (Android; ${BuildConfig.APPLICATION_ID})"
        }
        // 휴대폰이 다크 모드여도 웹 화면을 억지로 어둡게 바꾸지 않게 (어두운 화면은 앱의 '화면 색'으로)
        if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
            WebSettingsCompat.setAlgorithmicDarkeningAllowed(web.settings, false)
        }
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(web, true)
        }

        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                request.isForMainFrame && handleNavigation(request.url)

            override fun onPageFinished(view: WebView, url: String?) {
                pageLoaded = true
                bridge.onPageFinished()
            }
        }

        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                return try {
                    pickFiles.launch(fileIntent(params))
                    true
                } catch (e: ActivityNotFoundException) {
                    fileCallback = null
                    callback.onReceiveValue(null)
                    false
                }
            }

            override fun onShowCustomView(view: View, callback: CustomViewCallback) {
                if (fullscreenView != null) { callback.onCustomViewHidden(); return }
                fullscreenView = view
                fullscreenCallback = callback
                root.addView(view, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
                web.visibility = View.GONE
                WindowCompat.getInsetsController(window, root).apply {
                    hide(WindowInsetsCompat.Type.systemBars())
                    systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                }
            }

            override fun onHideCustomView() = hideFullscreen()

            override fun onCreateWindow(view: WebView, isDialog: Boolean, isUserGesture: Boolean, resultMsg: Message): Boolean {
                // target=_blank·window.open: 잠깐 쓰는 웹뷰로 주소만 받아 바깥(또는 이 화면)에서 연다
                val temp = WebView(this@MainActivity)
                temp.webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(v: WebView, r: WebResourceRequest): Boolean {
                        val url = r.url
                        if (isOurSite(url)) web.loadUrl(url.toString()) else handleNavigation(url)
                        v.destroy()
                        return true
                    }
                }
                val transport = resultMsg.obj as WebView.WebViewTransport
                transport.webView = temp
                resultMsg.sendToTarget()
                return true
            }
        }

        web.setDownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
            downloadFile(url, userAgent, contentDisposition, mimeType)
        }
    }

    private fun hideFullscreen() {
        val view = fullscreenView ?: return
        root.removeView(view)
        fullscreenView = null
        web.visibility = View.VISIBLE
        WindowCompat.getInsetsController(window, root).show(WindowInsetsCompat.Type.systemBars())
        fullscreenCallback?.onCustomViewHidden()
        fullscreenCallback = null
    }

    // ---------- 주소 처리 ----------

    private val siteUri: Uri = Uri.parse(BuildConfig.SITE_ORIGIN)

    fun isOurSite(uri: Uri): Boolean =
        uri.scheme == "https" && uri.host.equals(siteUri.host, ignoreCase = true)

    /** 웹뷰가 이 주소로 가려 할 때: true = 앱이 따로 처리함(웹뷰는 그대로), false = 웹뷰가 연다 */
    fun handleNavigation(uri: Uri): Boolean {
        val scheme = uri.scheme?.lowercase() ?: return true
        if (scheme == "https" || scheme == "http") {
            if (isOurSite(uri)) return false
            openExternal(uri)
            return true
        }
        if (scheme == "intent") {
            openIntentUri(uri.toString())
            return true
        }
        if (scheme == "about" || scheme == "data" || scheme == "blob" || scheme == "javascript") return false
        // kakaotalk:// · market:// · tel: · mailto: · sms: 등은 휴대폰의 그 앱으로
        openExternal(uri)
        return true
    }

    fun openExternal(uri: Uri) {
        val intent = Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE)
        try {
            startActivity(intent)
        } catch (e: ActivityNotFoundException) {
            if (uri.scheme == "market") {
                val id = uri.getQueryParameter("id")
                if (id != null) {
                    openExternal(Uri.parse("https://play.google.com/store/apps/details?id=$id"))
                    return
                }
            }
            Toast.makeText(this, R.string.no_app_for_link, Toast.LENGTH_SHORT).show()
        }
    }

    private fun openIntentUri(raw: String) {
        val parsed = try {
            Intent.parseUri(raw, Intent.URI_INTENT_SCHEME)
        } catch (e: Exception) {
            null
        } ?: return
        // 이 앱 자신(예전 Play 앱 열기·크롬으로 열기 링크)으로 가는 가톨릭그램 주소는 그대로 이 화면에서
        val data = parsed.data
        if (data != null && isOurSite(data) && (parsed.`package` == null || parsed.`package` == packageName || parsed.`package` == "com.android.chrome")) {
            openInApp(data.toString())
            return
        }
        val safe = Intent(parsed.action ?: Intent.ACTION_VIEW, data).apply {
            addCategory(Intent.CATEGORY_BROWSABLE)
            parsed.`package`?.let { setPackage(it) }
            component = null
            selector = null
        }
        try {
            startActivity(safe)
        } catch (e: ActivityNotFoundException) {
            val fallback = parsed.getStringExtra("browser_fallback_url")
            when {
                fallback != null -> handleNavigation(Uri.parse(fallback))
                parsed.`package` != null -> openExternal(Uri.parse("market://details?id=${parsed.`package`}"))
                else -> Toast.makeText(this, R.string.no_app_for_link, Toast.LENGTH_SHORT).show()
            }
        }
    }

    /** 가톨릭그램 주소를 이 앱 화면에서 연다: 화면이 떠 있으면 웹이 직접 그 화면으로(새로 불러오지 않고), 아니면 불러오기 */
    fun openInApp(url: String) {
        if (!pageLoaded) {
            web.loadUrl(url)
            return
        }
        val quoted = org.json.JSONObject.quote(url)
        web.evaluateJavascript("(function(u){try{if(window.__cgOpenLink){window.__cgOpenLink(u);return 1}}catch(e){}return 0})($quoted)") { result ->
            if (result != "1") web.loadUrl(url)
        }
    }

    private fun startUrl(intent: Intent?): String = linkFromIntent(intent) ?: (BuildConfig.SITE_ORIGIN + "/")

    /** 알림·공유 링크·다른 앱이 연 가톨릭그램 주소 */
    private fun linkFromIntent(intent: Intent?): String? {
        if (intent == null) return null
        intent.getStringExtra(Notifications.EXTRA_URL)?.let { path ->
            return if (path.startsWith("http")) path else BuildConfig.SITE_ORIGIN + (if (path.startsWith("/")) path else "/$path")
        }
        val data = intent.data ?: return null
        return if (isOurSite(data)) data.toString() else null
    }

    // ---------- 크롬 창(로그인) ----------

    fun openCustomTab(url: String) {
        val colors = CustomTabColorSchemeParams.Builder().setToolbarColor(barColor).build()
        val tab = CustomTabsIntent.Builder()
            .setDefaultColorSchemeParams(colors)
            .setShowTitle(true)
            .build()
        // 크롬이 있으면 크롬 창으로 (구글 로그인은 앱 안 웹뷰에서 막힘), 없으면 기본 브라우저
        if (isInstalled("com.android.chrome")) tab.intent.setPackage("com.android.chrome")
        try {
            tab.launchUrl(this, Uri.parse(url))
        } catch (e: ActivityNotFoundException) {
            openExternal(Uri.parse(url))
        }
    }

    private fun isInstalled(pkg: String): Boolean = try {
        @Suppress("DEPRECATION")
        packageManager.getPackageInfo(pkg, 0)
        true
    } catch (e: Exception) {
        false
    }

    // ---------- 사진·파일 고르기 ----------

    private fun fileIntent(params: WebChromeClient.FileChooserParams): Intent {
        val types = params.acceptTypes.flatMap { it.split(',') }.map { it.trim().lowercase() }.filter { it.isNotEmpty() }
        val mimes = types.map {
            when {
                it.startsWith(".mp3") || it.startsWith(".m4a") || it.startsWith(".aac") || it.startsWith(".wav") || it.startsWith(".ogg") -> "audio/*"
                it.startsWith(".") -> "*/*"
                else -> it
            }
        }.distinct()
        val multiple = params.mode == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE
        val imageOnly = mimes.isNotEmpty() && mimes.all { it.startsWith("image/") }
        val videoOnly = mimes.isNotEmpty() && mimes.all { it.startsWith("video/") }
        val mediaOnly = mimes.isNotEmpty() && mimes.all { it.startsWith("image/") || it.startsWith("video/") }

        // '사진 찍기'(capture): 곧바로 카메라
        if (params.isCaptureEnabled && (imageOnly || videoOnly)) {
            cameraIntent(video = videoOnly)?.let { return it }
        }
        val pick: Intent = if (mediaOnly && isPhotoPickerAvailable()) {
            // 안드로이드 사진 고르기 (사진첩 모양)
            Intent(MediaStore.ACTION_PICK_IMAGES).apply {
                if (imageOnly) type = "image/*" else if (videoOnly) type = "video/*"
                if (multiple) putExtra(MediaStore.EXTRA_PICK_IMAGES_MAX, MediaStore.getPickImagesMaxLimit())
            }
        } else {
            Intent(Intent.ACTION_GET_CONTENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = if (mimes.size == 1) mimes[0] else "*/*"
                if (mimes.size > 1) putExtra(Intent.EXTRA_MIME_TYPES, mimes.toTypedArray())
                putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple)
            }
        }
        if (multiple) pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
        return pick
    }

    private fun isPhotoPickerAvailable(): Boolean =
        ActivityResultContracts.PickVisualMedia.isPhotoPickerAvailable(this) && Build.VERSION.SDK_INT >= 33

    private fun cameraIntent(video: Boolean): Intent? {
        val dir = File(cacheDir, "camera").apply { mkdirs() }
        val file = File(dir, "${if (video) "video" else "photo"}_${System.currentTimeMillis()}.${if (video) "mp4" else "jpg"}")
        val uri = FileProvider.getUriForFile(this, "${packageName}.files", file)
        cameraOutput = uri
        val intent = Intent(if (video) MediaStore.ACTION_VIDEO_CAPTURE else MediaStore.ACTION_IMAGE_CAPTURE)
            .putExtra(MediaStore.EXTRA_OUTPUT, uri)
            .addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
        return if (intent.resolveActivity(packageManager) != null) intent else null.also { cameraOutput = null }
    }

    // ---------- 내려받기 (알림 소리 파일 등) ----------

    private fun downloadFile(url: String, userAgent: String?, contentDisposition: String?, mimeType: String?) {
        val uri = Uri.parse(url)
        if (uri.scheme != "https" && uri.scheme != "http") {
            Toast.makeText(this, R.string.save_failed, Toast.LENGTH_SHORT).show()
            return
        }
        try {
            val name = URLUtil.guessFileName(url, contentDisposition, mimeType)
            val request = DownloadManager.Request(uri)
                .setMimeType(mimeType)
                .addRequestHeader("User-Agent", userAgent ?: "")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name)
            (getSystemService(DOWNLOAD_SERVICE) as DownloadManager).enqueue(request)
            Toast.makeText(this, R.string.download_started, Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            openExternal(uri)
        }
    }

    // ---------- 시계 줄·아래 막대 색 (웹의 '화면 색'에 맞춤) ----------

    fun setBars(color: Int, dark: Boolean) {
        barColor = color
        barDark = dark
        applyBars()
        if (::root.isInitialized) root.setBackgroundColor(color)
    }

    private fun applyBars() {
        val style = if (barDark) SystemBarStyle.dark(barColor) else SystemBarStyle.light(barColor, barColor)
        enableEdgeToEdge(statusBarStyle = style, navigationBarStyle = style)
    }
}
