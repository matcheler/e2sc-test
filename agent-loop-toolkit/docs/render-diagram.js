// Render docs/agent-loop-diagram.html to a PNG with Playwright's Chromium.
// Usage: node docs/render-diagram.js <path to node_modules/playwright-core> <html> <png>
// The image size is taken from the #c element in the HTML, so a change of layout needs no change here.
const { chromium } = require(process.argv[2]);
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1580, height: 900 }, deviceScaleFactor: 2 });
  await page.goto('file:///' + process.argv[3].replace(/\\/g, '/'));
  const box = await page.locator('#c').boundingBox();
  await page.screenshot({ path: process.argv[4], clip: { x: 0, y: 0, width: Math.ceil(box.width), height: Math.ceil(box.height) } });
  await browser.close();
})();
