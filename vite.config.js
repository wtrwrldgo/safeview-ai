import { defineConfig } from 'vite'
import webExtension from 'vite-plugin-web-extension'
import { resolve, basename } from 'path'
import { cpSync, mkdirSync, globSync } from 'fs'

// Inline plugin to copy static assets that vite-plugin-web-extension doesn't handle
function copyStaticAssets() {
  return {
    name: 'copy-static-assets',
    writeBundle(options) {
      const outDir = options.dir || 'dist'

      // Copy ONNX Runtime WASM files to model/
      const modelDir = resolve(outDir, 'model')
      mkdirSync(modelDir, { recursive: true })
      const wasmFiles = globSync(resolve('node_modules/onnxruntime-web/dist/*.wasm'))
      for (const file of wasmFiles) {
        cpSync(file, resolve(modelDir, basename(file)))
      }

      // Copy ONNX Runtime MJS wrapper modules (required for WASM backend initialization)
      const mjsFiles = globSync(resolve('node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded*.mjs'))
      for (const file of mjsFiles) {
        cpSync(file, resolve(modelDir, basename(file)))
      }

      // Copy ONNX model file if it exists
      const modelSrc = resolve('src/model/safeview_model.onnx')
      try { cpSync(modelSrc, resolve(modelDir, 'safeview_model.onnx')) } catch {}

      // Copy icons
      const iconsDir = resolve(outDir, 'src/icons')
      mkdirSync(iconsDir, { recursive: true })
      for (const icon of globSync(resolve('src/icons/*'))) {
        cpSync(icon, resolve(iconsDir, basename(icon)))
      }

      // Copy mock_database.json
      try { cpSync(resolve('mock_database.json'), resolve(outDir, 'src/mock_database.json')) } catch {}

      // Copy offscreen files
      try { cpSync(resolve('src/offscreen.html'), resolve(outDir, 'src/offscreen.html')) } catch {}
      try { cpSync(resolve('src/offscreen.js'), resolve(outDir, 'src/offscreen.js')) } catch {}
    }
  }
}

export default defineConfig({
  plugins: [
    webExtension({
      manifest: './manifest.json',
      webAccessibleResources: {
        resources: [
          'mock_database.json',
          'model/*'
        ],
        matches: [
          '*://*.youtube.com/*',
          '*://*.netflix.com/*'
        ]
      }
    }),
    copyStaticAssets()
  ]
})
