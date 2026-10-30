// Bubblewrap 이 만든 Android 프로젝트(Play 앱)를 고쳐, 기본 브라우저가 삼성 인터넷이어도 크롬이 있으면 크롬으로 열리게 한다.
// 이유: 삼성 인터넷은 알림 위임(notification delegation)이 없어 웹 알림 허용이 저절로 풀렸음(루비로사). 크롬은 앱을 열 때마다
// 사이트 알림 허용을 앱의 안드로이드 알림 허용에 맞춰 준다. 크롬이 없거나 꺼져 있으면 예전처럼 기본 브라우저로.
// 쓰는 법: node scripts/android-pin-chrome.mjs <Bubblewrap 프로젝트 폴더>   (scripts/android-build.sh 가 부름, 여러 번 해도 같음)
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

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
            return new com.google.androidbrowserhelper.trusted.TwaLauncher(this, CHROME_PACKAGE);
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
