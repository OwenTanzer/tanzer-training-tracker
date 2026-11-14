// From repo root: node tests/unreadableDraft.browser.mjs
// Requires Playwright/Chromium. PLAYWRIGHT_MODULE and CHROMIUM_EXECUTABLE
// can select an existing installation without changing project dependencies.
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const { chromium, webkit } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const stamp = '2026-07-01T12:00:00.000Z';
const session = { token: 'synthetic-only', instructorId: 'fixture-trainer', name: 'Synthetic Trainer', profilePhotoUrl: null, trainerSince: '2026-01-01', createdAt: stamp };
const vite = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false, ws: false },
  define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('https://draft-test.invalid') } });
const { emptyDatabase } = await vite.ssrLoadModule('/src/data/db.ts');
const fixture = emptyDatabase();
fixture.folders = [{ id: 'folder', name: 'Synthetic dogs', parentFolderId: null, sortOrder: 0, createdDate: stamp, updatedDate: stamp }];
fixture.dogs = [{ id: 'dog-1', name: 'Fixture Fern', folderId: 'folder', currentPhase: 'Phase 1', sortOrder: 0, profilePhoto: null, graduated: false, released: false, passBackCopies: [], passBackSource: null, createdDate: stamp, updatedDate: stamp }];
const key = 'ttt:log-draft:fixture-trainer:dog-1';
let browser;
try {
  await vite.listen();
  const origin = 'http://127.0.0.1:' + vite.httpServer.address().port;
  const engine = process.env.BROWSER === 'webkit' ? webkit : chromium;
  browser = await engine.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
  for (const blocked of [false, true]) {
    const context = await browser.newContext({viewport: {width: 390, height: 844}});
    let remote = structuredClone(fixture), puts = 0;
    await context.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.origin === origin) return route.continue();
      if (url.hostname !== 'draft-test.invalid') return route.abort();
      let body;
      if (url.pathname === '/api/photos') body = { url: origin + '/photo.png', key: 'fixture' };
      else if (url.pathname.includes('account')) body = session;
      else if (req.method() === 'PUT') { remote = req.postDataJSON().blob; body = { updatedAt: String(++puts + 1) }; }
      else body = { blob: remote, updatedAt: String(puts + 1), sharedReports: [] };
      await route.fulfill({ json: body });
    });
    await context.addInitScript(({ session, blocked }) => {
      sessionStorage.setItem('ttt:landing-seen', '1');
      localStorage.setItem('abbys-dog-chej:session', JSON.stringify(session));
      if (blocked) Object.defineProperty(window, 'indexedDB', { get() { throw new Error('unavailable'); } });
    }, { session, blocked });
    const page = await context.newPage();
    await page.goto(origin + '/dog/dog-1/report/new');
    await page.getByRole('heading', { name: 'New Training Log for Fixture Fern' }).waitFor();
    await page.locator('textarea').fill('New replacement log');

    const bytes = Buffer.concat([
      Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWZkAAAAASUVORK5CYII=', 'base64'),
      Buffer.alloc(6 * 1024 * 1024),
    ]);
    const attach = () => page.locator('input[type=file]').setInputFiles({ name: 'large.png', mimeType: 'image/png', buffer: bytes });
    await attach();
    await page.waitForFunction(() => !document.body.innerText.includes('Preparing draft photo'));
    if (blocked) await page.getByText('Photo is only in this tab.', { exact: false }).waitFor();
    else await page.getByText('Draft on this device.', { exact: true }).waitFor();
    assert((await page.evaluate(k => localStorage.getItem(k), key)).length < 4000);
    await page.reload();
    if (blocked) {
      await page.getByText('Reattach the photo or remove it.', { exact: false }).waitFor();
      await attach();
    } else await page.getByAltText('Preview').waitFor();
    assert.equal(await page.locator('textarea').inputValue(), 'New replacement log');
    await page.getByRole('button', { name: 'Save Log', exact: true }).click();
    await page.waitForURL('**/dog/dog-1');
    await page.getByRole('status').filter({ hasText: /^Saved to server$/ }).waitFor();
    assert.equal(remote.reports.length, 1);
    assert.equal(remote.reports[0].picture, origin + '/photo.png');
    await page.getByRole('button', { name: 'Log out' }).click();
    await page.waitForURL(origin + '/');
    console.log('PASS photo refresh, save and logout, blocked=' + blocked);
    await context.close();
  }
} finally { await browser?.close(); await vite.close(); }
