package com.catholicgram.android

import android.Manifest
import android.content.ClipData
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.util.Base64
import android.webkit.WebView
import android.widget.Toast
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.SecureRandom
import java.util.concurrent.Executors

/**
 * 웹 화면(가톨릭그램 사이트)과 앱이 주고받는 통로.
 * 웹에는 `window.CatholicgramApp` 으로 보이고, 가톨릭그램 주소(SITE_ORIGIN)에서만 열린다.
 * 웹 → 앱: CatholicgramApp.postMessage(JSON.stringify({ id, cmd, ... }))
 * 앱 → 웹: 같은 id 로 답 { id, ok, data | error } (CatholicgramApp.onmessage),
 *          앱이 먼저 알리는 일은 window 의 'cg-native' 이벤트 { type, ... }
 *
 * cmd: info · share · save · openExternal · login · bars · push · clearNotifications
 */
class AppBridge(private val activity: MainActivity) {
    private val io = Executors.newFixedThreadPool(2)
    private val main = Handler(Looper.getMainLooper())
    private val prefs = activity.getSharedPreferences("cg", Context.MODE_PRIVATE)
    private var pendingPush: Pair<JavaScriptReplyProxy, String>? = null
    private var pendingStorage: (() -> Unit)? = null

    fun attach(web: WebView) {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return
        WebViewCompat.addWebMessageListener(web, "CatholicgramApp", setOf(BuildConfig.SITE_ORIGIN)) { _, message, sourceOrigin, isMainFrame, reply ->
            if (!isMainFrame || sourceOrigin.toString().trimEnd('/') != BuildConfig.SITE_ORIGIN) return@addWebMessageListener
            val text = message.data ?: return@addWebMessageListener
            val msg = try { JSONObject(text) } catch (e: Exception) { return@addWebMessageListener }
            handle(msg, reply)
        }
    }

    private fun handle(msg: JSONObject, reply: JavaScriptReplyProxy) {
        val id = msg.optString("id")
        try {
            when (msg.optString("cmd")) {
                "info" -> ok(reply, id, info())
                "openExternal" -> {
                    val url = msg.optString("url")
                    if (url.isNotEmpty()) activity.handleNavigation(Uri.parse(url))
                    ok(reply, id)
                }
                "login" -> {
                    startLogin(msg.optString("provider"), msg.optBoolean("switch"))
                    ok(reply, id)
                }
                "bars" -> {
                    val color = try { Color.parseColor(msg.optString("color")) } catch (e: Exception) { null }
                    if (color != null) activity.setBars(color, msg.optBoolean("dark"))
                    ok(reply, id)
                }
                "share" -> share(msg, reply, id)
                "save" -> save(msg, reply, id)
                "push" -> push(msg.optString("action"), reply, id)
                "clearNotifications" -> {
                    Notifications.clear(activity, msg.optString("tag").ifEmpty { null })
                    ok(reply, id)
                }
                else -> fail(reply, id, "unknown")
            }
        } catch (e: Exception) {
            fail(reply, id, e.message ?: "error")
        }
    }

    private fun ok(reply: JavaScriptReplyProxy, id: String, data: Any? = null) = post(reply, JSONObject().put("id", id).put("ok", true).put("data", data ?: JSONObject.NULL))
    private fun fail(reply: JavaScriptReplyProxy, id: String, error: String) = post(reply, JSONObject().put("id", id).put("ok", false).put("error", error))
    private fun post(reply: JavaScriptReplyProxy, json: JSONObject) {
        main.post { try { reply.postMessage(json.toString()) } catch (e: Exception) { /* 화면이 바뀜 */ } }
    }

    /** 앱이 먼저 웹에 알릴 때 (window 'cg-native' 이벤트) */
    fun emit(type: String, data: JSONObject = JSONObject()) {
        data.put("type", type)
        val js = "window.dispatchEvent(new CustomEvent('cg-native',{detail:${data}}))"
        main.post { activity.web.evaluateJavascript(js, null) }
    }

    fun onPageFinished() {}
    fun onResume() {
        // 휴대폰 설정에서 알림 허용을 바꾸고 돌아왔을 수 있어서
        emit("resume", JSONObject().put("notifications", notificationState()))
    }

