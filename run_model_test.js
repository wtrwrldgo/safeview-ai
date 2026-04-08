const { chromium } = require('playwright');
const path = require('path');

(async () => {
    const extensionPath = path.join(__dirname);
    const userDataDir = '/tmp/test-user-youtube-threshold3';

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

    page.on('console', msg => {
        console.log('PAGE LOG:', msg.text());
    });

    context.on('serviceworker', async worker => {
        worker.on('console', msg => {
            console.log('BG LOG:', msg.text());
        });
    });

    // Also hook into background script directly
    let [background] = context.serviceWorkers();
    if (!background) {
        background = await context.waitForEvent('serviceworker');
    }
    background.on('console', msg => console.log('BG WORKER LOG:', msg.text()));

    console.log("Navigating to https://www.youtube.com/watch?v=cloRHQivlx0&t=5355s ...");
    await page.goto('https://www.youtube.com/watch?v=cloRHQivlx0&t=5355s', { waitUntil: 'load' });

    try {
        const rejectAll = page.locator('button:has-text("Reject all")');
        if (await rejectAll.count() > 0) {
            await rejectAll.first().click();
        }
    } catch (e) { }

    await page.waitForTimeout(3000);

    await page.evaluate(() => {
        const v = document.querySelector('video');
        if (v) {
            v.play();
            v.muted = true;
        }
    });

    console.log("Playing video for 10 seconds to monitor AI scoring...");

    await page.waitForTimeout(10000);

    console.log("Forcing UI trigger to capture the new black/gray neutral colors...");
    await page.evaluate(() => {
        const overlay = document.getElementById('safeview-overlay');
        if (overlay) {
            overlay.style.display = 'flex';
            const causeEl = overlay.querySelector('#safeview-cause');
            if (causeEl) causeEl.textContent = 'Violence / Gore detected';
            const badge = overlay.querySelector('#sv-badge');
            if (badge) {
                badge.style.animation = 'none';
                badge.offsetHeight;
                badge.style.animation = null;
            }
        }
    });

    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(__dirname, 'final_neutral_ui.png') });

    const videoPath = await page.video().path();
    console.log("Test finished.");
    await context.close();

    const fs = require('fs');
    fs.renameSync(videoPath, path.join(__dirname, 'final_e2e_test.webm'));
})();
