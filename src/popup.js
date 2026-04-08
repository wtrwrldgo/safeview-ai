const toggle = document.getElementById("toggle");
const statusText = document.getElementById("statusText");
const statusBadge = document.getElementById("statusBadge");
const filterCount = document.getElementById("filterCount");
const detectNsfw = document.getElementById("detectNsfw");
const detectGore = document.getElementById("detectGore");
const modeBlur = document.getElementById("modeBlur");
const modeSkip = document.getElementById("modeSkip");
const modeHint = document.getElementById("modeHint");

const MODE_HINTS = {
  blur: "Hides the scene with a soft blur overlay.",
  skip: "Jumps the player forward past sensitive scenes.",
};

function setActionMode(mode) {
  const next = mode === "skip" ? "skip" : "blur";
  modeBlur.classList.toggle("is-active", next === "blur");
  modeSkip.classList.toggle("is-active", next === "skip");
  modeBlur.setAttribute("aria-checked", next === "blur");
  modeSkip.setAttribute("aria-checked", next === "skip");
  modeHint.textContent = MODE_HINTS[next];
}

function setStatusState(isActive) {
  statusText.textContent = isActive ? "Active" : "Inactive";
  if (isActive) {
    statusBadge.classList.add("is-active");
  } else {
    statusBadge.classList.remove("is-active");
  }
}

chrome.storage.local.get(
  ["enabled", "filters", "detectNsfw", "detectGore", "actionMode"],
  (data) => {
    const isEnabled = data.enabled !== false;
    toggle.checked = isEnabled;
    setStatusState(isEnabled);

    detectNsfw.checked = data.detectNsfw !== false;
    detectGore.checked = data.detectGore !== false;
    setActionMode(data.actionMode || "blur");

    const count = (data.filters || []).length;
    filterCount.textContent = count + " timestamp filter" + (count !== 1 ? "s" : "");

    const manifest = chrome.runtime.getManifest();
    versionText.textContent = "v" + manifest.version;
  }
);

toggle.addEventListener("change", () => {
  chrome.runtime.sendMessage({ type: "toggleEnabled" }, (response) => {
    if (response) {
      setStatusState(response.enabled);
    }
  });
});

detectNsfw.addEventListener("change", () => {
  chrome.storage.local.set({ detectNsfw: detectNsfw.checked });
});

detectGore.addEventListener("change", () => {
  chrome.storage.local.set({ detectGore: detectGore.checked });
});

[modeBlur, modeSkip].forEach((btn) => {
  btn.addEventListener("click", () => {
    const mode = btn.dataset.mode;
    setActionMode(mode);
    chrome.storage.local.set({ actionMode: mode });
  });
});
