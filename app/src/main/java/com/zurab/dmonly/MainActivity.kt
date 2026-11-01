package com.zurab.dmonly

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.DownloadManager
import android.content.ActivityNotFoundException
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.os.Message
import android.provider.Settings
import android.text.format.DateFormat
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.view.WindowManager
import android.view.animation.DecelerateInterpolator
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.addCallback
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.result.contract.ActivityResultContracts.PickVisualMedia
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.core.content.pm.PackageInfoCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import java.io.File
import java.util.Date
import kotlin.concurrent.thread

class MainActivity : ComponentActivity() {

    companion object {
        const val START_URL = "https://www.instagram.com/direct/inbox/"
        const val REPO_URL = "https://github.com/padthink201/instagram-dms-only"
        const val ACTION_CHECK_UPDATE = "com.zurab.dmonly.CHECK_UPDATE"
        const val ACTION_TOGGLE_DESKTOP = "com.zurab.dmonly.TOGGLE_DESKTOP"
        private val INSTAGRAM_ORIGINS = setOf("https://www.instagram.com", "https://instagram.com")
        private const val UPDATE_FILE = "DMs-update.apk"
        private const val SNAPSHOT_EVERY_MS = 45_000L
    }

    private lateinit var root: FrameLayout
    private lateinit var webView: WebView
    private lateinit var guardScript: String
    private lateinit var prefs: SharedPreferences
    private var docStartInjection = false
    private var defaultUserAgent: String? = null
    private val handler = Handler(Looper.getMainLooper())

    // Small floating chips (offline status, update)
    private lateinit var chips: LinearLayout
    private lateinit var statusChip: TextView
    private lateinit var updateChip: LinearLayout
    private lateinit var updateLabel: TextView
    private lateinit var updateAction: TextView

    // Calls open in a pop-up window
    private var popup: WebView? = null

    // Files / permissions / full-screen video
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var pendingPermission: PermissionRequest? = null
    private var customView: View? = null
    private var customViewCallback: WebChromeClient.CustomViewCallback? = null

    // Offline copy of the last chat screen
    private val archiveFile by lazy { File(filesDir, "last-chats.mht") }
    private val archiveTmp by lazy { File(filesDir, "last-chats.tmp.mht") }
    private var showingArchive = false
    private var offline = false
    private var networkCallback: ConnectivityManager.NetworkCallback? = null

    // Updates
    private var latest: Release? = null
    private var downloadId = -1L
    private var downloadedReady = false

    // ---------------------------------------------------------------- pickers / permissions

