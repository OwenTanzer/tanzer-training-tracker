// From repo root: node tests/unreadableDraft.browser.mjs
// Requires Playwright/Chromium. PLAYWRIGHT_MODULE and CHROMIUM_EXECUTABLE
// can select an existing installation without changing project dependencies.
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const stamp = '2026-07-01T12:00:00.000Z';
const session = { token: 'synthetic-only', instructorId: 'fixture-trainer', name: 'Synthetic Trainer', profilePhotoUrl: null, trainerSince: '2026-01-01', createdAt: stamp };
const vite = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false, ws: false },
  define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('https://draft-test.invalid') } });
const { emptyDatabase } = await vite.ssrLoadModule('/src/data/db.ts');
const fixture = emptyDatabase();
fixture.folders = [{ id: 'folder', name: 'Synthetic dogs', parentFolderId: null, sortOrder: 0, createdDate: stamp, updatedDate: stamp }];
fixture.dogs = [{ id: 'dog-1', name: 'Fixture Fern', folderId: 'folder', currentPhase: 'Phase 1', sortOrder: 0, profilePhoto: null, graduated: false, released: false, passBackCopies: [], passBackSource: null, createdDate: stamp, updatedDate: stamp }];
const key = 'ttt:log-draft:fixture-trainer:dog-1';
const cases = [
  { name: 'unsupported version', raw: JSON.stringify({ version: 2, report: { notes: 'ORIGINAL RECOVERABLE NOTES' } }) },
  { name: 'malformed JSON', raw: '{"report":{"notes":"ORIGINAL RECOVERABLE NOTES"}' },
  { name: 'ordinary new log', raw: null },
];
let browser;
try {
  await vite.listen();
  const origin = 'http://127.0.0.1:' + vite.httpServer.address().port;
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
  for (const sample of cases) {
    const context = await browser.newContext();
    let remote = structuredClone(fixture), puts = 0;
    await context.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.origin === origin) return route.continue();
      if (url.hostname !== 'draft-test.invalid') return route.abort();
      let body;
      if (url.pathname.includes('account')) body = session;
      else if (req.method() === 'PUT') { remote = req.postDataJSON().blob; body = { updatedAt: String(++puts + 1) }; }
      else body = { blob: remote, updatedAt: String(puts + 1), sharedReports: [] };
      await route.fulfill({ json: body });
    });
    await context.addInitScript(({ session, key, raw }) => {
      sessionStorage.setItem('ttt:landing-seen', '1');
      localStorage.setItem('abbys-dog-chej:session', JSON.stringify(session));
      if (raw !== null) localStorage.setItem(key, raw);
    }, { session, key, raw: sample.raw });
    const page = await context.newPage();
    await page.goto(origin + '/dog/dog-1/report/new');
    await page.getByRole('heading', { name: 'New Training Log for Fixture Fern' }).waitFor();
    await page.locator('textarea').fill('New replacement log');
    const save = page.getByRole('button', { name: 'Save Log', exact: true });
    if (sample.raw !== null) {
      assert.equal(await save.isDisabled(), true);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), key), sample.raw);
      const before = JSON.stringify(remote), writesBefore = puts;
      // Bypass the disabled button to exercise the actual submit-handler guard.
      await page.locator('form').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
      await page.getByText('The existing draft could not be read.', { exact: false }).waitFor();
      assert.equal(await page.evaluate(key => localStorage.getItem(key), key), sample.raw);
      assert.equal(JSON.stringify(remote), before);
      assert.equal(puts, writesBefore);
      assert(page.url().endsWith('/report/new'));
    } else {
      assert.equal(await save.isEnabled(), true);
      await save.click();
      await page.waitForURL('**/dog/dog-1');
      await page.getByText('Saved to server', { exact: true }).waitFor();
      assert(remote.reports.some(r => r.notes === 'New replacement log'));
      assert.equal(await page.evaluate(key => localStorage.getItem(key), key), null);
    }
    console.log('PASS: ' + sample.name);
    await context.close();
  }
} finally { await browser?.close(); await vite.close(); }
