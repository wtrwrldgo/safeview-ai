// Options page for the blocklist / allowlist. Persists to chrome.storage.local
// under the keys `blocklist` and `allowlist`. content.js reads these on load
// and listens for storage changes so edits take effect without a page reload.

const blocklistField = document.getElementById("blocklist");
const allowlistField = document.getElementById("allowlist");
const saveButton = document.getElementById("save");
const resetButton = document.getElementById("reset");
const savedStatus = document.getElementById("savedStatus");

// Normalize: split on newlines, trim, drop empty and duplicate entries.
// Kept as a plain function (not exported) because it only runs once per save.
function normalize(text) {
  const seen = new Set();
  const out = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (seen.has(line)) continue;
    seen.add(line);
    out.push(line);
  }
  return out;
}

function load() {
  chrome.storage.local.get(["blocklist", "allowlist"], (data) => {
    blocklistField.value = (data.blocklist || []).join("\n");
    allowlistField.value = (data.allowlist || []).join("\n");
  });
}

function flashStatus(message) {
  savedStatus.textContent = message;
  savedStatus.classList.add("is-visible");
  setTimeout(() => {
    savedStatus.classList.remove("is-visible");
  }, 1400);
}

saveButton.addEventListener("click", () => {
  const blocklist = normalize(blocklistField.value);
  const allowlist = normalize(allowlistField.value);
  chrome.storage.local.set({ blocklist, allowlist }, () => {
    // Re-populate so the user sees the normalized version (trimmed, deduped).
    blocklistField.value = blocklist.join("\n");
    allowlistField.value = allowlist.join("\n");
    flashStatus("Saved");
  });
});

resetButton.addEventListener("click", () => {
  blocklistField.value = "";
  allowlistField.value = "";
  chrome.storage.local.set({ blocklist: [], allowlist: [] }, () => {
    flashStatus("Cleared");
  });
});

// Cmd/Ctrl+S saves. Small keyboard nicety that makes the page feel like a
// real settings window rather than a form you have to click through.
document.addEventListener("keydown", (e) => {
  const isSave = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s";
  if (isSave) {
    e.preventDefault();
    saveButton.click();
  }
});

load();
