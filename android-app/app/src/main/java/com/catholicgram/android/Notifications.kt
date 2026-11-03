package com.catholicgram.android

import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ContentResolver
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONArray

/**
 * 휴대폰 알림: 채널 하나('가톨릭그램 알림', 소리 = 찬미예수님 — Play 앱 1.0.2 와 같은 채널 id 라 교우가 바꿔 둔 소리·끔은 그대로),
 * 같은 tag 의 알림은 하나로 합침(웹 sw.js combined() 와 같은 방식: 제목에 개수, 최근 다섯 줄).
 */
object Notifications {
    const val CHANNEL_ID = "catholicgram_praise_v1"
    const val EXTRA_URL = "cg_url"
    private const val PREFS = "cg_notify"

    fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < 26) return
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return
        val sound = Uri.parse("${ContentResolver.SCHEME_ANDROID_RESOURCE}://${context.packageName}/${R.raw.catholicgram_praise}")
        val channel = NotificationChannel(CHANNEL_ID, context.getString(R.string.channel_name), NotificationManager.IMPORTANCE_HIGH).apply {
            description = context.getString(R.string.channel_desc)
            setSound(sound, AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build())
            enableVibration(true)
            lightColor = Color.parseColor("#D9AA4B")
        }
        manager.createNotificationChannel(channel)
    }

    /** 알림 띄우기 (같은 tag 면 합침) */
    @SuppressLint("MissingPermission")
    fun show(context: Context, title: String, body: String, url: String, tag: String?, groupTitle: String?, groupUrl: String?) {
        ensureChannel(context)
        val manager = NotificationManagerCompat.from(context)
        if (!manager.areNotificationsEnabled()) return
        val key = tag?.takeIf { it.isNotBlank() } ?: "cg-${System.currentTimeMillis()}"
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val lines = try { JSONArray(prefs.getString("lines:$key", "[]")) } catch (e: Exception) { JSONArray() }
        val urls = try { JSONArray(prefs.getString("urls:$key", "[]")) } catch (e: Exception) { JSONArray() }
        val active = manager.activeNotifications.any { it.tag == key }
        if (!active) { while (lines.length() > 0) lines.remove(0); while (urls.length() > 0) urls.remove(0) }
        lines.put(if (groupTitle != null) "$title · $body" else body)
        urls.put(url)
        prefs.edit().putString("lines:$key", lines.toString()).putString("urls:$key", urls.toString()).apply()
        val count = lines.length()
        val distinctUrls = (0 until urls.length()).map { urls.getString(it) }.distinct()
        val shownTitle = when {
            count <= 1 -> title
            groupTitle != null -> "$groupTitle ${count}개"
            else -> "$title ($count)"
        }
        val openUrl = if (count > 1 && distinctUrls.size > 1 && groupUrl != null) groupUrl else url
        val intent = Intent(context, MainActivity::class.java)
            .putExtra(EXTRA_URL, openUrl)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        val pending = PendingIntent.getActivity(context, key.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val builder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_cg)
            .setColor(Color.parseColor("#101A3F"))
            .setContentTitle(shownTitle)
            .setContentText(if (count <= 1) body else lines.getString(count - 1))
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(pending)
            .setOnlyAlertOnce(false)
        if (count > 1) {
            val style = NotificationCompat.InboxStyle()
            for (i in count - 1 downTo maxOf(0, count - 5)) style.addLine(lines.getString(i))
            builder.setStyle(style).setNumber(count)
        } else {
            builder.setStyle(NotificationCompat.BigTextStyle().bigText(body))
        }
        manager.notify(key, 1, builder.build())
    }

    /** 이미 확인한 알림 지우기 (tag 없으면 모두) */
    fun clear(context: Context, tag: String?) {
        val manager = NotificationManagerCompat.from(context)
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
        if (tag == null) {
            manager.cancelAll()
            prefs.clear()
        } else {
            manager.cancel(tag, 1)
            prefs.remove("lines:$tag").remove("urls:$tag")
        }
        prefs.apply()
    }
}
