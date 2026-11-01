package com.zurab.dmonly

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

data class Release(val build: Long, val apkUrl: String, val pageUrl: String)

/** Asks GitHub for the newest release (tag "build-N" with an .apk attached). */
object Updater {
    private const val API =
        "https://api.github.com/repos/padthink201/instagram-dms-only/releases/latest"

    fun fetchLatest(): Release? = try {
        val conn = (URL(API).openConnection() as HttpURLConnection).apply {
            connectTimeout = 8000
            readTimeout = 8000
            setRequestProperty("Accept", "application/vnd.github+json")
            setRequestProperty("User-Agent", "DMs-app")
        }
        try {
            if (conn.responseCode != 200) {
                null
            } else {
                val json = JSONObject(conn.inputStream.bufferedReader().use { it.readText() })
                val build = json.optString("tag_name").removePrefix("build-").toLongOrNull()
                var apk: String? = null
                val assets = json.optJSONArray("assets")
                if (assets != null) {
                    for (i in 0 until assets.length()) {
                        val a = assets.getJSONObject(i)
                        if (a.optString("name").endsWith(".apk")) {
                            apk = a.optString("browser_download_url")
                            break
                        }
                    }
                }
                val apkUrl = apk
                if (build == null || apkUrl.isNullOrEmpty()) null
                else Release(build, apkUrl, json.optString("html_url", MainActivity.REPO_URL))
            }
        } finally {
            conn.disconnect()
        }
    } catch (e: Exception) {
        null
    }
}
