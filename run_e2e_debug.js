const { chromium } = require('playwright');
const path = require('path');

(async () => {
    const extensionPath = path.join(__dirname);
    const userDataDir = '/tmp/test-user-data-dir3';

    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: true,
        args: [
            `--disable-extensions-except=${extensionPath}`,
            `--load-extension=${extensionPath}`
        ]
    });

    context.on('requestfailed', request => {
        console.log(`REQUEST FAILED [${request.failure().errorText}]: ${request.url()}`);
    });

    const page = await context.newPage();

    context.on('page', p => {
        p.on('console', msg => {
            if (msg.type() === 'error') console.log(`[${p.url()}] ERR LOG:`, msg.text());
        });
        p.on('pageerror', error => console.error(`[${p.url()}] ERROR:`, error));
    });

    await page.goto('https://www.youtube.com/watch?v=JcJ7561d8Mg', { waitUntil: 'networkidle' });

    console.log("Waiting 10 seconds for video processing...");
    await page.waitForTimeout(10000);

    console.log("Test finished.");
    await context.close();
})();
