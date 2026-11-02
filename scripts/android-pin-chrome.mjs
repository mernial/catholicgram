// Bubblewrap 이 만든 Android 프로젝트(Play 앱)를 고쳐, 기본 브라우저가 삼성 인터넷이어도 크롬이 있으면 크롬으로 열리게 한다.
// 이유: 삼성 인터넷은 알림 위임(notification delegation)이 없어 웹 알림 허용이 저절로 풀렸음(루비로사). 크롬은 앱을 열 때마다
// 사이트 알림 허용을 앱의 안드로이드 알림 허용에 맞춰 준다. 크롬이 없거나 꺼져 있으면 예전처럼 기본 브라우저로.
// 쓰는 법: node scripts/android-pin-chrome.mjs <Bubblewrap 프로젝트 폴더>   (scripts/android-build.sh 가 부름, 여러 번 해도 같음)
// + 휴대폰 알림 기본 소리 '찬미예수님'(운영자 2026-11-02: '기본음으로 찬미 예수님이 기기에서도, 따로 설정하지 않아도') — 아래 3)·4)
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

const dir = process.argv[2];
if (!dir) { console.error('프로젝트 폴더를 알려 주세요'); process.exit(1); }

const find = (root, name) => {
  for (const e of readdirSync(root)) {
    const p = join(root, e);
    if (statSync(p).isDirectory()) { const f = find(p, name); if (f) return f; }
    else if (e === name) return p;
  }
  return null;
};

// 1) LauncherActivity: createTwaLauncher() 를 덮어써 크롬을 고름
const launcher = find(join(dir, 'app/src/main/java'), 'LauncherActivity.java');
if (!launcher) { console.error('LauncherActivity.java 를 찾지 못했어요'); process.exit(1); }
let java = readFileSync(launcher, 'utf8');
const MARK = '// 가톨릭그램: 크롬으로 열기';
if (!java.includes(MARK)) {
  const method = `
    ${MARK} — 삼성 인터넷은 알림 위임이 없어 알림 허용이 저절로 풀렸음. 크롬이 없거나 꺼져 있으면 기본 브라우저로
    private static final String CHROME_PACKAGE = "com.android.chrome";

    @Override
    protected com.google.androidbrowserhelper.trusted.TwaLauncher createTwaLauncher() {
        String chrome = androidx.browser.customtabs.CustomTabsClient.getPackageName(
                this, java.util.Collections.singletonList(CHROME_PACKAGE), true);
        if (CHROME_PACKAGE.equals(chrome)) {
            // 라이브러리(2.7.4) 기본값과 같은 세션·토큰 저장소, 브라우저만 크롬으로
            return new com.google.androidbrowserhelper.trusted.TwaLauncher(this, CHROME_PACKAGE,
                    com.google.androidbrowserhelper.trusted.SessionStore.makeSessionId(getTaskId()),
                    new com.google.androidbrowserhelper.trusted.SharedPreferencesTokenStore(this));
        }
        return super.createTwaLauncher();
    }
`;
  const at = java.indexOf('    @Override\n    protected void onCreate');
  if (at < 0) { console.error('LauncherActivity.java 모양이 예상과 달라요 (onCreate 를 못 찾음)'); process.exit(1); }
  java = java.slice(0, at) + method + '\n' + java.slice(at);
  writeFileSync(launcher, java);
  console.log('✓ 크롬으로 열기 넣음:', launcher);
} else console.log('✓ 크롬으로 열기 이미 있음');

// 2) AndroidManifest: 크롬이 깔려 있는지 볼 수 있게 (안드로이드 11+ 다른 앱 보기 제한)
const manifestPath = join(dir, 'app/src/main/AndroidManifest.xml');
let xml = readFileSync(manifestPath, 'utf8');
if (!xml.includes('<package android:name="com.android.chrome"')) {
  const at = xml.indexOf('<application');
  if (at < 0) { console.error('AndroidManifest.xml 에서 <application 을 못 찾음'); process.exit(1); }
  xml = xml.slice(0, at) + '<queries>\n        <package android:name="com.android.chrome" />\n    </queries>\n\n    ' + xml.slice(at);
  writeFileSync(manifestPath, xml);
  console.log('✓ 크롬 찾기 허용 넣음:', manifestPath);
} else console.log('✓ 크롬 찾기 허용 이미 있음');

// 3) 알림 소리 파일: 앱 안 '찬미예수님'과 같은 파일 (public/sounds/notify/catholicgram-praise.mp3 → res/raw)
const rawDir = join(dir, 'app/src/main/res/raw');
mkdirSync(rawDir, { recursive: true });
copyFileSync(join(REPO, 'public/sounds/notify/catholicgram-praise.mp3'), join(rawDir, 'catholicgram_praise.mp3'));
console.log('✓ 알림 소리 파일 넣음:', join(rawDir, 'catholicgram_praise.mp3'));

