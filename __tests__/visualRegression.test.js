/**
 * @jest-environment puppeteer
 */
jest.setTimeout(30000);    

const { toMatchImageSnapshot } = require('jest-image-snapshot');
expect.extend({ toMatchImageSnapshot });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

describe('Visual Regression Scenarios', () => {
  beforeAll(async () => {
    await page.goto('http://127.0.0.1:5500/index.html', {
      waitUntil: 'networkidle2',
    });
  });

  it('1. Initial empty state', async () => {
    const image = await page.screenshot({ fullPage: true });
    expect(image).toMatchImageSnapshot({ customSnapshotIdentifier: 'initial' });
  });

  it('2. Artist dropdown populated', async () => {
    await page.waitForFunction(
      () => document.querySelectorAll('#artist option').length > 1
    );
    const el = await page.$('#artist');
    await el.evaluate(e => e.scrollIntoView());
    const image = await el.screenshot();
    expect(image).toMatchImageSnapshot({
      customSnapshotIdentifier: 'artist-dropdown',
    });
  });

  it('3. Color chips rendered', async () => {
    await page.waitForSelector('#color-options .color-option');
    const el = await page.$('#color-options');
    await el.evaluate(e => e.scrollIntoView());
    const image = await el.screenshot();
    expect(image).toMatchImageSnapshot({
      customSnapshotIdentifier: 'color-chips',
    });
  });

  it('4. Gallery after filter applied', async () => {

    await page.waitForSelector(
      '#color-options .color-option input[type=checkbox]'
    );
    await page.$eval(
      '#color-options .color-option input[type=checkbox]',
      cb => cb.click()
    );
    await page.click('#applyColorFilter');

    await page.waitForSelector('#gallery div');
    const el = await page.$('#gallery');
    await el.evaluate(e => e.scrollIntoView());
    const image = await el.screenshot();
    expect(image).toMatchImageSnapshot({
      customSnapshotIdentifier: 'gallery-filtered',
    });
  });

  it('5. Graph collapsed state', async () => {
    await page.waitForSelector('#graph svg');
    const el = await page.$('#graph svg');
    await el.evaluate(e => e.scrollIntoView());
    const image = await el.screenshot();
    expect(image).toMatchImageSnapshot({
      customSnapshotIdentifier: 'graph-collapsed',
    });
  });

  it('6. Graph cluster expanded', async () => {
    // tap a cluster placeholder
    await page.waitForSelector('circle[fill="orange"], circle[fill="purple"]');
    await page.click('circle[fill="orange"], circle[fill="purple"]');

    await sleep(1500);

    const el = await page.$('#graph svg');
    await el.evaluate(e => e.scrollIntoView());
    const image = await el.screenshot();
    expect(image).toMatchImageSnapshot({
      customSnapshotIdentifier: 'graph-expanded',
    });
  });

  it('7. Timeline default state', async () => {
    await page.waitForSelector('#timeline svg');
    const el = await page.$('#timeline svg');
    await el.evaluate(e => e.scrollIntoView());
    const image = await el.screenshot();
    expect(image).toMatchImageSnapshot({
      customSnapshotIdentifier: 'timeline-default',
    });
  });

  it('8. Timeline hover state', async () => {
    await page.hover('.timelineCircle');
    
    await sleep(300);

    const el = await page.$('#timeline svg');
    await el.evaluate(e => e.scrollIntoView());
    const image = await el.screenshot();
    expect(image).toMatchImageSnapshot({
      customSnapshotIdentifier: 'timeline-hover',
    });
  });

  it('9. Map markers default state', async () => {
    await page.waitForSelector('#map .leaflet-marker-icon');
    const el = await page.$('#map');
    await el.evaluate(e => e.scrollIntoView());
    const image = await el.screenshot();
    expect(image).toMatchImageSnapshot({
      customSnapshotIdentifier: 'map-default',
    });
  });

  it('10. Responsive view (mobile)', async () => {
    await page.setViewport({ width: 375, height: 667 });
    await page.reload({ waitUntil: 'networkidle2' });
    const image = await page.screenshot({ fullPage: true });
    expect(image).toMatchImageSnapshot({
      customSnapshotIdentifier: 'responsive-mobile',
    });
  });
});
