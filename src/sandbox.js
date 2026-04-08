import * as ort from 'onnxruntime-web'

// Configure WASM backend — files are copied to model/ by the build plugin
ort.env.wasm.wasmPaths = '../model/'

let _session = null
let _lastError = null

// SafeView custom EfficientNet-B0: 4-class classification
// Class order matches ImageFolder alphabetical sorting from training
const CLASS_NAMES = ['gore', 'horror', 'nsfw', 'safe']

// Normalization: mean=0.5, std=0.5 — MUST match training notebook
const NORM_MEAN = [0.5, 0.5, 0.5]
const NORM_STD = [0.5, 0.5, 0.5]

async function loadModel () {
  if (_session) return _session
  try {
    _session = await ort.InferenceSession.create('../model/safeview_model.onnx', {
      executionProviders: ['wasm']
    })
    console.log('[SafeView Sandbox] ONNX model loaded (EfficientNet-B0 4-class)')
  } catch (e) {
    _lastError = e.toString()
    console.error('[SafeView Sandbox] Error loading ONNX model:', _lastError)
  }
  return _session
}

function softmax (logits) {
  const maxLogit = Math.max(...logits)
  const exps = logits.map(x => Math.exp(x - maxLogit))
  const sumExps = exps.reduce((a, b) => a + b, 0)
  return exps.map(e => e / sumExps)
}

function preprocessImage (imageData, width, height) {
  const pixels = imageData.data
  const floatData = new Float32Array(1 * 3 * height * width)
  const planeSize = height * width

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4
      const dstIdx = y * width + x

      // Normalize: (pixel / 255 - 0.5) / 0.5  →  range [-1, 1]
      floatData[0 * planeSize + dstIdx] = (pixels[srcIdx] / 255 - NORM_MEAN[0]) / NORM_STD[0]
      floatData[1 * planeSize + dstIdx] = (pixels[srcIdx + 1] / 255 - NORM_MEAN[1]) / NORM_STD[1]
      floatData[2 * planeSize + dstIdx] = (pixels[srcIdx + 2] / 255 - NORM_MEAN[2]) / NORM_STD[2]
    }
  }

  return floatData
}

loadModel()

window.addEventListener('message', async (event) => {
  if (event.data && event.data.type === 'analyzeFrameOffscreen') {
    try {
      const session = await loadModel()
      if (!session) {
        event.source.postMessage({
          type: 'analyzeResult',
          id: event.data.id,
          error: 'Model not loaded: ' + _lastError
        }, event.origin)
        return
      }

      const img = new Image()
      img.src = 'data:image/jpeg;base64,' + event.data.imageBase64
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = () => reject(new Error('Failed to decode image'))
      })

      if (img.width === 0) {
        event.source.postMessage({
          type: 'analyzeResult', id: event.data.id,
          success: true, nsfwScore: 0, goreScore: 0, horrorScore: 0, safeScore: 1
        }, event.origin)
        return
      }

      const canvas = new OffscreenCanvas(224, 224)
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, 224, 224)
      const imageData = ctx.getImageData(0, 0, 224, 224)

      const floatData = preprocessImage(imageData, 224, 224)
      const inputTensor = new ort.Tensor('float32', floatData, [1, 3, 224, 224])

      // EfficientNet-B0: input="pixel_values", output="logits" with shape [1, 4]
      const results = await session.run({ pixel_values: inputTensor })
      const logits = Array.from(results.logits.data)
      const probs = softmax(logits)

      // CLASS_NAMES = ['gore', 'horror', 'nsfw', 'safe']
      const goreScore = probs[0]
      const horrorScore = probs[1]
      const nsfwScore = probs[2]
      const safeScore = probs[3]

      event.source.postMessage({
        type: 'analyzeResult',
        id: event.data.id,
        success: true,
        nsfwScore,
        goreScore,
        horrorScore,
        safeScore
      }, event.origin)
    } catch (err) {
      console.error('[SafeView Sandbox]', err)
      event.source.postMessage({
        type: 'analyzeResult',
        id: event.data.id,
        error: err.message
      }, event.origin)
    }
  }
})

window.parent.postMessage({ type: 'sandboxReady' }, '*')