// 4) DelegationService: 크롬이 넘겨주는 휴대폰 알림을 모두 '가톨릭그램 알림' 종류(소리 = 찬미예수님) 하나로 보냄.
//    안드로이드는 알림 종류(채널)를 처음 만들 때만 소리를 정할 수 있어서 새 id 로 만들고, 예전(1.0.1)에 크롬 이름으로 만든 종류는 지움.
//    예전 종류에서 교우가 직접 바꿔 둔 소리·중요도(소리 없음·끔 포함)는 새 종류로 옮겨 줌 — 손대지 않은 분만 찬미예수님으로.
const delegation = find(join(dir, 'app/src/main/java'), 'DelegationService.java');
if (!delegation) { console.error('DelegationService.java 를 찾지 못했어요'); process.exit(1); }
let svc = readFileSync(delegation, 'utf8');
const SOUND_MARK = '// 가톨릭그램: 알림 기본 소리 찬미예수님';
if (!svc.includes(SOUND_MARK)) {
  const methods = `
    ${SOUND_MARK} (res/raw/catholicgram_praise.mp3)
    private static final String CG_CHANNEL_ID = "catholicgram_praise_v1";
    private static final String CG_CHANNEL_NAME = "가톨릭그램 알림";

    private android.app.NotificationManager cgManager() {
        return (android.app.NotificationManager) getSystemService(android.content.Context.NOTIFICATION_SERVICE);
    }

    @android.annotation.TargetApi(android.os.Build.VERSION_CODES.O)
    private void cgEnsureChannel(android.app.NotificationManager nm) {
        if (nm.getNotificationChannel(CG_CHANNEL_ID) == null) {
            android.net.Uri sound = android.net.Uri.parse(android.content.ContentResolver.SCHEME_ANDROID_RESOURCE
                    + "://" + getPackageName() + "/" + R.raw.catholicgram_praise);
            int importance = android.app.NotificationManager.IMPORTANCE_DEFAULT;
            for (android.app.NotificationChannel old : nm.getNotificationChannels()) {
                // 예전 종류에서 교우가 바꿔 둔 것은 그대로 옮김
                if (old.getImportance() != android.app.NotificationManager.IMPORTANCE_DEFAULT
                        && old.getImportance() != android.app.NotificationManager.IMPORTANCE_UNSPECIFIED) {
                    importance = old.getImportance();
                }
                android.net.Uri oldSound = old.getSound();
                if (oldSound == null || !oldSound.equals(android.provider.Settings.System.DEFAULT_NOTIFICATION_URI)) {
                    sound = oldSound;
                }
            }
            android.app.NotificationChannel channel = new android.app.NotificationChannel(CG_CHANNEL_ID, CG_CHANNEL_NAME, importance);
            channel.setSound(sound, new android.media.AudioAttributes.Builder()
                    .setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION)
                    .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build());
            nm.createNotificationChannel(channel);
        }
        // 다른 알림 종류(예전에 크롬 이름으로 만든 것)는 지움 — 휴대폰 설정에 쓰지 않는 종류가 남지 않게
        for (android.app.NotificationChannel other : nm.getNotificationChannels()) {
            if (!CG_CHANNEL_ID.equals(other.getId())) nm.deleteNotificationChannel(other.getId());
        }
    }

    @android.annotation.SuppressLint("MissingPermission")
    @android.annotation.TargetApi(android.os.Build.VERSION_CODES.O) // 26 아래는 첫 줄에서 예전 그대로(super)
    @Override
    public boolean onNotifyNotificationWithChannel(String platformTag, int platformId,
            android.app.Notification notification, String channelName) {
        android.app.NotificationManager nm = cgManager();
        if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.O || nm == null) {
            return super.onNotifyNotificationWithChannel(platformTag, platformId, notification, channelName);
        }
        if (!nm.areNotificationsEnabled()) return false;
        cgEnsureChannel(nm);
        android.app.NotificationChannel channel = nm.getNotificationChannel(CG_CHANNEL_ID);
        if (channel != null && channel.getImportance() == android.app.NotificationManager.IMPORTANCE_NONE) return false;
        android.app.Notification.Builder builder = android.app.Notification.Builder.recoverBuilder(this, notification);
        builder.setChannelId(CG_CHANNEL_ID);
        if (notification.getGroupAlertBehavior() == android.app.Notification.GROUP_ALERT_SUMMARY) {
            builder.setGroupAlertBehavior(android.app.Notification.GROUP_ALERT_ALL);
        }
        nm.notify(platformTag, platformId, builder.build());
        return true;
    }

    @android.annotation.TargetApi(android.os.Build.VERSION_CODES.O)
    @Override
    public boolean onAreNotificationsEnabled(String channelName) {
        android.app.NotificationManager nm = cgManager();
        if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.O || nm == null) {
            return super.onAreNotificationsEnabled(channelName);
        }
        if (!nm.areNotificationsEnabled()) return false;
        cgEnsureChannel(nm); // 업데이트 뒤 처음 묻는 때도 예전 종류(꺼 둔 것 포함)를 옮겨 놓고 답함
        android.app.NotificationChannel channel = nm.getNotificationChannel(CG_CHANNEL_ID);
        return channel == null || channel.getImportance() != android.app.NotificationManager.IMPORTANCE_NONE;
    }
`;
  const at = svc.lastIndexOf('}');
  if (at < 0) { console.error('DelegationService.java 모양이 예상과 달라요'); process.exit(1); }
  svc = svc.slice(0, at) + methods + svc.slice(at);
  writeFileSync(delegation, svc);
  console.log('✓ 알림 기본 소리(찬미예수님) 넣음:', delegation);
} else console.log('✓ 알림 기본 소리 이미 있음');