    private val pickOne =
        registerForActivityResult(PickVisualMedia()) { uri ->
            deliverFiles(uri?.let { arrayOf(it) })
        }
    private val pickMany =
        registerForActivityResult(ActivityResultContracts.PickMultipleVisualMedia()) { uris ->
            deliverFiles(if (uris.isEmpty()) null else uris.toTypedArray())
        }
    private val fileChooser =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val data = result.data
            val uris: Array<Uri>? = if (result.resultCode == Activity.RESULT_OK && data != null) {
                val clip = data.clipData
                when {
                    clip != null -> Array(clip.itemCount) { clip.getItemAt(it).uri }
                    data.data != null -> arrayOf(data.data!!)
                    else -> null
                }
            } else null
            deliverFiles(uris)
        }

    private fun deliverFiles(uris: Array<Uri>?) {
        fileCallback?.onReceiveValue(uris)
        fileCallback = null
    }

    private val permissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
            pendingPermission?.let { resolvePermission(it) }
            pendingPermission = null
        }

    // ---------------------------------------------------------------- lifecycle

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = getSharedPreferences("dmonly", MODE_PRIVATE)
        guardScript = assets.open("dmonly.js").bufferedReader().use { it.readText() }

        root = FrameLayout(this)
        root.setBackgroundColor(Color.BLACK)
        webView = WebView(this)
        root.addView(webView, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
        buildChips()
        setContentView(root)

        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime()
            )
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }

        CookieManager.getInstance().setAcceptCookie(true)
        configureWebView(webView)

        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(webView, guardScript, INSTAGRAM_ORIGINS)
            docStartInjection = true
        }

        webView.webViewClient = MainClient()
        webView.webChromeClient = Chrome()

        onBackPressedDispatcher.addCallback(this) { onBack() }

        ContextCompat.registerReceiver(
            this, downloadReceiver,
            IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE),
            ContextCompat.RECEIVER_EXPORTED
        )
        registerNetworkCallback()

        offline = !isOnline()
        when {
            savedInstanceState != null && webView.restoreState(savedInstanceState) != null -> Unit
            offline && archiveFile.exists() -> loadArchive()
            else -> webView.loadUrl(START_URL)
        }
        if (offline && !showingArchive) showStatus("Offline")

        checkForUpdates(manual = intent?.action == ACTION_CHECK_UPDATE)
        if (intent?.action == ACTION_TOGGLE_DESKTOP) toggleDesktopMode()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        when (intent.action) {
            ACTION_CHECK_UPDATE -> checkForUpdates(manual = true)
            ACTION_TOGGLE_DESKTOP -> toggleDesktopMode()
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
        handler.removeCallbacks(snapshotTask)
        handler.postDelayed(snapshotTask, SNAPSHOT_EVERY_MS)
        onNetworkChanged()
    }

    override fun onPause() {
        saveSnapshot()
        handler.removeCallbacks(snapshotTask)
        // Keep a running call alive in the background.
        if (popup?.visibility != View.VISIBLE) webView.onPause()
        CookieManager.getInstance().flush()
        super.onPause()
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        try { unregisterReceiver(downloadReceiver) } catch (_: Exception) {}
        networkCallback?.let {
            try { getSystemService(ConnectivityManager::class.java)?.unregisterNetworkCallback(it) } catch (_: Exception) {}
        }
        closePopup()
        webView.destroy()
        super.onDestroy()
    }

    private fun onBack() {
        if (customView != null) { hideCustomView(); return }
        val p = popup
        if (p != null) {
            if (p.visibility == View.VISIBLE) moveTaskToBack(true) // call keeps running
            else closePopup()
            return
        }
        if (showingArchive) { moveTaskToBack(true); return }
        webView.evaluateJavascript(
            "(window.__dmonlyBack ? window.__dmonlyBack() : 'history')"
        ) { result ->
            when (result?.trim('"')) {
                "handled" -> Unit
                "exit" -> moveTaskToBack(true)
                else -> if (webView.canGoBack()) webView.goBack() else moveTaskToBack(true)
            }
        }
    }

    // ---------------------------------------------------------------- WebView setup

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView(wv: WebView) {
        CookieManager.getInstance().setAcceptThirdPartyCookies(wv, true)
        wv.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            javaScriptCanOpenWindowsAutomatically = true
            setSupportMultipleWindows(true) // calls open in a new window
            allowFileAccess = true          // for the offline copy
            if (defaultUserAgent == null) defaultUserAgent = userAgentString
            userAgentString = userAgentFor(desktopMode())
        }
    }

    private fun desktopMode(): Boolean = prefs.getBoolean("desktop_mode", false)

    /**
     * Phone mode: looks like mobile Chrome.
     * Desktop mode: looks like Chrome on a computer, so Instagram shows its desktop
     * features (like call buttons). Experimental.
     */
    private fun userAgentFor(desktop: Boolean): String {
        val base = (defaultUserAgent ?: "")
            .replace("; wv", "")
            .replace(Regex("Version/[\\d.]+ "), "")
        if (!desktop) return base
        return base
            .replace(Regex("\\(Linux; Android[^)]*\\)"), "(X11; Linux x86_64)")
            .replace(" Mobile", "")
    }

    private fun toggleDesktopMode() {
        val on = !desktopMode()
        prefs.edit().putBoolean("desktop_mode", on).apply()
        webView.settings.userAgentString = userAgentFor(on)
        popup?.settings?.userAgentString = userAgentFor(on)
        toast(if (on) "Desktop mode ON (for calls)" else "Desktop mode OFF")
        webView.loadUrl(START_URL)
    }

    private inner class MainClient : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            if (!request.isForMainFrame) return false
            return handleNavigation(request.url)
        }

        override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
            super.onPageStarted(view, url, favicon)
            showingArchive = url?.startsWith("file:") == true
            if (!docStartInjection && isInstagramUrl(url)) view.evaluateJavascript(guardScript, null)
        }

        override fun onPageFinished(view: WebView, url: String?) {
            super.onPageFinished(view, url)
            if (!docStartInjection && isInstagramUrl(url)) view.evaluateJavascript(guardScript, null)
            CookieManager.getInstance().flush()
            if (isInstagramUrl(url)) handler.postDelayed({ saveSnapshot() }, 4000)
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (request.isForMainFrame && !isOnline() && archiveFile.exists()) loadArchive()
        }
    }

    /** true = handled here, don't load it in the WebView. */
    private fun handleNavigation(uri: Uri): Boolean {
        val scheme = uri.scheme?.lowercase()
        // Never jump into the real Instagram app (instagram://, intent://) or follow file links.
        if (scheme != "http" && scheme != "https") return true
        if (isInstagramHost(uri.host)) return false
        openExternal(uri)
        return true
    }

    private fun openExternal(uri: Uri) {
        try { startActivity(Intent(Intent.ACTION_VIEW, uri)) } catch (_: ActivityNotFoundException) {}
    }

    private fun isInstagramHost(host: String?): Boolean =
        host != null && (host == "instagram.com" || host.endsWith(".instagram.com"))

    private fun isInstagramUrl(url: String?): Boolean =
        url != null && isInstagramHost(Uri.parse(url).host)

    // ---------------------------------------------------------------- Chrome client

    private inner class Chrome : WebChromeClient() {
        override fun onShowFileChooser(
            view: WebView,
            callback: ValueCallback<Array<Uri>>,
            params: FileChooserParams
        ): Boolean {
            fileCallback?.onReceiveValue(null)
            fileCallback = callback
            return try {
                val media = galleryTypeFor(params)
                val multiple = params.mode == FileChooserParams.MODE_OPEN_MULTIPLE
                when {
                    media == null -> fileChooser.launch(buildPickerIntent(params))
                    multiple -> pickMany.launch(PickVisualMediaRequest(media))
                    else -> pickOne.launch(PickVisualMediaRequest(media))
                }
                true
            } catch (e: ActivityNotFoundException) {
                fileCallback = null
                false
            }
        }

        override fun onPermissionRequest(request: PermissionRequest) {
            if (!isInstagramHost(request.origin.host)) {
                request.deny()
                return
            }
            val missing = androidPermissionsFor(request).filter { !hasPermission(it) }
            if (missing.isEmpty()) {
                resolvePermission(request)
            } else {
                pendingPermission?.deny()
                pendingPermission = request
                permissionLauncher.launch(missing.toTypedArray())
            }
        }

        // Calls (and target=_blank links) open a new window.
        override fun onCreateWindow(
            view: WebView, isDialog: Boolean, isUserGesture: Boolean, resultMsg: Message
        ): Boolean {
            closePopup()
            val p = WebView(this@MainActivity)
            configureWebView(p)
            p.webViewClient = PopupClient()
            p.webChromeClient = this
            p.visibility = View.GONE
            root.addView(p, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
            chips.bringToFront()
            popup = p
            val transport = resultMsg.obj as WebView.WebViewTransport
            transport.webView = p
            resultMsg.sendToTarget()
            return true
        }

        override fun onCloseWindow(window: WebView) {
            if (window == popup) closePopup()
        }

        override fun onShowCustomView(view: View, callback: CustomViewCallback) {
            if (customView != null) {
                callback.onCustomViewHidden()
                return
            }
            customView = view
            customViewCallback = callback
            root.addView(view, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
            webView.visibility = View.GONE
        }

        override fun onHideCustomView() {
            hideCustomView()
        }
    }

    // ---------------------------------------------------------------- calls (pop-up window)

    private inner class PopupClient : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
            if (request.isForMainFrame) routePopup(request.url) else false

        override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
            super.onPageStarted(view, url, favicon)
            if (url != null) routePopup(Uri.parse(url))
        }
    }

    /** Decide what a new window is: a call (show it), another site, or a normal Instagram page. */
    private fun routePopup(uri: Uri): Boolean {
        val scheme = uri.scheme?.lowercase()
        if (scheme == "about" || scheme == "data" || scheme == "blob") return false
        if (scheme != "http" && scheme != "https") {
            handler.post { closePopup() }
            return true
        }
        if (!isInstagramHost(uri.host)) {
            openExternal(uri)
            handler.post { closePopup() }
            return true
        }
        val path = uri.path?.lowercase() ?: ""
        if (path.contains("call") || path.contains("rtc")) {
            showPopup()
            return false
        }
        // Normal Instagram page: open it in the main view, where the rules apply.
        val target = uri.toString()
        handler.post {
            closePopup()
            webView.loadUrl(target)
        }
        return true
    }

    private fun showPopup() {
        val p = popup ?: return
        if (p.visibility == View.VISIBLE) return
        p.showAnimated(fromY = 40f)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

    private fun closePopup() {
        val p = popup ?: return
        popup = null
        root.removeView(p)
        handler.post { p.destroy() }
        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

    // ---------------------------------------------------------------- offline copy

    private val snapshotTask = object : Runnable {
        override fun run() {
            saveSnapshot()
            handler.postDelayed(this, SNAPSHOT_EVERY_MS)
        }
    }

    /** Saves the current chat screen so it can be shown when there's no internet. */
    private fun saveSnapshot() {
        if (showingArchive || !isOnline()) return
        val url = webView.url ?: return
        val uri = Uri.parse(url)
        if (!isInstagramHost(uri.host) || uri.path?.startsWith("/direct/") != true) return
        webView.saveWebArchive(archiveTmp.absolutePath, false) { saved ->
            if (saved != null && archiveTmp.exists() && archiveTmp.length() > 0) {
                if (archiveTmp.renameTo(archiveFile)) {
                    prefs.edit().putLong("snapshot_time", System.currentTimeMillis()).apply()
                }
            }
        }
    }

    private fun loadArchive() {
        if (!archiveFile.exists()) return
        showingArchive = true
        webView.loadUrl(Uri.fromFile(archiveFile).toString())
        val t = prefs.getLong("snapshot_time", 0L)
        val time = if (t > 0) DateFormat.getTimeFormat(this).format(Date(t)) else "earlier"
        showStatus("Offline · saved copy from $time")
    }

    private fun isOnline(): Boolean {
        val cm = getSystemService(ConnectivityManager::class.java) ?: return true
        val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }

    private fun registerNetworkCallback() {
        val cm = getSystemService(ConnectivityManager::class.java) ?: return
        val cb = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) { handler.postDelayed({ onNetworkChanged() }, 600) }
            override fun onLost(network: Network) { handler.postDelayed({ onNetworkChanged() }, 600) }
            override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
                handler.postDelayed({ onNetworkChanged() }, 600)
            }
        }
        try {
            cm.registerDefaultNetworkCallback(cb)
            networkCallback = cb
        } catch (_: Exception) {}
    }

    private fun onNetworkChanged() {
        val nowOffline = !isOnline()
        if (nowOffline == offline) return
        offline = nowOffline
        if (offline) {
            // The page that's already open stays on screen with everything it loaded.
            if (!showingArchive) showStatus("Offline · showing what was already loaded")
        } else {
            hideStatus()
            if (showingArchive) webView.loadUrl(START_URL)
        }
    }

    // ---------------------------------------------------------------- updates

    private fun installedBuild(): Long =
        PackageInfoCompat.getLongVersionCode(packageManager.getPackageInfo(packageName, 0))

    private fun checkForUpdates(manual: Boolean) {
        if (manual) toast("Checking for updates…")
        thread {
            val r = Updater.fetchLatest()
            runOnUiThread {
                if (isFinishing || isDestroyed) return@runOnUiThread
                val mine = installedBuild()
                when {
                    r == null -> if (manual) toast("Couldn't check for updates")
                    r.build > mine -> {
                        latest = r
                        downloadedReady = false
                        updateLabel.text = "New version · build ${r.build}"
                        updateAction.text = "Update"
                        updateAction.isEnabled = true
                        updateChip.showAnimated()
                    }
                    else -> if (manual) toast("You're on the latest version (build $mine)")
                }
            }
        }
    }

    private fun onUpdateTapped() {
        if (downloadedReady) installUpdate() else startDownload()
    }

    private fun startDownload() {
        val r = latest ?: return
        if (!packageManager.canRequestPackageInstalls()) {
            toast("Allow \"Install unknown apps\" for DMs, then tap Update again")
            try {
                startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName")))
            } catch (_: ActivityNotFoundException) {}
            return
        }
        val dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: return
        File(dir, UPDATE_FILE).delete()
        val dm = getSystemService(DownloadManager::class.java) ?: return
        val req = DownloadManager.Request(Uri.parse(r.apkUrl))
            .setTitle("DMs update")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_HIDDEN)
            .setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, UPDATE_FILE)
        downloadId = dm.enqueue(req)
        updateAction.text = "Downloading…"
        updateAction.isEnabled = false
    }

    private val downloadReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L)
            if (id == -1L || id != downloadId) return
            val dm = getSystemService(DownloadManager::class.java) ?: return
            var ok = false
            dm.query(DownloadManager.Query().setFilterById(id))?.use { c ->
                if (c.moveToFirst()) {
                    ok = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS)) ==
                        DownloadManager.STATUS_SUCCESSFUL
                }
            }
            updateAction.isEnabled = true
            if (ok) {
                downloadedReady = true
                updateAction.text = "Install"
                installUpdate()
            } else {
                updateAction.text = "Retry"
                toast("Download failed")
            }
        }
    }

    private fun installUpdate() {
        val dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: return
        val file = File(dir, UPDATE_FILE)
        if (!file.exists()) {
            downloadedReady = false
            startDownload()
            return
        }
        val uri = FileProvider.getUriForFile(this, "$packageName.files", file)
        try {
            startActivity(
                Intent(Intent.ACTION_VIEW)
                    .setDataAndType(uri, "application/vnd.android.package-archive")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
            )
        } catch (_: ActivityNotFoundException) {
            toast("Couldn't open the installer")
        }
    }

    // ---------------------------------------------------------------- chips UI (compact)

    private fun dp(v: Int): Int =
        TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics).toInt()

    private fun pill(): GradientDrawable = GradientDrawable().apply {
        cornerRadius = dp(18).toFloat()
        setColor(0xF0202020.toInt())
    }

    private fun chipText(text: String, color: Int = Color.WHITE, bold: Boolean = false) =
        TextView(this).apply {
            this.text = text
            setTextColor(color)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
            if (bold) typeface = Typeface.DEFAULT_BOLD
            setPadding(dp(10), dp(7), dp(10), dp(7))
        }

    private fun buildChips() {
        chips = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
        }
        root.addView(
            chips,
            FrameLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT, Gravity.TOP or Gravity.CENTER_HORIZONTAL)
                .apply { topMargin = dp(6) }
        )

        statusChip = chipText("").apply {
            background = pill()
            elevation = dp(4).toFloat()
            setPadding(dp(14), dp(7), dp(14), dp(7))
            visibility = View.GONE
        }
        chips.addView(statusChip, LinearLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT).apply { bottomMargin = dp(6) })

        updateLabel = chipText("New version").apply {
            // Tapping the label opens the GitHub release page (what's new).
            setOnClickListener { openExternal(Uri.parse(latest?.pageUrl ?: REPO_URL)) }
        }
        updateAction = chipText("Update", color = 0xFF8AB4FF.toInt(), bold = true).apply {
            setOnClickListener { onUpdateTapped() }
        }
        val close = chipText("✕", color = 0xFFAAAAAA.toInt()).apply {
            setOnClickListener { updateChip.hideAnimated() }
        }
        updateChip = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            background = pill()
            elevation = dp(4).toFloat()
            setPadding(dp(4), 0, dp(4), 0)
            visibility = View.GONE
            addView(updateLabel)
            addView(updateAction)
            addView(close)
        }
        chips.addView(updateChip, LinearLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT))
    }

    private fun showStatus(text: String) {
        statusChip.text = text
        statusChip.showAnimated()
    }

    private fun hideStatus() = statusChip.hideAnimated()

    private fun View.showAnimated(fromY: Float = -10f) {
        if (visibility == View.VISIBLE) return
        alpha = 0f
        translationY = fromY * resources.displayMetrics.density
        visibility = View.VISIBLE
        animate().alpha(1f).translationY(0f).setDuration(220)
            .setInterpolator(DecelerateInterpolator()).start()
    }

    private fun View.hideAnimated() {
        if (visibility != View.VISIBLE) return
        animate().alpha(0f).translationY(-10f * resources.displayMetrics.density).setDuration(180)
            .withEndAction { visibility = View.GONE }.start()
    }

    private fun toast(msg: String) = Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()

    // ---------------------------------------------------------------- helpers

    private fun acceptTypes(params: WebChromeClient.FileChooserParams): List<String> =
        params.acceptTypes
            .flatMap { it.split(",") }
            .map { it.trim().lowercase() }
            .filter { it.isNotEmpty() }

    /** Which gallery to show, or null if the page wants non-media files. */
    private fun galleryTypeFor(params: WebChromeClient.FileChooserParams): PickVisualMedia.VisualMediaType? {
        val types = acceptTypes(params)
        if (types.isEmpty()) return PickVisualMedia.ImageAndVideo
        val isImage = { t: String -> t.startsWith("image/") || t in setOf(".jpg", ".jpeg", ".png", ".heic", ".webp", ".gif") }
        val isVideo = { t: String -> t.startsWith("video/") || t in setOf(".mp4", ".mov", ".m4v", ".webm") }
        return when {
            types.all(isImage) -> PickVisualMedia.ImageOnly
            types.all(isVideo) -> PickVisualMedia.VideoOnly
            types.all { isImage(it) || isVideo(it) } -> PickVisualMedia.ImageAndVideo
            else -> null
        }
    }

    private fun buildPickerIntent(params: WebChromeClient.FileChooserParams): Intent {
        val types = acceptTypes(params).ifEmpty { listOf("*/*") }
        return Intent(Intent.ACTION_GET_CONTENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = if (types.size == 1) types[0] else "*/*"
            if (types.size > 1) putExtra(Intent.EXTRA_MIME_TYPES, types.toTypedArray())
            if (params.mode == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE) {
                putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
            }
        }
    }

    private fun androidPermissionsFor(request: PermissionRequest): List<String> =
        request.resources.mapNotNull {
            when (it) {
                PermissionRequest.RESOURCE_AUDIO_CAPTURE -> Manifest.permission.RECORD_AUDIO
                PermissionRequest.RESOURCE_VIDEO_CAPTURE -> Manifest.permission.CAMERA
                else -> null
            }
        }

    private fun resolvePermission(request: PermissionRequest) {
        val granted = request.resources.filter {
            when (it) {
                PermissionRequest.RESOURCE_AUDIO_CAPTURE -> hasPermission(Manifest.permission.RECORD_AUDIO)
                PermissionRequest.RESOURCE_VIDEO_CAPTURE -> hasPermission(Manifest.permission.CAMERA)
                else -> false
            }
        }
        if (granted.isEmpty()) request.deny() else request.grant(granted.toTypedArray())
    }

    private fun hasPermission(p: String) =
        ContextCompat.checkSelfPermission(this, p) == PackageManager.PERMISSION_GRANTED

    private fun hideCustomView() {
        val view = customView ?: return
        root.removeView(view)
        customView = null
        webView.visibility = View.VISIBLE
        customViewCallback?.onCustomViewHidden()
        customViewCallback = null
    }
}
