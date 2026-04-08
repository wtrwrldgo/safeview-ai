const { chromium } = require('playwright');
const path = require('path');

(async () => {
    const extensionPath = path.join(__dirname);
    const userDataDir = '/tmp/test-user-youtube-ui2';

    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        recordVideo: {
            dir: '/Users/musabekisakov/.gemini/antigravity/brain/a6167769-2c42-44dc-b00f-286f72926488/',
            size: { width: 1280, height: 720 }
        },
        args: [
            `--disable-extensions-except=${extensionPath}`,
            `--load-extension=${extensionPath}`
        ]
    });

    const page = await context.newPage();
    await page.goto('https://www.youtube.com/watch?v=JcJ7561d8Mg', { waitUntil: 'load' });

    console.log("Waiting for video to load...");
    await page.waitForTimeout(6000);

    console.log("Forcing overlay trigger via DOM for UI capture...");

    await page.evaluate(() => {
        const overlay = document.getElementById('safeview-overlay');
        if (overlay) {
            overlay.style.display = 'flex';
            const causeEl = overlay.querySelector('#safeview-cause');
            if (causeEl) causeEl.textContent = 'Violence / Gore detected';

            // Re-trigger animation
            const badge = overlay.querySelector('#sv-badge');
            if (badge) {
                badge.style.animation = 'none';
                badge.offsetHeight; /* trigger reflow */
                badge.style.animation = null;
            }
        }
    });

    await page.waitForTimeout(1000); // Give CSS animations time to pop inward
    await page.screenshot({ path: '/Users/musabekisakov/.gemini/antigravity/brain/a6167769-2c42-44dc-b00f-286f72926488/youtube_premium_overlay.png' });
    console.log("Screenshot saved.");

    const videoPath = await page.video().path();
    await context.close();

    const fs = require('fs');
    fs.renameSync(videoPath, '/Users/musabekisakov/.gemini/antigravity/brain/a6167769-2c42-44dc-b00f-286f72926488/youtube_premium_overlay.webm');
    console.log("Video saved to walkthrough directory.");
})();