    private fun info(): JSONObject = JSONObject()
        .put("version", BuildConfig.VERSION_NAME)
        .put("code", BuildConfig.VERSION_CODE)
        .put("package", activity.packageName)
        .put("model", Build.MODEL ?: "")
        .put("manufacturer", Build.MANUFACTURER ?: "")
        .put("sdk", Build.VERSION.SDK_INT)
        .put("push", BuildConfig.PUSH_ENABLED)
        .put("notifications", notificationState())

    // ---------- 로그인 (크롬 창에서 하고 이 앱으로 돌아옴) ----------

    private fun startLogin(provider: String, switchAccount: Boolean) {
        val p = provider.lowercase().takeIf { it == "kakao" || it == "google" || it == "naver" } ?: return
        val state = ByteArray(18).also { SecureRandom().nextBytes(it) }.let { Base64.encodeToString(it, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING) }
        prefs.edit().putString("loginState", state).putLong("loginAt", System.currentTimeMillis()).apply()
        val url = Uri.parse(BuildConfig.SITE_ORIGIN + "/auth/app-login").buildUpon()
            .appendQueryParameter("provider", p)
            .appendQueryParameter("pkg", activity.packageName)
            .appendQueryParameter("state", state)
            .apply { if (switchAccount) appendQueryParameter("switch", "1") }
            .build()
        activity.openCustomTab(url.toString())
    }

    /**
     * 크롬 창의 로그인이 끝나면 `intent://auth#Intent;scheme=catholicgram;package=이 앱;S.cg_state=…;S.cg_hash=…;end` 로 돌아온다.
     * 그 토큰으로 웹뷰의 /auth/signin-complete 를 열면 웹(supabase)이 이 앱 안에 로그인한다. 맞으면 true
     */
    fun handleLoginReturn(intent: Intent?): Boolean {
        val data = intent?.data ?: return false
        if (data.scheme != "catholicgram" || data.host != "auth") return false
        val state = intent.getStringExtra("cg_state")
        val expected = prefs.getString("loginState", null)
        val startedAt = prefs.getLong("loginAt", 0)
        prefs.edit().remove("loginState").apply()
        if (state == null || expected == null || state != expected || System.currentTimeMillis() - startedAt > 30 * 60 * 1000) {
            Toast.makeText(activity, "로그인을 다시 시도해 주세요", Toast.LENGTH_SHORT).show()
            return true
        }
        val hash = intent.getStringExtra("cg_hash") ?: return true
        // 받은 값 중 로그인에 필요한 것만 골라 다시 만든다 (다른 값이 웹으로 들어가지 않게)
        val parsed = Uri.parse("x://y/?$hash")
        val keys = listOf("access_token", "refresh_token", "expires_in", "expires_at", "token_type", "provider_token", "type")
        val clean = keys.mapNotNull { k -> parsed.getQueryParameter(k)?.let { "$k=${Uri.encode(it)}" } }.joinToString("&")
        if (parsed.getQueryParameter("access_token") == null || parsed.getQueryParameter("refresh_token") == null) return true
        activity.web.loadUrl(BuildConfig.SITE_ORIGIN + "/auth/signin-complete#" + clean)
        return true
    }

    // ---------- 공유하기 (휴대폰 공유 창: 카카오톡·문자 등) ----------

