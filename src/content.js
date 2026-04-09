(function () {
  'use strict'
  console.log('[SafeView] Content script injected')

  const CAPTURE_INTERVAL = 250 // Poll 4 times per second for instant reaction
  const SAFE_FRAMES_TO_UNBLUR = 3 // Turn blur off faster (750ms) when safe
  const SKIP_STEP_SECONDS = 4 // How far to jump forward per detected unsafe frame
  const SKIP_COOLDOWN_MS = 600 // Min gap between consecutive seeks so the model can re-check

  let filters = []
  let enabled = true
  let actionMode = 'blur' // 'blur' | 'skip' — chosen by the user in the popup

  // Per-site gate. The content script only runs on hosts listed in manifest.json
  // (youtube.com / netflix.com), so we map the current hostname to a storage key
  // and refuse to start capture when that key is false.
  const host = location.hostname
  const siteKey = host.includes('youtube.com')
    ? 'youtube'
    : host.includes('netflix.com')
      ? 'netflix'
      : null
  let siteAllowed = true // Optimistic default — flipped once storage responds.
  let lastSkipAt = 0
  let rafId = null
  let activeVideo = null
  let overlay = null
  let badge = null
  let lastState = null

  let captureTimer = null
  let aiBlurActive = false
  let aiBlurLabel = ''
  let safeFrameCount = 0
  let captureCanvas = null
  let captureCtx = null
  let resizeObserver = null
  let videoRemovalObserver = null

  function loadFilters () {
    chrome.runtime.sendMessage({ type: 'getFilters' }, (response) => {
      if (chrome.runtime.lastError) return
      if (response) {
        filters = response.filters || []
        enabled = response.enabled !== false
        console.log('[SafeView] Loaded', filters.length, 'filters, enabled:', enabled)
      }
    })
    chrome.storage.local.get(['actionMode', 'siteEnabled'], (data) => {
      actionMode = data.actionMode === 'skip' ? 'skip' : 'blur'
      const siteEnabled = data.siteEnabled || {}
      siteAllowed = siteKey ? siteEnabled[siteKey] !== false : true
      console.log('[SafeView] Action mode:', actionMode, 'site:', siteKey, 'allowed:', siteAllowed)
      if (!siteAllowed) {
        stopCapture()
        hideOverlay()
        lastState = null
      }
    })
  }

  function createOverlay () {
    overlay = document.createElement('div')
    overlay.id = 'safeview-overlay'
    overlay.style.cssText = [
      'position: absolute',
      'top: 0',
      'left: 0',
      'width: 100%',
      'height: 100%',
      'background: rgba(10, 10, 10, 0.6)',
      'backdrop-filter: blur(80px) saturate(0.8)',
      '-webkit-backdrop-filter: blur(80px) saturate(0.8)',
      'z-index: 2147483647',
      'display: none',
      'align-items: center',
      'justify-content: center',
      'pointer-events: none',
      'transition: opacity 0.3s ease'
    ].join(';')

    badge = document.createElement('div')
    badge.style.cssText = [
      'display: flex',
      'flex-direction: column',
      'align-items: center',
      'gap: 8px',
      'background: rgba(20, 20, 20, 0.85)',
      'backdrop-filter: blur(24px)',
      '-webkit-backdrop-filter: blur(24px)',
      'border: 1px solid rgba(255, 255, 255, 0.08)',
      'color: #F8FAFC',
      "font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      'padding: 32px 48px',
      'border-radius: 24px',
      'text-align: center',
      'box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
      'pointer-events: none',
      'transform: scale(0.95)',
      'opacity: 0',
      'animation: sv-pop 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards'
    ].join(';')

    badge.innerHTML = `
      <style>
        @keyframes sv-pop {
          to { transform: scale(1); opacity: 1; }
        }
        .sv-icon-wrapper {
          width: 56px; height: 56px;
          border-radius: 50%;
          background: linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(185, 28, 28, 0.05));
          display: flex; align-items: center; justify-content: center;
          border: 1px solid rgba(239, 68, 68, 0.3);
          box-shadow: 0 0 24px rgba(239, 68, 68, 0.2);
          margin-bottom: 8px;
        }
        .sv-title { font-size: 20px; font-weight: 700; letter-spacing: -0.02em; margin: 0; }
        .sv-desc { font-size: 15px; font-weight: 500; color: #94A3B8; margin: 0; }
        .sv-brand { font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.3); text-transform: uppercase; letter-spacing: 1px; margin-top: 12px; }
      </style>
      <div class="sv-icon-wrapper">
        <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="#F87171" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
        </svg>
      </div>
      <h2 class="sv-title">Restricted Content</h2>
      <p class="sv-desc" id="safeview-cause"></p>
      <div class="sv-brand">Protected by SafeView AI</div>
    `

    overlay.appendChild(badge)
    return overlay
  }

  function cleanupVideo () {
    stopCapture()
    if (resizeObserver) {
      resizeObserver.disconnect()
      resizeObserver = null
    }
    if (videoRemovalObserver) {
      videoRemovalObserver.disconnect()
      videoRemovalObserver = null
    }
    if (overlay && overlay.parentElement) overlay.parentElement.removeChild(overlay)
    unmuteVideo()
    overlay = null
    badge = null
    captureCanvas = null
    captureCtx = null
    activeVideo = null
    lastState = null
  }

  function attachOverlay (video) {
    if (document.getElementById('safeview-overlay')) return
    const parent = video.parentElement
    if (!parent) return
    if (getComputedStyle(parent).position === 'static') {
      parent.style.position = 'relative'
    }
    createOverlay()
    parent.appendChild(overlay)
    resizeObserver = new ResizeObserver(() => {
      if (overlay && video) {
        overlay.style.width = video.offsetWidth + 'px'
        overlay.style.height = video.offsetHeight + 'px'
      }
    })
    resizeObserver.observe(video)

    // Watch for video removal to prevent memory leaks
    videoRemovalObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.removedNodes) {
          if (node === video || (node.contains && node.contains(video))) {
            console.log('[SafeView] Video removed, cleaning up')
            cleanupVideo()
            return
          }
        }
      }
    })
    videoRemovalObserver.observe(parent.parentElement || parent, { childList: true, subtree: true })
  }

  function showOverlay (label) {
    if (!overlay) return
    overlay.style.display = 'flex'
    const causeEl = overlay.querySelector('#safeview-cause')
    if (causeEl) causeEl.textContent = label
  }

  function hideOverlay () {
    if (!overlay) return
    overlay.style.display = 'none'
  }

  function getActiveFilter (t) {
    for (const f of filters) {
      if (t >= f.start && t <= f.end) return f
    }
    return null
  }

  // --- Canvas-based video frame capture ---

  function captureVideoFrame () {
    if (!activeVideo || !enabled || !siteAllowed || activeVideo.paused) return
    if (activeVideo.videoWidth === 0 || activeVideo.videoHeight === 0) return
    if (!chrome.runtime?.id) {
      stopCapture()
      return
    }

    try {
      if (!captureCanvas) {
        captureCanvas = document.createElement('canvas')
        captureCtx = captureCanvas.getContext('2d')
      }

      // Scale directly to the exact pixel resolution required by MobileNetV2 (224x224).
      // This allows the highly-optimized C++ Canvas 2D engine to handle resizing
      // instead of burdening the GPU's WebGL tensor operations inside TFJS.
      captureCanvas.width = 224
      captureCanvas.height = 224

      captureCtx.drawImage(activeVideo, 0, 0, 224, 224)
      // Aggressively drop jpeg quality to 0.3 to shrink the IPC payload string size.
      // Neural networks are highly resilient to low-fidelity JPEG artifacts.
      const dataUrl = captureCanvas.toDataURL('image/jpeg', 0.3)
      const base64 = dataUrl.split(',')[1]

      // console.log("[SafeView] Frame captured, size:", Math.round(base64.length / 1024) + "KB");

      // Send base64 to background for API call
      chrome.runtime.sendMessage(
        { type: 'analyzeFrame', imageBase64: base64 },
        () => { void chrome.runtime.lastError }
      )
    } catch (err) {
      console.warn('[SafeView] Canvas failed:', err.message, '— falling back to tab capture')
      chrome.runtime.sendMessage({ type: 'captureFrame' }, () => {
        void chrome.runtime.lastError
      })
    }
  }

  function startCapture () {
    stopCapture()
    if (!siteAllowed) {
      console.log('[SafeView] Site disabled (' + siteKey + '), not starting capture')
      return
    }
    captureTimer = setInterval(captureVideoFrame, CAPTURE_INTERVAL)
    console.log('[SafeView] AI capture started (video-only, every ' + CAPTURE_INTERVAL + 'ms)')
  }

  function stopCapture () {
    if (captureTimer) {
      clearInterval(captureTimer)
      captureTimer = null
    }
    aiBlurActive = false
    safeFrameCount = 0
  }

  chrome.runtime.onMessage.addListener((message) => {
    console.log('[SafeView] Received message:', message)
    if (message.type === 'toggleState') {
      console.log('[SafeView] Explicit toggleState broadcast received. Setting enabled to:', message.enabled)
      enabled = message.enabled
      if (enabled && activeVideo) {
        startCapture()
      } else {
        stopCapture()
        hideOverlay()
        lastState = null
      }
    } else if (message.type === 'aiResult') {
      if (message.blur) {
        safeFrameCount = 0
        const parts = []
        if (message.nsfw) parts.push('NSFW')
        if (message.gore) parts.push('Violence/Gore')
        if (message.horror) parts.push('Horror')
        const label = parts.length > 0 ? parts.join(' + ') + ' detected' : 'Content filtered'
        aiBlurLabel = label

        if (actionMode === 'skip' && activeVideo) {
          // Skip mode: jump the player forward in small steps. Each subsequent
          // frame analysis tells us whether we are still inside the unsafe scene,
          // so we just keep walking forward until the model reports "safe".
          const now = Date.now()
          if (now - lastSkipAt >= SKIP_COOLDOWN_MS) {
            lastSkipAt = now
            const duration = isFinite(activeVideo.duration) ? activeVideo.duration : Infinity
            const target = Math.min(
              duration - 0.1,
              activeVideo.currentTime + SKIP_STEP_SECONDS
            )
            console.log('[SafeView] SKIP →', activeVideo.currentTime.toFixed(1), 'to', target.toFixed(1), '(', label, ')')
            try {
              activeVideo.currentTime = target
              // The next captured frame should start a brand-new streak in
              // the background, otherwise leftover state can throttle us.
              chrome.runtime.sendMessage({ type: 'resetStreak' }, () => { void chrome.runtime.lastError })
            } catch (e) {
              console.warn('[SafeView] seek failed:', e.message)
            }
          } else {
            console.log('[SafeView] skip throttled (cooldown), ms left:', SKIP_COOLDOWN_MS - (now - lastSkipAt))
          }
          aiBlurActive = false
        } else if (!aiBlurActive) {
          aiBlurActive = true
          console.log('[SafeView] Blur ON:', label)
        }
      } else {
        if (aiBlurActive) {
          safeFrameCount++
          if (safeFrameCount >= SAFE_FRAMES_TO_UNBLUR) {
            aiBlurActive = false
            safeFrameCount = 0
            console.log('[SafeView] Blur OFF')
          }
        }
      }
    }
  })

  function observerLoop () {
    if (!activeVideo || !enabled) {
      hideOverlay()
      lastState = null
      rafId = requestAnimationFrame(observerLoop)
      return
    }

    const t = activeVideo.currentTime
    const f = getActiveFilter(t)

    if (f) {
      // The user's popup choice overrides the per-filter action so the toggle
      // is a single source of truth across manual and AI-detected segments.
      const effectiveAction = actionMode === 'skip' ? 'skip' : (f.action || 'blur')
      const key = f.start + '-' + effectiveAction
      if (effectiveAction === 'skip') {
        activeVideo.currentTime = f.end + 1
        lastState = null
      } else if (lastState !== key) {
        showOverlay('Filtering: ' + f.label)
        lastState = key
      }
    } else if (aiBlurActive) {
      if (lastState !== 'ai') {
        showOverlay(aiBlurLabel)
        lastState = 'ai'
      }
    } else if (lastState !== null) {
      hideOverlay()
      lastState = null
    }

    rafId = requestAnimationFrame(observerLoop)
  }

  function startMonitoring (video) {
    console.log('[SafeView] Starting monitoring for video:', video)
    if (activeVideo === video) return
    activeVideo = video
    console.log('[SafeView] Video detected')
    attachOverlay(video)
    if (!rafId) rafId = requestAnimationFrame(observerLoop)
    if (enabled && siteAllowed) startCapture()
  }

  function setupVideoDetection () {
    console.log('[SafeView] Setting up video detection')
    const v = document.querySelector('video')
    if (v) {
      console.log('[SafeView] Found video element on initial load:', v)
      startMonitoring(v)
    }
    new MutationObserver((mutations) => {
      console.log('[SafeView] MutationObserver callback triggered')
      for (const m of mutations) {
        for (const n of m.addedNodes) {
          if (n.nodeName === 'VIDEO') {
            console.log('[SafeView] Found video element via MutationObserver:', n)
            startMonitoring(n)
          } else if (n.querySelectorAll) {
            const v = n.querySelector('video')
            if (v) {
              console.log('[SafeView] Found nested video element via MutationObserver:', v)
              startMonitoring(v)
            }
          }
        }
      }
    }).observe(document.documentElement, { childList: true, subtree: true })
  }

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.enabled) {
      enabled = changes.enabled.newValue
      if (enabled && siteAllowed && activeVideo) startCapture()
      else {
        stopCapture()
        hideOverlay()
        lastState = null
      }
    }
    if (changes.filters) filters = changes.filters.newValue || []
    if (changes.actionMode) {
      actionMode = changes.actionMode.newValue === 'skip' ? 'skip' : 'blur'
      console.log('[SafeView] Action mode changed:', actionMode)
      // If user switched to skip while a blur is on screen, drop the overlay.
      if (actionMode === 'skip') {
        hideOverlay()
        lastState = null
      }
    }
    if (changes.siteEnabled && siteKey) {
      const next = changes.siteEnabled.newValue || {}
      const wasAllowed = siteAllowed
      siteAllowed = next[siteKey] !== false
      console.log('[SafeView] Site toggle changed:', siteKey, '->', siteAllowed)
      if (!siteAllowed) {
        stopCapture()
        hideOverlay()
        lastState = null
      } else if (!wasAllowed && enabled && activeVideo) {
        // Transition from off → on: resume capture immediately without
        // waiting for the next video detection pass.
        startCapture()
      }
    }
  })

  loadFilters()
  setupVideoDetection()
}
)()
