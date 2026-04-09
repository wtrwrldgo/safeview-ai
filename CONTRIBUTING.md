# Contributing to SafeView AI

Thanks for being interested. SafeView is a one-person project that ships often, so the contribution loop is kept simple on purpose.

## Ground rules

- Nothing in this repo should ever send video frames, image data, model scores, URLs, or tab metadata off the user's machine. Network requests from the extension code are a hard no. If you have a use case that seems to need one, open an issue first so we can talk it through before you write code.
- Node 22 or newer is required — `vite.config.js` uses `fs.globSync`, which was introduced in Node 22.0.0.
- Keep commits small and focused. One commit should either fix one bug, ship one feature, or refactor one thing. Bundled commits get rejected.

## Local setup

```bash
git clone https://github.com/wtrwrldgo/safeview-ai
cd safeview-ai
npm install
npm run build
```

The model weights are not in the git repo because they are 327 MB. Grab them from the latest release once:

```bash
mkdir -p src/model
curl -L -o src/model/safeview_model.onnx \
  https://github.com/wtrwrldgo/safeview-ai/releases/download/v0.1.0/safeview_model.onnx
npm run build
```

Then open `chrome://extensions`, flip **Developer mode** on, click **Load unpacked**, and pick the `dist/` folder.

## Running the extension in dev

There is no hot reload for content scripts. The loop is:

1. Edit a file under `src/`.
2. Run `npm run build`.
3. In `chrome://extensions`, click the reload icon on the SafeView card.
4. Reload the YouTube or Netflix tab you are testing on.

The popup does hot reload if you close and reopen it.

## Debugging

- **Popup logs** — right-click the extension icon, pick "Inspect popup".
- **Content script logs** — open devtools on the YouTube/Netflix tab and look for lines prefixed with `[SafeView]`.
- **Service worker logs** — on `chrome://extensions`, click the "service worker" link next to SafeView to open its dedicated devtools window. All inference logs (`[SafeView Local] nsfw: ...`) live there.

## Testing changes

At the moment the test surface is the set of `run_*.js` scripts in the repo root, which use Puppeteer to drive a real Chrome with the extension loaded. Running `node run_model_test.js` for instance sideloads the extension, plays a known video, and snapshots the detection output.

A proper fixture-based Jest suite is on the roadmap (issue #2 territory).

## Commit style

Conventional commits, loosely. The prefixes actually in use in this repo are:

- `feat:` — user-visible new capability
- `fix:` — bug fix that does not change behaviour on the happy path
- `ci:` — changes under `.github/workflows/`
- `docs:` — README, CONTRIBUTING, inline comment reshuffles
- `chore:` — dependency bumps, static asset updates, release prep

Commit bodies are welcome and encouraged for anything non-trivial. Explain *why*, not *what*.

## Filing issues

Use one of the templates under `.github/ISSUE_TEMPLATE/`. If none of them fit, open a blank one and be specific — "it does not work on Netflix" will get closed, "Netflix does not re-attach the overlay after switching episodes on Chrome 130" will get triaged.

## Filing pull requests

- Fork, branch, push, open a PR against `main`.
- CI must be green before review.
- Link the issue the PR fixes with `Closes #N` in the PR body so the merge auto-closes it.
- One PR, one change. A PR that ships two features will get asked to split.

## What I am most interested in right now

See the [issues](https://github.com/wtrwrldgo/safeview-ai/issues) page for the real backlog. The currently highest-impact PRs would be:

1. **Firefox MV3 port** (issue #1) — the hard part is replacing the `chrome.offscreen` document with a Firefox-compatible background worker that can load WASM.
2. **Distilled model under 50 MB** (issue #2) — student-teacher distillation from the current 327 MB model. Not a PR of code, necessarily, but a PR of a smaller `.onnx` file + a training recipe.
3. **Netflix lifecycle polish** (issue #4) — there are still edge cases around the player being swapped between episodes.

Thanks again for reading this far.
