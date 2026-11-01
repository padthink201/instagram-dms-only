plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.zurab.dmonly"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.zurab.dmonly"
        minSdk = 26
        targetSdk = 35
        versionCode = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()
        versionName = "1.${System.getenv("GITHUB_RUN_NUMBER") ?: "0"}"
    }

    // Fixed key, so every new build installs as an update (you stay logged in).
    // The key is NOT in the repo: the build workflow writes it from the
    // SIGNING_KEYSTORE_B64 secret. Without it, Android's default debug key is used.
    val signingKeystore = file("signing.keystore")
    if (signingKeystore.exists()) {
        signingConfigs {
            getByName("debug") {
                storeFile = signingKeystore
                storePassword = "android"
                keyAlias = "androiddebugkey"
                keyPassword = "android"
            }
        }
    }

    buildTypes {
        getByName("debug") {
            signingConfig = signingConfigs.getByName("debug")
        }
        getByName("release") {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("debug")
        }
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
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.webkit:webkit:1.12.1")
}
