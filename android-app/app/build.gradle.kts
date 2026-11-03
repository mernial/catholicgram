import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// 휴대폰 알림(Firebase): 운영자가 Firebase 에서 받은 google-services.json 을 이 폴더(app/)에 두면 켜짐.
// 없으면 알림 부분만 꺼진 채로 빌드된다 (GitHub 시험 빌드 등)
val hasFirebase = file("google-services.json").exists()
if (hasFirebase) apply(plugin = "com.google.gms.google-services")

// 서명: 저장소에 넣지 않는 signing.properties(운영자 Mac) 또는 환경 변수
val signing = Properties().apply {
    val f = rootProject.file("signing.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
fun signingValue(env: String, key: String): String? = System.getenv(env) ?: signing.getProperty(key)

android {
    namespace = "com.catholicgram.android"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.catholicgram.android"
        minSdk = 24
        targetSdk = 36
        versionCode = (project.findProperty("versionCode") as String?)?.toInt() ?: 4
        versionName = (project.findProperty("versionName") as String?) ?: "1.1.0"
        buildConfigField("String", "SITE_ORIGIN", "\"https://catholicgram-dey7.vercel.app\"")
        buildConfigField("boolean", "PUSH_ENABLED", hasFirebase.toString())
    }

    signingConfigs {
        create("release") {
            val store = signingValue("CG_KEYSTORE", "storeFile")
            if (store != null) {
                storeFile = file(store)
                storePassword = signingValue("CG_KEYSTORE_PASSWORD", "storePassword")
                keyAlias = signingValue("CG_KEY_ALIAS", "keyAlias")
                keyPassword = signingValue("CG_KEY_PASSWORD", "keyPassword")
            }
        }
    }

    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
            val release = signingConfigs.getByName("release")
            if (release.storeFile != null) signingConfig = release
            resValue("string", "app_name", "가톨릭그램")
        }
        getByName("debug") {
            // 시험판은 이름 끝에 .dev 를 붙여 Play 스토어 앱과 나란히 설치된다
            applicationIdSuffix = ".dev"
            versionNameSuffix = "-dev"
            resValue("string", "app_name", "가톨릭그램 시험")
        }
    }

    buildFeatures {
        buildConfig = true
        resValues = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-ktx:1.10.1")
    // Firebase 가 옛 fragment 를 끌어와 사진 고르기·권한 묻기(registerForActivityResult)가 어긋나지 않게 새 판으로
    implementation("androidx.fragment:fragment-ktx:1.8.5")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.browser:browser:1.8.0")
    implementation("androidx.core:core-splashscreen:1.0.1")
    implementation(platform("com.google.firebase:firebase-bom:33.7.0"))
    implementation("com.google.firebase:firebase-messaging")
}
