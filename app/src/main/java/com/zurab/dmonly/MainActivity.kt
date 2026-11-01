package com.zurab.dmonly

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.addCallback
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.result.contract.ActivityResultContracts.PickVisualMedia
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature

class MainActivity : ComponentActivity() {

    companion object {
        private const val START_URL = "https://www.instagram.com/direct/inbox/"
        private val INSTAGRAM_ORIGINS = setOf("https://www.instagram.com", "https://instagram.com")
    }

    private lateinit var root: FrameLayout
    private lateinit var webView: WebView
    private lateinit var guardScript: String
    private var docStartInjection = false

    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var pendingPermission: PermissionRequest? = null
    private var customView: View? = null
    private var customViewCallback: WebChromeClient.CustomViewCallback? = null

    // Gallery (Android photo picker) — opens straight to your photos.
    private val pickOne =
        registerForActivityResult(PickVisualMedia()) { uri ->
            deliverFiles(uri?.let { arrayOf(it) })
        }
    private val pickMany =
        registerForActivityResult(ActivityResultContracts.PickMultipleVisualMedia()) { uris ->
            deliverFiles(if (uris.isEmpty()) null else uris.toTypedArray())
        }

    // Fallback file picker for anything that isn't a photo/video.
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

    // Mic / camera permission (voice messages, calls)
    private val permissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
            pendingPermission?.let { resolvePermission(it) }
            pendingPermission = null
        }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        guardScript = assets.open("dmonly.js").bufferedReader().use { it.readText() }

        root = FrameLayout(this)
        root.setBackgroundColor(Color.BLACK)
        webView = WebView(this)
        root.addView(webView, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
        setContentView(root)

        // Keep content clear of status bar, nav bar and keyboard.
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime()
            )
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }

        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(webView, true)
        }

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            javaScriptCanOpenWindowsAutomatically = false
            setSupportMultipleWindows(false)
            // Look like normal mobile Chrome, not an embedded WebView.
            userAgentString = userAgentString
                .replace("; wv", "")
                .replace(Regex("Version/[\\d.]+ "), "")
        }

        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(webView, guardScript, INSTAGRAM_ORIGINS)
            docStartInjection = true
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (!request.isForMainFrame) return false
                return handleNavigation(request.url)
            }

            override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
                super.onPageStarted(view, url, favicon)
                if (!docStartInjection && isInstagramUrl(url)) view.evaluateJavascript(guardScript, null)
            }

            override fun onPageFinished(view: WebView, url: String?) {
                super.onPageFinished(view, url)
                if (!docStartInjection && isInstagramUrl(url)) view.evaluateJavascript(guardScript, null)
                CookieManager.getInstance().flush()
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
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

            // Full-screen video
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

        onBackPressedDispatcher.addCallback(this) {
            if (customView != null) {
                hideCustomView()
                return@addCallback
            }
            // Ask the page first: from a chat, back always goes to the chat list
            // (never through old history entries like profiles, which are blocked).
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

        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            webView.loadUrl(START_URL)
        }
    }

    /** true = we handled it (don't load in the WebView). */
    private fun handleNavigation(uri: Uri): Boolean {
        val scheme = uri.scheme?.lowercase()
        // Swallow instagram://, intent:// etc. so it can never jump into the real Instagram app.
        if (scheme != "http" && scheme != "https") return true
        if (isInstagramHost(uri.host)) return false
        // Any other website opens in your normal browser.
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri))
        } catch (_: ActivityNotFoundException) {
        }
        return true
    }

    private fun isInstagramHost(host: String?): Boolean =
        host != null && (host == "instagram.com" || host.endsWith(".instagram.com"))

    private fun isInstagramUrl(url: String?): Boolean =
        url != null && isInstagramHost(Uri.parse(url).host)

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

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onPause() {
        webView.onPause()
        CookieManager.getInstance().flush()
        super.onPause()
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }
}