    private fun share(msg: JSONObject, reply: JavaScriptReplyProxy, id: String) {
        val text = listOf(msg.optString("text"), msg.optString("url")).filter { it.isNotBlank() }.joinToString("\n")
        val title = msg.optString("title")
        val files = msg.optJSONArray("files") ?: JSONArray()
        val urls = msg.optJSONArray("urls") ?: JSONArray()
        if (files.length() == 0 && urls.length() == 0) {
            val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text)
            if (title.isNotBlank()) send.putExtra(Intent.EXTRA_SUBJECT, title)
            main.post { activity.startActivity(Intent.createChooser(send, null)) }
            ok(reply, id)
            return
        }
        io.execute {
            try {
                val dir = File(activity.cacheDir, "shared").apply { mkdirs() }
                dir.listFiles()?.forEach { if (System.currentTimeMillis() - it.lastModified() > 60 * 60 * 1000) it.delete() }
                val made = mutableListOf<Pair<Uri, String>>()
                for (i in 0 until files.length()) {
                    val f = files.getJSONObject(i)
                    val mime = f.optString("mime", "application/octet-stream")
                    val file = File(dir, safeName(f.optString("name"), mime))
                    file.writeBytes(Base64.decode(f.getString("data"), Base64.DEFAULT))
                    made.add(FileProvider.getUriForFile(activity, "${activity.packageName}.files", file) to mime)
                }
                for (i in 0 until urls.length()) {
                    val u = urls.getJSONObject(i)
                    val (bytes, mime) = download(u.getString("url"), u.optString("mime"))
                    val file = File(dir, safeName(u.optString("name"), mime))
                    file.writeBytes(bytes)
                    made.add(FileProvider.getUriForFile(activity, "${activity.packageName}.files", file) to mime)
                }
                val send = if (made.size == 1) {
                    Intent(Intent.ACTION_SEND).putExtra(Intent.EXTRA_STREAM, made[0].first).setType(made[0].second)
                } else {
                    Intent(Intent.ACTION_SEND_MULTIPLE).putParcelableArrayListExtra(Intent.EXTRA_STREAM, ArrayList(made.map { it.first }))
                        .setType(if (made.all { it.second.startsWith("image/") }) "image/*" else "*/*")
                }
                if (text.isNotBlank()) send.putExtra(Intent.EXTRA_TEXT, text)
                val clip = ClipData.newRawUri(null, made[0].first)
                made.drop(1).forEach { clip.addItem(ClipData.Item(it.first)) }
                send.clipData = clip
                send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                main.post { activity.startActivity(Intent.createChooser(send, null).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)) }
                ok(reply, id)
            } catch (e: Exception) {
                fail(reply, id, e.message ?: "share")
            }
        }
    }

    // ---------- 사진첩에 저장 ----------

    private fun save(msg: JSONObject, reply: JavaScriptReplyProxy, id: String) {
        if (Build.VERSION.SDK_INT < 29 &&
            ContextCompat.checkSelfPermission(activity, Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            pendingStorage = { save(msg, reply, id) }
            main.post { activity.askStoragePermission.launch(Manifest.permission.WRITE_EXTERNAL_STORAGE) }
            return
        }
        val files = msg.optJSONArray("files") ?: JSONArray()
        val urls = msg.optJSONArray("urls") ?: JSONArray()
        io.execute {
            var saved = 0
            try {
                for (i in 0 until files.length()) {
                    val f = files.getJSONObject(i)
                    val mime = f.optString("mime", "image/png")
                    if (saveToGallery(Base64.decode(f.getString("data"), Base64.DEFAULT), safeName(f.optString("name"), mime), mime)) saved++
                }
                for (i in 0 until urls.length()) {
                    val u = urls.getJSONObject(i)
                    val (bytes, mime) = download(u.getString("url"), u.optString("mime"))
                    if (saveToGallery(bytes, safeName(u.optString("name"), mime), mime)) saved++
                }
                ok(reply, id, JSONObject().put("saved", saved))
            } catch (e: Exception) {
                if (saved > 0) ok(reply, id, JSONObject().put("saved", saved)) else fail(reply, id, e.message ?: "save")
            }
        }
    }

    fun onStoragePermission(granted: Boolean) {
        val job = pendingStorage
        pendingStorage = null
        if (granted) job?.invoke() else Toast.makeText(activity, R.string.save_failed, Toast.LENGTH_SHORT).show()
    }

    private fun saveToGallery(bytes: ByteArray, name: String, mime: String): Boolean {
        val video = mime.startsWith("video/")
        val folder = if (video) Environment.DIRECTORY_MOVIES else Environment.DIRECTORY_PICTURES
        return if (Build.VERSION.SDK_INT >= 29) {
            val resolver = activity.contentResolver
            val values = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, name)
                put(MediaStore.MediaColumns.MIME_TYPE, mime)
                put(MediaStore.MediaColumns.RELATIVE_PATH, "$folder/가톨릭그램")
                put(MediaStore.MediaColumns.IS_PENDING, 1)
            }
            val collection = if (video) MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
            else MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
            val uri = resolver.insert(collection, values) ?: return false
            resolver.openOutputStream(uri)?.use { it.write(bytes) } ?: return false
            values.clear()
            values.put(MediaStore.MediaColumns.IS_PENDING, 0)
            resolver.update(uri, values, null, null)
            true
        } else {
            @Suppress("DEPRECATION")
            val dir = File(Environment.getExternalStoragePublicDirectory(folder), "가톨릭그램").apply { mkdirs() }
            val file = File(dir, name)
            file.writeBytes(bytes)
            MediaScannerConnection.scanFile(activity, arrayOf(file.path), arrayOf(mime), null)
            true
        }
    }

    private fun download(url: String, mimeHint: String): Pair<ByteArray, String> {
        val u = URL(url)
        require(u.protocol == "https") { "https only" }
        val conn = (u.openConnection() as HttpURLConnection).apply {
            connectTimeout = 15000
            readTimeout = 30000
            instanceFollowRedirects = true
        }
        try {
            if (conn.responseCode !in 200..299) throw IllegalStateException("HTTP ${conn.responseCode}")
            val limit = 80L * 1024 * 1024
            if (conn.contentLengthLong > limit) throw IllegalStateException("too large")
            val bytes = conn.inputStream.use { it.readBytes() }
            if (bytes.size > limit) throw IllegalStateException("too large")
            val mime = mimeHint.ifBlank { conn.contentType?.substringBefore(';')?.trim() ?: "application/octet-stream" }
            return bytes to mime
        } finally {
            conn.disconnect()
        }
    }

    private fun safeName(raw: String, mime: String): String {
        val base = raw.replace(Regex("[\\\\/:*?\"<>|\\n\\r]"), "_").trim().take(80)
        val ext = when {
            mime == "image/jpeg" -> "jpg"
            mime == "image/png" -> "png"
            mime == "image/webp" -> "webp"
            mime == "image/gif" -> "gif"
            mime.startsWith("video/") -> "mp4"
            mime == "audio/mpeg" -> "mp3"
            else -> "bin"
        }
        val name = base.ifBlank { "catholicgram_${System.currentTimeMillis()}" }
        return if (name.contains('.')) name else "$name.$ext"
    }

    // ---------- 휴대폰 알림 ----------

    private fun notificationState(): String {
        val enabled = NotificationManagerCompat.from(activity).areNotificationsEnabled()
        if (enabled) return "granted"
        if (Build.VERSION.SDK_INT >= 33 && !prefs.getBoolean("askedNotify", false)) return "default"
        return "denied"
    }

    private fun push(action: String, reply: JavaScriptReplyProxy, id: String) {
        when (action) {
            "status" -> pushToken(reply, id)
            "enable" -> {
                if (Build.VERSION.SDK_INT >= 33 &&
                    ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    pendingPush = reply to id
                    prefs.edit().putBoolean("askedNotify", true).apply()
                    main.post { activity.askNotificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS) }
                } else pushToken(reply, id)
            }
            "settings" -> {
                // 휴대폰 설정 → 이 앱 알림 화면
                val intent = Intent("android.settings.APP_NOTIFICATION_SETTINGS")
                    .putExtra("android.provider.extra.APP_PACKAGE", activity.packageName)
                    .putExtra("app_package", activity.packageName)
                    .putExtra("app_uid", activity.applicationInfo.uid)
                main.post { try { activity.startActivity(intent) } catch (e: Exception) { /* 무시 */ } }
                ok(reply, id)
            }
            else -> fail(reply, id, "unknown")
        }
    }

    fun onNotificationPermission(granted: Boolean) {
        val (reply, id) = pendingPush ?: return
        pendingPush = null
        pushToken(reply, id)
    }

    /** 알림 허용 상태 + 이 휴대폰의 알림 주소(FCM 토큰) */
    private fun pushToken(reply: JavaScriptReplyProxy, id: String) {
        val state = notificationState()
        if (!BuildConfig.PUSH_ENABLED) {
            ok(reply, id, JSONObject().put("notifications", state).put("token", JSONObject.NULL).put("push", false))
            return
        }
        PushService.token { token ->
            ok(reply, id, JSONObject().put("notifications", state).put("token", token ?: JSONObject.NULL).put("push", true))
        }
    }
}
