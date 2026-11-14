import { createServer } from 'vite';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const { webkit } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const stamp = '2026-07-01T12:00:00.000Z';
const session = { token: 'synthetic-only', instructorId: 'fixture-trainer', name: 'Synthetic Trainer', profilePhotoUrl: null, trainerSince: '2026-01-01', createdAt: stamp };
const vite = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false, ws: false }, define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('https://ack-test.invalid') } });
const { emptyDatabase } = await vite.ssrLoadModule('/src/data/db.ts');
const fixture = emptyDatabase();
fixture.folders = [{ id: 'folder', name: 'Synthetic dogs', parentFolderId: null, sortOrder: 0, createdDate: stamp, updatedDate: stamp }];
fixture.dogs = [{ id: 'dog-1', name: 'Wisdom', folderId: 'folder', currentPhase: 'Phase 4', sortOrder: 0, profilePhoto: null, graduated: false, released: false, passBackCopies: [], passBackSource: null, createdDate: stamp, updatedDate: stamp }];
let browser;
try {
  await vite.listen(); const origin = 'http://127.0.0.1:' + vite.httpServer.address().port;
  browser = await webkit.launch({ headless: true });
  for (const width of [320, 390]) for (const mode of ['ack', 'offline', 'edit-during-ack', 'cleanup-failure']) {
    const context = await browser.newContext({ viewport: { width, height: 844 } });
    let remote = structuredClone(fixture), writes = 0, release;
    const gate = new Promise(r => { release = r; });
    let signal; const requested = new Promise(r => { signal = r; });
    await context.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.origin === origin) return route.continue();
      if (url.hostname !== 'ack-test.invalid') return route.abort();
      let body;
      if (url.pathname.includes('account')) body = session;
      else if (req.method() === 'PUT') {
        signal();
        if (mode === 'offline') return route.abort();
        await gate;
        const data = req.postDataJSON();
        assert.equal(data.expectedUpdatedAt, String(writes + 1));
        remote = data.blob; body = { updatedAt: String(++writes + 1) };
      } else body = { blob: remote, updatedAt: String(writes + 1), sharedReports: [] };
      await route.fulfill({ json: body });
    });
    await context.addInitScript(({ session }) => {
      sessionStorage.setItem('ttt:landing-seen', '1');
      localStorage.setItem('abbys-dog-chej:session', JSON.stringify(session));
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key.includes(':outbox:') || key.includes(':server-cache:')) throw new DOMException('Quota', 'QuotaExceededError');
        return original.call(this, key, value);
      };
    }, { session });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    await page.goto(origin + '/dog/dog-1/report/new');
    await page.getByRole('heading', {name: 'New Training Log for Wisdom'}).waitFor();
    await page.locator('textarea').fill('Test log');
    if (mode === 'cleanup-failure') await page.evaluate(() => {
      const original = Storage.prototype.removeItem;
      Storage.prototype.removeItem = function(key) { if (key.startsWith('ttt:log-draft:')) throw new Error('Device removal denied'); return original.call(this, key); };
    });
    await page.getByRole('button', {name: 'Save Log', exact: true}).click();
    await requested;
    await page.getByText('The device copy could not be stored.', {exact: false}).waitFor();
    assert(page.url().endsWith('/report/new'));
    assert.equal(await page.getByText('Saved to server · device copy unavailable', {exact:true}).count(), 0);
    if (mode === 'offline') {
      assert.equal(remote.reports.length, 0);
      console.log('PASS', width, mode, 'unconfirmed save retains form and warning');
      release(); await context.close(); continue;
    }
    if (mode === 'edit-during-ack') await page.locator('textarea').fill('Latest unsent notes');
    release();
    if (mode === 'edit-during-ack') {
      await page.getByText('Your earlier submitted version was saved to the server.', {exact:false}).waitFor();
      assert(page.url().endsWith('/report/new'));
      assert.equal(await page.locator('textarea').inputValue(), 'Latest unsent notes');
      await page.getByRole('button', {name: 'Save Log', exact:true}).click();
    }
    await page.waitForURL('**/dog/dog-1');
    await page.getByText('Saved to server · device copy unavailable', {exact:true}).waitFor();
    assert.equal(remote.reports.length, 1);
    assert.equal(remote.reports[0].notes, mode === 'edit-during-ack' ? 'Latest unsent notes' : 'Test log');
    await page.getByRole('link', {name: '+ New Training Log', exact:true}).waitFor();
    await page.screenshot({path: `/tmp/dog-ack-${width}-${mode}.png`, fullPage:true});
    await page.reload();
    await page.getByText(remote.reports[0].notes, {exact:true}).waitFor();
    await page.getByRole('link', {name: '+ New Training Log', exact:true}).click();
    await page.getByRole('heading', {name: 'New Training Log for Wisdom'}).waitFor();
    assert.equal(await page.locator('textarea').inputValue(), '');
    console.log('PASS', width, mode, 'confirmed log survives reload; next form starts fresh');
    await context.close();
  }
} finally { await browser?.close(); await vite.close(); }
