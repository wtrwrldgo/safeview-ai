# Firefox port — current status

## TL;DR

SafeView does not yet run on Firefox. The manifest has been prepped with the
required `browser_specific_settings` field and the build still produces a valid
Chrome MV3 bundle, but there is one real blocker on the Firefox side that needs
a code change before the extension can load: the inference path depends on a
Chrome-only API (`chrome.offscreen`) which Firefox does not implement.

Tracked as [issue #1](https://github.com/wtrwrldgo/safeview-ai/issues/1).

## What already works on Firefox

- The manifest is MV3-compliant and declares `browser_specific_settings.gecko`,
  so Firefox will at least accept the zip.
- `content.js` is plain DOM code with no Chrome-specific APIs beyond
  `chrome.runtime` and `chrome.storage.local`, both of which are
  namespace-compatible aliases on Firefox via the `chrome` global.
- The popup and the options page use only `chrome.storage.local` and
  `chrome.runtime.openOptionsPage`, which Firefox supports.

## What does not work yet

### The offscreen document

Chrome MV3 service workers cannot load WebAssembly directly, so SafeView puts
the ONNX Runtime Web instance inside an offscreen document and talks to it via
`chrome.runtime` messages. Firefox does not have an equivalent of
`chrome.offscreen.createDocument` — its background scripts are allowed to
execute WASM directly, so there is simply no offscreen concept.

The fix requires a platform branch in `background.js`:

```
if (typeof chrome.offscreen !== "undefined") {
  // Chrome path — spin up the offscreen document, route analyzeFrame messages
  // to it, relay the scores back.
} else {
  // Firefox path — load onnxruntime-web directly inside the background script
  // and call the inference function inline. Same input/output shape.
}
```

This change is moderate size because the current `offscreen.js` already
contains all the ONNX setup code — it just needs to be importable from either
the offscreen page or the background script depending on the host browser.

### `chrome.tabs.captureVisibleTab` fallback

The content script has a secondary capture path that falls back to
`chrome.runtime.sendMessage({ type: 'captureFrame' })` if canvas capture
throws. In the background worker that message handler uses
`chrome.tabs.captureVisibleTab`, which exists on Firefox but requires the
`<all_urls>` host permission to be user-granted rather than declared. The
current manifest asks for `<all_urls>` in `host_permissions`, which Firefox
honours but sometimes only after an explicit user grant flow. This is probably
fine but it is untested.

## How to try it anyway

Once the offscreen branch above is implemented:

```bash
npm run build
cd dist
zip -r ../safeview-firefox.zip .
```

Then `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** →
pick the zip.

## Help wanted

This is the single most requested port and the cleanest way for someone else
to contribute. If you have Firefox + WASM experience and want to take a pass
at the offscreen branch, comment on
[issue #1](https://github.com/wtrwrldgo/safeview-ai/issues/1) and I will
review quickly.
