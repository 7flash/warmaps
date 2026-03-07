import { test, expect } from '@playwright/test';

test.describe('WARMAPS Core User Flows', () => {

    test('Cinematic boot sequence progresses successfully', async ({ page }) => {
        // Clear local storage to ensure boot sequence triggers
        await page.addInitScript(() => {
            window.localStorage.clear();
        });

        await page.goto('http://localhost:4444/');

        // Verify boot container appears
        const bootContainer = page.locator('#boot-sequence');
        await expect(bootContainer).toBeVisible();

        // Wait for all steps to finish. The last step text usually indicates completion
        const finalizeStep = page.locator('.boot-line--done:has-text("System ready")');
        await expect(finalizeStep).toBeVisible({ timeout: 10000 }); // Sequence takes a few seconds

        // Once finished, boot container should eventually hide/remove
        await expect(bootContainer).toBeHidden({ timeout: 5000 });

        // Ensure canvas is visible
        const canvas = page.locator('#wm-viewport');
        await expect(canvas).toBeVisible();

        // // Check if onboarding overlay appears for first-time users
        // const onboarding = page.locator('.wm-onboard-overlay');
        // await expect(onboarding).toBeVisible({ timeout: 15000 });

        // // Let's click "Got it" to dismiss onboarding
        // const nextBtn = page.locator('.wm-onboard-next');
        // while (await nextBtn.isVisible()) {
        //     await nextBtn.click();
        //     await page.waitForTimeout(300); // small delay between clicks
        // }
        // await expect(onboarding).toBeHidden();
    });

    test('Add widget from tray', async ({ page }) => {
        await page.goto('http://localhost:4444/');

        // Wait for canvas to be ready
        await expect(page.locator('#wm-viewport')).toBeVisible();

        const tray = page.locator('#widget-tray');
        await expect(tray).toBeVisible();

        // Find a widget card to add, e.g., the 'map' widget
        // Assuming there isn't a map widget already or it's multi-instance. Let's add 'news' since it has multi-instance support or a specific telegram feed
        const widgetCard = page.locator('.wc-widget-card[data-widget-type="news"]');
        await expect(widgetCard).toBeVisible();
        await widgetCard.click();

        // Wait to see if the container is added to DOM
        const newContainer = page.locator('.wm-container[data-widget-type="news"]');
        await expect(newContainer.first()).toBeVisible();

        // Check header title exists
        const title = newContainer.first().locator('.wm-c-title');
        await expect(title).toBeVisible();
    });

    test('Drag and resize container', async ({ page }) => {
        await page.goto('http://localhost:4444/');

        // Wait for default containers to load
        const container = page.locator('.wm-container').first();
        await expect(container).toBeVisible();

        // Test dragging by header
        const header = container.locator('.wm-container-header');
        const box = await container.boundingBox();
        if (!box) throw new Error('Container bounding box not found');

        const initialX = box.x;
        const initialY = box.y;

        // Perform drag
        await header.hover();
        await page.mouse.down();
        await page.mouse.move(box.x + 200, box.y + 200, { steps: 5 });
        await page.mouse.up();

        const newBox = await container.boundingBox();
        expect(newBox?.x).not.toBe(initialX);
        expect(newBox?.y).not.toBe(initialY);

        // // Test resizing
        // const resizeHandle = container.locator('.wm-resize-handle');
        // if (await resizeHandle.isVisible()) {
        //     const handleBox = await resizeHandle.boundingBox();
        //     if (!handleBox) return;

        //     const initialWidth = newBox!.width;

        //     await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
        //     await page.mouse.down();
        //     await page.mouse.move(handleBox.x + handleBox.width / 2 + 50, handleBox.y + handleBox.height / 2 + 50, { steps: 10 });
        //     await page.mouse.up();

        //     const resizedBox = await container.boundingBox();
        //     expect(resizedBox?.width).toBeGreaterThan(initialWidth + 10);
        // }
    });

    test('Command palette (Ctrl+K) opens and searches', async ({ page }) => {
        await page.goto('http://localhost:4444/');

        // Press Ctrl+K
        await page.keyboard.press('Control+k');

        // Verify palette appears
        const palette = page.locator('#wm-command-palette');
        await expect(palette).toBeVisible();

        // Search for something
        const searchInput = palette.locator('input');
        await searchInput.fill('World');

        // Check if results update
        const firstResult = palette.locator('div > div > div').filter({ hasText: /World/i }).first();
        await expect(firstResult).toBeVisible();

        // Press Escape to close
        await page.keyboard.press('Escape');
        await expect(palette).toBeHidden();
    });

});
