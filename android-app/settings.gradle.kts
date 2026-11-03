// 가톨릭그램 안드로이드 앱 (하이브리드: 앱 안의 웹뷰로 https://catholicgram-dey7.vercel.app 를 띄움)
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "catholicgram-app"
include(":app")
