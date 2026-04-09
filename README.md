# SafeView AI

[![CI](https://github.com/wtrwrldgo/safeview-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/wtrwrldgo/safeview-ai/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/wtrwrldgo/safeview-ai)](https://github.com/wtrwrldgo/safeview-ai/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A Chrome extension that runs a local vision model on every frame of the video you are watching, and either blurs or skips scenes flagged as NSFW, violence, or horror. Everything runs on your machine. No frames ever leave the browser.

Works on YouTube and Netflix. Built on ONNX Runtime Web.

<p align="center">
  <img src="docs/popup.png" alt="SafeView popup" width="320" />
</p>

https://github.com/wtrwrldgo/safeview-ai/raw/main/docs/demo.webm

## What it does

SafeView watches the video you are actually playing, in real time, with a small ONNX model running inside Chrome. When the model flags the current frame as NSFW, gore, or horror, SafeView reacts with one of two actions that you pick from the popup:

- **Blur** covers the player with a soft backdrop blur and a small "Restricted Content" badge until the scene passes.
- **Skip** walks the player forward in four second steps until the model stops flagging the new position.

You can swap between the two at any time without reloading the page.

## Why

Existing content filters fall into two camps. Browser level parental controls are coarse and block entire sites. Cloud based moderation services work per frame but send your video stream to a third party. Neither is acceptable if you just want to skip one uncomfortable scene in an otherwise watchable film.

SafeView does the third thing. The model is 327 MB of weights that live on your disk, inference happens inside the extension process, and the only thing leaving Chrome is the HTTP request to YouTube or Netflix itself, which was happening anyway.

## Install

SafeView is not yet in the Chrome Web Store. For now you build and sideload it.

```bash
git clone https://github.com/wtrwrldgo/safeview-ai
cd safeview-ai
npm install
npm run build
```

The model weights are too large for the GitHub repository, so they live in the release assets. Download them once:

```bash
mkdir -p src/model
curl -L -o src/model/safeview_model.onnx \
  https://github.com/wtrwrldgo/safeview-ai/releases/download/v0.1.0/safeview_model.onnx
npm run build
```

Then in Chrome:

1. Open `chrome://extensions`
2. Toggle **Developer mode** in the top right
3. Click **Load unpacked**
4. Pick the `dist/` folder

Open any YouTube or Netflix video and click the SafeView icon in the toolbar.

## How it works

```
┌─────────────────┐    250ms    ┌──────────────────┐     ┌─────────────────┐
│  content.js     │─ JPEG 224 ─▶│  background.js   │────▶│ offscreen.html  │
│  (on each tab)  │             │ (service worker) │     │  ONNX Runtime   │
└─────────────────┘             └──────────────────┘     └─────────────────┘
         ▲                              │                        │
         │                              │ blur true or false     │
         │           aiResult           │                        │
         └──────────────────────────────┘◀───────scores──────────┘
```

Every 250 ms the content script grabs the current video frame, draws it to a 224x224 canvas at JPEG quality 0.3, and sends the bytes to the background service worker. The worker forwards the frame to an offscreen document that loads the ONNX model via ONNX Runtime Web with WASM and SIMD. The model returns four scores (NSFW, gore, horror, safe) and the worker decides whether to tell the content script to act.

Skip mode uses a two frame consecutive positive streak before firing a seek, so a single noisy frame can never hijack playback. The streak is tracked per tab in the background worker and cleared on seek, tab close, and mode switch.

## Configuration

Everything is in the popup. There are no hidden flags.

| Setting            | Default | What it does                                         |
|--------------------|---------|------------------------------------------------------|
| AI Content Filter  | On      | Master switch for AI detection                       |
| NSFW and Nudity    | On      | Flag frames above the NSFW score threshold           |
| Violence and Gore  | On      | Flag frames above the gore or horror score threshold |
| Action mode        | Blur    | What to do with a flagged frame (blur or skip)       |
| NSFW threshold     | 0.50    | Minimum NSFW score that counts as a hit (0.30–0.90)  |
| Gore threshold     | 0.50    | Minimum gore score that counts as a hit (0.30–0.90)  |
| Horror threshold   | 0.50    | Minimum horror score that counts as a hit (0.30–0.90)|
| YouTube            | On      | Run detection on YouTube tabs                        |
| Netflix            | On      | Run detection on Netflix tabs                        |

Lower the slider to catch more frames, raise it to cut false positives. All three sliders live in the popup and take effect on the very next frame without a reload. Per-site toggles stop capture entirely on disabled hosts, so there is zero model work and zero CPU cost on tabs you have opted out.

## Project layout

```
src/
  background.js    service worker, handles inference scheduling and tab routing
  content.js       injected on YouTube and Netflix, captures frames, applies actions
  offscreen.html   runs the ONNX model outside the service worker
  offscreen.js     ONNX Runtime Web loader and inference loop
  popup.html       settings UI
  popup.js         persists settings to chrome.storage.local
  popup.css        styling
  sandbox.html     sandboxed page for CSP restricted model loading
  model/           ONNX weights (not in git, download from release)
  icons/           16, 48, 128 px toolbar icons
  mock_database.json  pre tagged scene filters for specific known videos
```

## Roadmap

- Firefox MV3 port
- Distilled model under 50 MB
- Per category score thresholds exposed in the popup
- Fixture based test suite for edge cases like low light and animation
- Netflix specific content script that respects their player lifecycle
- Per site enable and disable toggles
- Whitelist and blacklist support for known safe channels

## Contributing

The project is at v0.1.0 and bugs are expected. If you find a scene that SafeView should catch but doesn't, or a scene it catches by mistake, the most useful thing you can do is open an issue with the video URL and timestamp. That gives me the fixture to reproduce against.

For code contributions, standard fork and pull request flow. Keep changes small and focused. The three files that matter most are `src/background.js`, `src/content.js`, and `src/offscreen.js`.

## Privacy

SafeView does not send any video, audio, image, or metadata to any server. The only network traffic from the extension is the one time download of the ONNX weights from the GitHub release when you install. After that the extension works fully offline.

## License

MIT. See [LICENSE](LICENSE).
