package com.catholicgram.android

import android.content.Context
import android.os.Handler
import android.os.Looper
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import org.json.JSONObject

/**
 * 휴대폰 알림 받기 (Firebase Cloud Messaging).
 * 서버(/api/push/notify 등)가 '데이터 메시지'로 보냄: title · body · url · tag · group_title · group_url
 * - 앱이 화면에 떠 있으면 휴대폰 알림 대신 웹 화면에 알려 앱 안 배너·소리로 (웹 sw.js 의 push-alert 와 같은 길)
 * - 아니면 휴대폰 알림 (같은 tag 는 합침, 소리 = 찬미예수님 채널)
 * google-services.json 이 없는 빌드(PUSH_ENABLED=false)에서는 아무 일도 하지 않는다.
 */
class PushService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        getSharedPreferences("cg", Context.MODE_PRIVATE).edit().putString("fcmToken", token).apply()
        foreground()?.let { activity ->
            Handler(Looper.getMainLooper()).post {
                activity.bridgeEmit("push-token", JSONObject().put("token", token))
            }
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val d = message.data
        val title = d["title"] ?: message.notification?.title ?: "가톨릭그램"
        val body = d["body"] ?: message.notification?.body ?: ""
        val url = d["url"] ?: "/"
        val tag = d["tag"]
        val activity = foreground()
        if (activity != null) {
            Handler(Looper.getMainLooper()).post {
                activity.bridgeEmit("push", JSONObject().put("title", title).put("body", body).put("url", url).put("tag", tag ?: ""))
            }
            return
        }
        Notifications.show(this, title, body, url, tag, d["group_title"], d["group_url"])
    }

    companion object {
        /** 지금 화면에 떠 있는 앱 화면 (없으면 null) — 화면을 붙잡아 두지 않게 약한 참조로 */
        @Volatile
        private var foregroundRef: java.lang.ref.WeakReference<MainActivity>? = null
        fun foreground(): MainActivity? = foregroundRef?.get()
        fun setForeground(activity: MainActivity?) { foregroundRef = activity?.let { java.lang.ref.WeakReference(it) } }

        /** 이 휴대폰의 알림 주소(토큰) — Firebase 가 없거나 못 받으면 null */
        fun token(done: (String?) -> Unit) {
            if (!BuildConfig.PUSH_ENABLED) { done(null); return }
            try {
                FirebaseMessaging.getInstance().token
                    .addOnSuccessListener { done(it) }
                    .addOnFailureListener { done(null) }
            } catch (e: Exception) {
                done(null)
            }
        }
    }
}
