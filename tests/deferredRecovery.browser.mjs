import { createServer } from 'vite';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const stamp = '2026-07-01T12:00:00.000Z';
const session = { token: 'synthetic-only', instructorId: 'fixture-trainer', name: 'Synthetic Trainer', profilePhotoUrl: null, trainerSince: '2026-01-01', createdAt: stamp };
const vite = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false, ws: false }, define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('https://recovery-test.invalid') } });
const { emptyDatabase } = await vite.ssrLoadModule('/src/data/db.ts');
const fixture = emptyDatabase();
fixture.folders = [{ id: 'folder', name: 'Synthetic dogs', parentFolderId: null, sortOrder: 0, createdDate: stamp, updatedDate: stamp }];
fixture.dogs = [{ id: 'dog-1', name: 'Roger', folderId: 'folder', currentPhase: 'Phase 1', sortOrder: 0, profilePhoto: null, graduated: false, released: false, passBackCopies: [], passBackSource: null, createdDate: stamp, updatedDate: stamp }];
let browser;
try {
  await vite.listen(); const origin = 'http://127.0.0.1:' + vite.httpServer.address().port;
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE || '/usr/bin/google-chrome' });
  for (const width of [320, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 844 } });
    let remote = structuredClone(fixture), puts = 0;
    remote.dogs[0].currentPhase = 'Phase 3';
    const local = structuredClone(fixture); local.dogs[0].currentPhase = 'Phase 2';
    await context.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.origin === origin) return route.continue();
      if (url.hostname !== 'recovery-test.invalid') return route.abort();
      let body;
      if (url.pathname.includes('account')) body = session;
      else if (req.method() === 'PUT') {
        const data = req.postDataJSON();
        assert.equal(data.expectedUpdatedAt, String(puts + 1));
        remote = data.blob; body = { updatedAt: String(++puts + 1) };
      } else body = { blob: remote, updatedAt: String(puts + 1), sharedReports: [] };
      await route.fulfill({ json: body });
    });
    await context.addInitScript(({ session, fixture, local }) => {
      sessionStorage.setItem('ttt:landing-seen', '1');
      localStorage.setItem('abbys-dog-chej:session', JSON.stringify(session));
      if (!localStorage.getItem('test-seeded')) {
        localStorage.setItem('test-seeded', '1');
        localStorage.setItem('abbys-dog-chej:outbox:' + session.instructorId, JSON.stringify({ base: fixture, local, revision: '1', batchId: 'conflict' }));
      }
    }, { session, fixture, local });
    const page = await context.newPage(); page.setDefaultTimeout(12000);
    console.log('START', width);
    page.on('pageerror', e => console.log('PAGE ERROR', e.message));
    await page.goto(origin + '/dog/dog-1');
    await page.getByRole('heading', { name: 'Your changes need attention' }).waitFor();
    const continuation = page.getByRole('button', { name: 'Continue to app', exact: true });
    assert(await continuation.isVisible());
    await page.screenshot({ path: `/tmp/dog-access-before-${width}.png`, fullPage: true });
    console.log('CONFLICT SHOWN', width); await continuation.click(); console.log('CLICKED CONTINUE', width);
    await page.getByRole('button', { name: 'Review earlier changes' }).waitFor();
    assert.equal(puts, 0);
    console.log('APP ENTERED', width); await page.reload();
    await page.getByRole('button', { name: 'Review earlier changes' }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Your changes need attention' }).count(), 0);
    console.log('REOPENED', width); await page.getByRole('link', { name: '+ New Training Log', exact: true }).click();
    await page.getByRole('heading', { name: 'New Training Log for Roger' }).waitFor();
    await page.locator('textarea').fill('New work while recovery is deferred');
    await page.getByRole('button', { name: 'Save Log', exact: true }).click();
    await page.waitForURL('**/dog/dog-1');
    await page.getByText('Saved to server', { exact: true }).waitFor();
    assert(remote.reports.some(r => r.notes === 'New work while recovery is deferred'));
    assert.equal(remote.dogs[0].currentPhase, 'Phase 3');
    await page.screenshot({ path: `/tmp/dog-access-after-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Review earlier changes' }).click();
    await page.getByRole('heading', { name: 'Your changes need attention' }).waitFor();
    await page.getByRole('button', { name: 'Use this version', exact: true }).first().click();
    await page.getByRole('button', { name: 'Confirm choice' }).click();
    await page.getByText('Saved to server', { exact: true }).waitFor();
    assert.equal(remote.dogs[0].currentPhase, 'Phase 2');
    assert(remote.reports.some(r => r.notes === 'New work while recovery is deferred'));
    console.log(`PASS ${width}: conflict -> continue -> reload -> new log reaches server -> later resolution retains new log`);
    await context.close();
  }
} finally { await browser?.close(); await vite.close(); }
