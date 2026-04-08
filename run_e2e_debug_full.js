const { chromium } = require('playwright');
const path = require('path');

(async () => {
    const extensionPath = path.join(__dirname, 'dist');
    const userDataDir = '/tmp/test-user-data-dir-full';

    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,  // Run headful to ensure extensions are 100% active
        args: [
            `--disable-extensions-except=${extensionPath}`,
            `--load-extension=${extensionPath}`
        ]
    });

    const page = await context.newPage();

    page.on('console', msg => {
        console.log(`[PAGE LOG]:`, msg.text());
    });

    console.log("Navigating to YouTube...");
    await page.goto('https://www.youtube.com/watch?v=JcJ7561d8Mg', { waitUntil: 'load' });

    await page.waitForTimeout(5000); // give video time to load

    const injected = await page.evaluate(() => {
        return typeof window.chrome !== 'undefined' && typeof window.chrome.runtime !== 'undefined';
    });
    console.log("Is chrome API present in page context?", injected);

    // Check if our overlay exists
    const overlayExists = await page.evaluate(() => {
        return !!document.getElementById('safeview-overlay');
    });
    console.log("Overlay present in DOM?", overlayExists);

    // Close
    await context.close();
})();
