let requestInFlight = false;

// Per-tab streak counters. In skip mode we require two consecutive
// positive frames before acting, so a single false positive can't yank
// the player forward by 4 seconds.
const positiveStreak = new Map();
const DETECT_THRESHOLD = 0.5; // Same threshold for blur and skip — the streak does the debouncing.
const SKIP_MIN_STREAK = 2;    // Two consecutive positive frames before we touch the player.

let creating = null;
async function setupOffscreenDocument(path) {
  if (await chrome.offscreen.hasDocument()) return;
  if (creating) {
    await creating;
    return;
  }
  try {
    creating = chrome.offscreen.createDocument({
      url: path,
      reasons: ['WORKERS'],
      justification: 'Run local ML model'
    });
    await creating;
  } finally {
    creating = null;
  }
}

async function analyzeImageLocally(base64, tabId) {
  if (requestInFlight) return;
  requestInFlight = true;

  try {
    await setupOffscreenDocument('src/offscreen.html');

    const settings = await chrome.storage.local.get(["detectNsfw", "detectGore", "actionMode"]);
    const nsfwEnabled = settings.detectNsfw !== false;
    const goreEnabled = settings.detectGore !== false;
    const skipMode = settings.actionMode === "skip";

    if (!nsfwEnabled && !goreEnabled) { requestInFlight = false; return; }

    const responsePromise = chrome.runtime.sendMessage({
      type: 'analyzeFrameOffscreen',
      imageBase64: base64
    });

    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Offscreen timeout")), 5000));
    const result = await Promise.race([responsePromise, timeoutPromise]);

    if (result && result.success) {
      const nsfwScore = result.nsfwScore;
      const goreScore = result.goreScore;
      const horrorScore = result.horrorScore;
      const safeScore = result.safeScore;

      const isNsfw = nsfwEnabled && nsfwScore > DETECT_THRESHOLD;
      const isGore = goreEnabled && goreScore > DETECT_THRESHOLD;
      // Horror is grouped under the "Violence & Gore" toggle
      const isHorror = goreEnabled && horrorScore > DETECT_THRESHOLD;

      let shouldBlur = isNsfw || isGore || isHorror;

      // In skip mode require two consecutive positive frames per tab.
      if (skipMode) {
        const prev = positiveStreak.get(tabId) || 0;
        const next = shouldBlur ? prev + 1 : 0;
        positiveStreak.set(tabId, next);
        if (shouldBlur && next < SKIP_MIN_STREAK) {
          shouldBlur = false;
        }
      } else if (positiveStreak.has(tabId)) {
        positiveStreak.delete(tabId);
      }

      console.log(`[SafeView Local] nsfw: ${nsfwScore.toFixed(3)} gore: ${goreScore.toFixed(3)} horror: ${horrorScore.toFixed(3)} safe: ${safeScore.toFixed(3)} mode: ${skipMode ? "skip" : "blur"} thr: ${DETECT_THRESHOLD} streak: ${positiveStreak.get(tabId) || 0} -> blur: ${shouldBlur}`);

      chrome.tabs.sendMessage(tabId, {
        type: "aiResult",
        blur: shouldBlur,
        nsfw: isNsfw,
        gore: isGore,
        horror: isHorror,
        nsfwScore: Math.round(nsfwScore * 1000) / 1000,
        goreScore: Math.round(goreScore * 1000) / 1000,
        horrorScore: Math.round(horrorScore * 1000) / 1000,
        source: "local",
      });
    } else if (result && result.error) {
      console.error("[SafeView Local] Offscreen err:", result.error);
    }
  } catch (err) {
    console.warn("[SafeView Local] Inference err (likely starting up):", err.message);
  } finally {
    requestInFlight = false;
  }
}

async function captureAndAnalyze(tabId) {
  if (requestInFlight) return;
  try {
    const tab = await chrome.tabs.get(tabId);
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 50 });
    await analyzeImageLocally(dataUrl.split(",")[1], tabId);
  } catch (err) { console.warn("[SafeView BG] captureAndAnalyze failed:", err.message); }
}

chrome.runtime.onInstalled.addListener(async () => {
  try {
    const url = chrome.runtime.getURL("src/mock_database.json");
    const response = await fetch(url);
    const filters = await response.json();
    await chrome.storage.local.set({ filters, enabled: true });
    console.log("[SafeView BG] Loaded database payload");
  } catch (err) {
    console.error("[SafeView BG] Mock DB fail", err);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message.type === 'getFilters') {
      const data = await chrome.storage.local.get(['filters', 'enabled'])
      sendResponse({ filters: data.filters || [], enabled: data.enabled !== false })
    } else if (message.type === 'toggleEnabled') {
      const data = await chrome.storage.local.get('enabled')
      const newState = !data.enabled
      await chrome.storage.local.set({ enabled: newState })
      sendResponse({ enabled: newState })

      const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/*' })
      for (const tab of tabs) {
        chrome.tabs.sendMessage(tab.id, { type: 'toggleState', enabled: newState }).catch(() => {})
      }
    } else if (message.type === 'analyzeFrame' && sender.tab?.id) {
      analyzeImageLocally(message.imageBase64, sender.tab.id)
    } else if (message.type === 'captureFrame' && sender.tab?.id) {
      captureAndAnalyze(sender.tab.id)
    } else if (message.type === 'resetStreak' && sender.tab?.id) {
      // Content script just seeked the player — wipe the streak so the
      // very next frame from the new position starts a fresh count.
      positiveStreak.delete(sender.tab.id)
    }
  })()
  return true
})

chrome.tabs.onRemoved.addListener((tabId) => {
  positiveStreak.delete(tabId);
});

// Reset the streak when the user toggles modes — otherwise a stale
// counter from blur mode could trigger an instant skip on first frame.
chrome.storage.onChanged.addListener((changes) => {
  if (changes.actionMode) positiveStreak.clear();
});

// Setup offscreen early
setupOffscreenDocument('src/offscreen.html');
