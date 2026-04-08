const { chromium } = require('playwright');
const path = require('path');

(async () => {
    const extensionPath = path.join(__dirname);
    const userDataDir = '/tmp/test-sandbox-debug';

    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        args: [
            `--disable-extensions-except=${extensionPath}`,
            `--load-extension=${extensionPath}`
        ]
    });

    const page = await context.newPage();

    page.on('console', msg => {
        console.log(`[PAGE LOG ${msg.type().toUpperCase()}]:`, msg.text());
    });
    page.on('pageerror', error => console.error(`[PAGE ERROR]:`, error));

    let backgroundPage = context.serviceWorkers()[0] || context.backgroundPages()[0];

    if (!backgroundPage) {
        console.log("Waiting for background page...");
        backgroundPage = await context.waitForEvent('serviceworker');
    }

    const url = backgroundPage.url();
    const extensionId = url.split('/')[2];
    console.log("Extension ID:", extensionId);

    await page.goto(`chrome-extension://${extensionId}/offscreen.html`);
    console.log("Opened offscreen.html");

    // Wait for sandbox to initialize and ONNX model to load
    await page.waitForTimeout(5000);

    // Check console logs for model load success/failure
    // The sandbox.js logs '[SafeView Sandbox] ONNX model loaded successfully' on success
    // or '[SafeView Sandbox] Error loading ONNX model:' on failure
    console.log("Check console logs above for ONNX model loading status.");
    console.log("Expected: '[SafeView Sandbox] ONNX model loaded successfully'");

    await page.waitForTimeout(2000);
    console.log("Test finished.");
    await context.close();
})();
