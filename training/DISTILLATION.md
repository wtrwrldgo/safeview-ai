# Distillation plan — shrinking the 327 MB teacher to under 50 MB

This is the design note, not the artifact. Tracked as
[issue #2](https://github.com/wtrwrldgo/safeview-ai/issues/2).

## Problem

The production model is a 327 MB ONNX export of a fine-tuned
MobileNetV2-class backbone with four heads (nsfw / gore / horror / safe). The
size is the single biggest install friction — it blows past the 100 MB
GitHub file limit (which is why it lives in release assets, not the git repo)
and it turns sideloading into a multi-step curl dance instead of a one-click
experience.

The target is **under 50 MB**, ideally under 25 MB, with an accuracy drop of
no more than 2 percentage points on the existing validation set for each
head.

## Approach

Standard teacher-student distillation with two wrinkles:

1. **Student backbone**: MobileNetV3-Small (2.5 M params, roughly 10 MB
   exported). This is deliberately aggressive — if the accuracy drop is too
   large we fall back to MobileNetV3-Large (5.4 M params, roughly 22 MB).

2. **Soft-label loss on all four heads**: the student learns to match the
   teacher's softmaxed logits, not the hard labels. Temperature set to 4.0
   initially, tuned per head if some heads turn out to be noisier than others.
   Weighting across heads is equal until we see an uneven drop.

3. **Fixed capture pipeline**: the student is trained on exactly the input
   distribution the content script produces — 224×224 JPEG-0.3 frames, not
   the clean PNG frames the original teacher was trained on. This is the
   most important thing in the whole plan. A student trained on clean images
   will look great on a benchmark and then eat dirt in production because the
   JPEG quality 0.3 artifacts are out-of-distribution.

## Data

- Hold out the existing validation split untouched for the final comparison.
- The training set is the teacher's original training set passed through the
  same `canvas.toDataURL("image/jpeg", 0.3)` pipeline the extension uses, so
  the noise is baked in.
- No new labels are needed. The teacher's soft labels are the supervision.

## Evaluation

Per-head metrics on the frozen validation set:

- AUROC
- F1 at the default 0.50 threshold
- False positive rate at 0.95 recall (the skip-mode users care about this
  one more than anything else)

Latency on a 2020 MacBook Air, M1, WASM-SIMD backend, single-threaded. Target
is under 30 ms per frame (the current teacher sits around 55 ms).

## Integration

The student exports to the same four-head ONNX signature as the teacher, so
`offscreen.js` does not need code changes. The swap is purely replacing
`src/model/safeview_model.onnx` in the release asset. The Chrome Web Store
version would ship the student directly in the extension package once the
package is under the 100 MB extension size limit.

## Status

Not started. This document exists so that anyone (including future me) can
pick up the work with full context. Comment on
[issue #2](https://github.com/wtrwrldgo/safeview-ai/issues/2) if you want to
take a pass.
