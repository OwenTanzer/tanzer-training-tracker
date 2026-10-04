// Optional browser evidence: NODE_PATH=<directory containing playwright> node tests/distractionLogs.browser.cjs
// Start Vite with VITE_API_BASE_URL=http://127.0.0.1:4174 on port 4173 first.
// The fixture API is intercepted in an isolated browser context. No real account or network API is used.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const stamp = '2026-07-01T12:00:00.000Z';
const base = { createdDate: stamp, updatedDate: stamp };
const session = { token: 'synthetic-only', instructorId: 'fixture-trainer', name: 'Synthetic Trainer', profilePhotoUrl: null, trainerSince: '2026-01-01', createdAt: stamp };
const dog = (id, name) => ({ ...base, id, name, folderId: 'folder', currentPhase: 'Phase 1', sortOrder: 0, profilePhoto: null, graduated: false, graduatedDate: null, released: false, releasedDate: null, releasedByTerminalOutcome: false, excludedFromStats: false, graduationProgress: 0, graduationStatus: 'Not Started', passBackCopies: [], passBackSource: null });
const log = (id, date, distractions, notes, dogId = 'dog-1') => ({ ...base, id, dogId, sessionDate: date, distractions, notes, phase: 'Phase 1', locationId: 'park', redFlag: false, picture: null, skillIds: ['skill'], milestoneIds: ['milestone'], authorInstructorId: session.instructorId, visibility: 'shared' });
const traffic = (severity) => ({ distractionId: 'traffic', severity });
const blob = {
  folders: [{ ...base, id: 'folder', name: 'Synthetic dogs', parentFolderId: null, sortOrder: 0 }],
  dogs: [dog('dog-1', 'Fixture Fern'), dog('dog-2', 'Fixture Moss')],
  reports: [
    log('older', '2026-07-01', [traffic('Absent')], 'Quiet practice; traffic explicitly absent.'),
    log('newest', '2026-07-03', [traffic('Severe'), { distractionId: 'dogs', severity: 'Mild' }], 'Paused beside the park entrance, then recovered.'),
    log('middle', '2026-07-02', [traffic('Moderate')], ''),
    log('notes-only', '2026-07-04', [], 'traffic mentioned only in notes — excluded'),
    log('other-dog', '2026-07-05', [traffic('Mild')], 'Moss only: must not appear for Fern.', 'dog-2'),
    log('retired', '2026-07-01', [{ distractionId: 'retired-category', severity: 'Absent' }], 'Historical category remains accessible.'),
  ],
  locations: [{ ...base, id: 'park', name: 'Synthetic Park', lastUsedDate: stamp }],
  distractionTemplates: [{ ...base, id: 'traffic', title: 'Traffic', sortOrder: 0 }, { ...base, id: 'dogs', title: 'Other dogs', sortOrder: 1 }, { ...base, id: 'unlogged', title: 'Unlogged category', sortOrder: 2 }],
  checklistItems: [{ ...base, id: 'skill', title: 'Fixture heel', phase: 'Phase 1', description: '', requiredForGraduation: true, sortOrder: 0 }],
  milestoneTemplates: [{ ...base, id: 'milestone', title: 'Fixture crossing', phase: 'Phase 1', sortOrder: 0, isFinalOutcomeMilestone: false, isTerminalOutcomeMilestone: false, repeatable: false, allowedOutcomes: [] }],
  completions: [], dogMilestoneCompletions: [], milestoneOutcomeAttempts: [], dogEvents: [], templatesMigratedToAbbyDefaults: true, pinnedFolderId: null,
};
// A separate shared projection intentionally reuses the visible title. It must never enter analytics.
blob.dogs[0].passBackSource = { linkId: 'link', instructorId: 'foreign', instructorName: 'Other Trainer', dogId: 'foreign-dog', linkedDate: stamp };
const sharedReports = [{ ...base, id: 'shared:link:foreign', dogId: 'dog-1', sourceInstructorId: 'foreign', sourceDogId: 'foreign-dog', sourceReportId: 'foreign', authorInstructorName: 'Other Trainer', phase: 'Phase 1', sessionDate: '2026-07-06', locationLabel: 'Foreign location', notes: 'SHARED OVERLAY ONLY', picture: null, skillLabels: [], milestoneLabels: [], distractionLabels: [{ title: 'Traffic', severity: 'Severe' }] }];

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.TEST_CHROMIUM_PATH ? { executablePath: process.env.TEST_CHROMIUM_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage'] } : {}) });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'America/Los_Angeles' });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [], writes = [], external = [], checks = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === 'http://127.0.0.1:4174') {
      if (route.request().method() !== 'GET') { writes.push(url.pathname); return route.abort(); }
      const data = url.pathname === '/api/data' ? { blob, updatedAt: stamp, sharedReports } : session;
      return route.fulfill({ json: data, headers: { 'Access-Control-Allow-Origin': '*' } });
    }
    if (url.origin !== 'http://127.0.0.1:4173') { external.push(url.href); return route.abort(); }
    return route.continue();
  });
  await context.addInitScript((value) => {
    localStorage.setItem('abbys-dog-chej:session', JSON.stringify(value));
    sessionStorage.setItem('ttt:landing-seen', '1');
  }, session);
  const out = path.resolve('docs/evidence/issue-71-review');
  fs.mkdirSync(out, { recursive: true });
  const dialog = page.getByRole('dialog');
  const card = () => page.getByRole('button', { name: /^Traffic View matching logs/ });
  const waitClosed = async () => {
    await page.waitForURL((url) => !url.searchParams.has('distraction'));
    await dialog.waitFor({ state: 'hidden' });
  };
  await page.goto('http://127.0.0.1:4173/folders');
  await page.goto('http://127.0.0.1:4173/dog/dog-1');
  await card().waitFor();
  // Close from details must not leave the dismissed category in Back/Forward.
  await card().tap();
  await dialog.getByRole('button', { name: 'Open full log details' }).first().tap();
  await dialog.getByRole('button', { name: 'Close', exact: true }).tap();
  await waitClosed();
  await page.goBack();
  await waitClosed();
  assert.equal(new URL(page.url()).searchParams.has('distraction'), false, 'Back after Close reopened dismissed logs');
  await page.goBack();
  await page.waitForURL('**/folders');
  await page.goForward();
  await waitClosed();
  assert.equal(new URL(page.url()).searchParams.has('distraction'), false, 'Forward after Close reopened dismissed logs');
  checks.push('Detail Close skips dismissed category on browser Back/Forward while preserving earlier page');

  // Back to matching logs returns to the original category entry.
  await card().tap();
  await dialog.getByRole('button', { name: 'Open full log details' }).first().tap();
  await dialog.getByRole('button', { name: /Back to matching logs/ }).tap();
  await dialog.locator('time').first().waitFor();
  await page.goBack();
  await waitClosed();
  await page.goForward();
  await dialog.locator('time').first().waitFor();
  await dialog.getByRole('button', { name: /Back to summary/ }).tap();
  await waitClosed();
  await page.goBack();
  await waitClosed();
  await page.goBack();
  await page.waitForURL('**/folders');
  await page.goForward();
  await waitClosed();
  await page.goForward();
  await waitClosed();
  checks.push('Back to matching logs and Back to summary do not duplicate category history');

  await card().tap();
  await dialog.getByRole('button', { name: 'Open full log details' }).first().tap();
  await dialog.getByTitle('Edit log').tap();
  const editForms = page.locator('form:has(input[type=date]):has(button:text-is("Save"))');
  assert.equal(await editForms.count(), 1, 'Modal and Log History mounted duplicate editors');
  await dialog.locator('textarea').first().fill('UNSAVED MODAL DRAFT');
  await page.goBack();
  await dialog.locator('time').first().waitFor();
  assert.equal(await editForms.count(), 0, 'Editor stayed mounted after leaving modal details');
  await page.goBack();
  await waitClosed();
  assert.equal(await editForms.count(), 0);
  await page.goForward();
  await dialog.locator('time').first().waitFor();
  await page.goForward();
  await dialog.getByTitle('Edit log').waitFor();
  assert.equal(await editForms.count(), 0, 'Forward unexpectedly reopened edit mode');
  await dialog.getByText(/Unsaved draft available/).waitFor();
  await page.screenshot({ path: `${out}/phone-unsaved-draft.png` });
  await dialog.getByTitle('Edit log').tap();
  assert.equal(await editForms.count(), 1);
  assert.equal(await dialog.locator('textarea').first().inputValue(), 'UNSAVED MODAL DRAFT');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).tap();
  assert.equal(await editForms.count(), 0);
  assert.equal(await dialog.getByText(/Unsaved draft available/).count(), 0);
  await dialog.getByRole('button', { name: 'Close', exact: true }).tap();
  await waitClosed();
  checks.push('Modal edit uses one form; Back twice deactivates it; Forward stays in view mode; draft resumes and Cancel discards');
  await card().tap();
  await dialog.getByRole('button', { name: 'Open full log details' }).first().tap();
  await dialog.getByRole('button', { name: /Back to matching logs/ }).tap();
  await dialog.getByRole('button', { name: /Back to summary/ }).tap();
  await waitClosed();
  await page.goForward();
  await dialog.getByTitle('Edit log').waitFor();
  await dialog.getByRole('button', { name: /Back to matching logs/ }).tap();
  await dialog.locator('time').first().waitFor();
  await dialog.getByRole('button', { name: 'Close', exact: true }).tap();
  await waitClosed();
  checks.push('Forward to a retained detail after dismissing its category uses the direct-link list fallback');
  const historySection = page.getByRole('heading', { name: 'Log History' }).locator('..');
  await historySection.getByTitle('Edit log').first().click();
  await historySection.locator('textarea').first().fill('CROSS ROUTE DRAFT');
  await page.getByRole('link', { name: /Folders/ }).click();
  await page.waitForURL('**/folders');
  assert.equal(await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    dispatchEvent(event);
    return event.defaultPrevented;
  }), true, 'A hard exit from another route would silently lose the dirty draft');
  await page.goBack();
  await historySection.getByText(/Unsaved draft available/).first().waitFor();
  await historySection.getByTitle('Edit log').first().click();
  assert.equal(await historySection.locator('textarea').first().inputValue(), 'CROSS ROUTE DRAFT');
  await historySection.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    dispatchEvent(event);
    return event.defaultPrevented;
  }), false, 'Cancel should clear the hard-exit warning');
  checks.push('In-tab route departure preserves a dirty Log History draft until Cancel');
  assert.equal(await page.getByRole('button', { name: /^Unlogged category View/ }).count(), 0);
  await card().scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${out}/phone-summary.png` });
  await card().tap();
  await dialog.waitFor();
  assert.match(await dialog.innerText(), /3 matching logs/);
  assert.deepEqual(await dialog.locator('time').evaluateAll((els) => els.map((e) => e.dateTime)), ['2026-07-03', '2026-07-02', '2026-07-01']);
  assert.match(await dialog.innerText(), /Recorded severity: Absent/);
  assert.match(await dialog.innerText(), /No session notes recorded/);
  assert.doesNotMatch(await dialog.innerText(), /Moss only|SHARED OVERLAY ONLY|mentioned only in notes/);
  assert.equal(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth), true);
  await page.screenshot({ path: `${out}/phone-matching-logs.png` });
  checks.push('390px: one-tap opening; selected category; count; session-date order; Absent; notes/context; dog and shared-overlay isolation; no horizontal overflow');
  await dialog.getByRole('button', { name: 'Open full log details' }).first().tap();
  await dialog.getByText('Skills worked on: Fixture heel').waitFor();
  assert.match(await dialog.innerText(), /Milestones worked on: Fixture crossing/);
  assert.match(await dialog.innerText(), /Traffic \(Severe\), Other dogs \(Mild\)/);
  await page.screenshot({ path: `${out}/phone-log-details.png` });
  await dialog.getByRole('button', { name: '← Back to matching logs' }).tap();
  await dialog.locator('time').first().waitFor();
  await dialog.getByRole('button', { name: '← Back to summary' }).tap();
  await waitClosed();
  await card().tap();
  await dialog.getByRole('button', { name: 'Open full log details' }).first().tap();
  await page.goBack();
  await dialog.locator('time').first().waitFor();
  await page.goBack();
  await waitClosed();
  checks.push('Full existing details, visible Back controls, repeated category selection and browser Back from detail/list');
  await card().tap();
  await dialog.getByRole('button', { name: 'Close', exact: true }).tap();
  await waitClosed();
  await card().tap();
  await dialog.waitFor({ state: 'visible' });
  await page.keyboard.press('Escape');
  await waitClosed();
  await page.getByRole('button', { name: /^Other dogs View/ }).tap();
  assert.match(await dialog.innerText(), /1 matching log/);
  await dialog.getByRole('button', { name: 'Close', exact: true }).tap();
  await page.getByRole('button', { name: /^Unknown distraction \(retired-category\) View/ }).tap();
  assert.match(await dialog.innerText(), /Historical category remains accessible/);
  await dialog.getByRole('button', { name: 'Open full log details' }).tap();
  await dialog.getByText(/Distractions: Unknown distraction \(retired-category\) \(Absent\)/).waitFor();
  checks.push('Close, Escape, different/repeated selections and retired category labels in summary/list/details');
  await page.goto('http://127.0.0.1:4173/dog/dog-1?distraction=missing');
  await dialog.getByText(/No training logs for this dog record this category/).waitFor();
  await page.screenshot({ path: `${out}/phone-empty-state.png` });
  await dialog.getByRole('button', { name: 'Close', exact: true }).tap();
  await page.goto('http://127.0.0.1:4173/dog/dog-1?distraction=traffic&distractionLog=deleted');
  await dialog.getByText(/This log is no longer available/).waitFor();
  await dialog.getByRole('button', { name: /Back to matching logs/ }).tap();
  await dialog.locator('time').first().waitFor();
  await dialog.getByRole('button', { name: 'Close', exact: true }).tap();
  await waitClosed();
  await page.goto('http://127.0.0.1:4173/dog/dog-1?distraction=traffic&distractionLog=newest');
  await dialog.getByTitle('Edit log').waitFor();
  await page.keyboard.press('Escape');
  await waitClosed();
  await page.goBack();
  await waitClosed();
  checks.push('Direct detail links, missing/deleted record fallback and Escape close preserve prior history');
  await page.evaluate(() => { history.pushState({}, '', '/dog/dog-1?distractionLog=newest'); dispatchEvent(new PopStateEvent('popstate')); });
  await page.evaluate(() => { history.pushState({}, '', '/dog/dog-1?distraction=traffic&distractionLog=newest'); dispatchEvent(new PopStateEvent('popstate')); });
  await dialog.getByTitle('Edit log').tap();
  await dialog.locator('textarea').first().fill('CATEGORY REMOVAL DRAFT');
  await page.goBack();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await editForms.count(), 0);
  await page.goForward();
  await dialog.getByTitle('Edit log').waitFor();
  assert.equal(await editForms.count(), 0);
  await dialog.getByText(/Unsaved draft available/).waitFor();
  await dialog.getByTitle('Edit log').tap();
  assert.equal(await dialog.locator('textarea').first().inputValue(), 'CATEGORY REMOVAL DRAFT');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).tap();
  await dialog.getByRole('button', { name: 'Close', exact: true }).tap();
  await waitClosed();
  checks.push('Removing the category while retaining a detail ID deactivates edit; Forward resumes in view mode');
  // Client-side navigation exercises the same mounted route without a reload.
  await page.evaluate(() => { history.pushState({}, '', '/dog/dog-2'); dispatchEvent(new PopStateEvent('popstate')); });
  await page.getByRole('heading', { name: 'Fixture Moss', exact: true }).waitFor();
  await card().tap();
  assert.match(await dialog.innerText(), /1 matching log/);
  await dialog.getByText(/Moss only/).waitFor();
  assert.doesNotMatch(await dialog.innerText(), /Quiet practice|Paused beside/);
  // Change dog while the previous dog's detail URL is open, preserving stale query parameters.
  await dialog.getByRole('button', { name: 'Open full log details' }).tap();
  await dialog.getByRole('button', { name: '← Back to matching logs' }).waitFor();
  await dialog.getByTitle('Edit log').tap();
  await dialog.locator('textarea').first().fill('MOSS UNSAVED DRAFT');
  await page.evaluate(() => { history.pushState({}, '', '/dog/dog-1?distraction=traffic&distractionLog=other-dog'); dispatchEvent(new PopStateEvent('popstate')); });
  await dialog.getByText(/This log is no longer available/).waitFor();
  assert.doesNotMatch(await dialog.innerText(), /Moss only/);
  assert.equal(await editForms.count(), 0);
  await page.evaluate(() => { history.pushState({}, '', '/dog/dog-2?distraction=traffic&distractionLog=other-dog'); dispatchEvent(new PopStateEvent('popstate')); });
  await dialog.getByText(/Unsaved draft available/).waitFor();
  await dialog.getByTitle('Edit log').tap();
  assert.equal(await dialog.locator('textarea').first().inputValue(), 'MOSS UNSAVED DRAFT');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).tap();
  checks.push('Empty state; switching dogs deactivates the editor and retains that dog’s draft; stale detail URL cannot expose another dog’s log');
  await dialog.getByRole('button', { name: 'Close', exact: true }).tap();
  await page.setViewportSize({ width: 320, height: 740 });
  await card().tap();
  await dialog.waitFor({ state: 'visible' });
  assert.equal(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth), true);
  checks.push('320px matching-list layout has no horizontal overflow');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: `${out}/desktop-matching-logs.png` });
  assert.deepEqual(errors, []);
  assert.deepEqual(writes, []);
  assert.deepEqual(external, []);
  checks.push('No page errors, API writes or external/production requests');
  fs.writeFileSync(`${out}/browser-results.json`, JSON.stringify({ status: 'passed', checks, errors, writes, external }, null, 2) + '\n');
  console.log(JSON.stringify({ status: 'passed', checks }, null, 2));
  await browser.close();
})().catch((error) => { console.error(error); process.exit(1); });
