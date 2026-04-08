const { chromium } = require('playwright');
const path = require('path');

(async () => {
    const extensionPath = path.join(__dirname);
    const userDataDir = '/tmp/test-user-youtube-screenshot';

    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        args: [
            `--disable-extensions-except=${extensionPath}`,
            `--load-extension=${extensionPath}`
        ]
    });

    const page = await context.newPage();

    console.log("Navigating to https://www.youtube.com/watch?v=cloRHQivlx0&t=5355s ...");
    await page.goto('https://www.youtube.com/watch?v=cloRHQivlx0&t=5355s', { waitUntil: 'load' });

    try {
        const rejectAll = page.locator('button:has-text("Reject all")');
        if (await rejectAll.count() > 0) {
            await rejectAll.first().click();
        }
    } catch (e) { }

    await page.waitForTimeout(3000);

    // force play to render a frame
    await page.evaluate(() => {
        const v = document.querySelector('video');
        if (v) {
            v.play();
            v.muted = true;
        }
    });

    await page.waitForTimeout(5000);

    // Disable our overlay so we can actually see the video frame
    await page.evaluate(() => {
        const el = document.getElementById('safeview-overlay');
        if (el) el.style.display = 'none';
    });

    await page.screenshot({ path: '/Users/musabekisakov/.gemini/antigravity/brain/a6167769-2c42-44dc-b00f-286f72926488/user_video_frame.png' });
    console.log("Saved video frame to artifacts.");

    await context.close();
})();
