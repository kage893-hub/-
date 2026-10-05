// 1年生の問題と報酬。画面の漢字問題がひらがな変換されないことも確認。
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const assert = require('node:assert/strict'), fs = require('fs');
require('../../js/study.js');
for (let n = 0; n < 200; n++) for (const subject of ['math', 'language']) {
  const round = global.LeopaStudy.makeRound(subject);
  assert.equal(round.length, 5);
  assert.equal(new Set(round.map(q => q.prompt + q.expression)).size, 5);
  for (const q of round) {
    assert.equal(q.choices.length, 3); assert.equal(new Set(q.choices).size, 3); assert(q.choices.includes(q.answer));
    if (subject === 'math') {
      assert(Number(q.answer) >= 0 && Number(q.answer) <= 20);
      const m = q.expression.match(/^(\d+) ([＋−]) (\d+) ＝/);
      if (m) assert.equal(Number(q.answer), m[2] === '＋' ? Number(m[1]) + Number(m[3]) : Number(m[1]) - Number(m[3]));
    }
  }
}
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/chromium' });
  let offlineBrowser;
  try {
    const p = await b.newPage({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const errors = []; p.on('pageerror', e => errors.push(String(e)));
    await p.addInitScript(() => {
      const ctx = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (k, ...a) { return k.includes('webgl') ? null : ctx.call(this, k, ...a); };
    });
    const app = fs.readFileSync(__dirname + '/../../js/app.js', 'utf8').replace(/\}\)\(\);\s*$/, 'window.__studyTest = { run: () => studyRun, ACTIONS, migrate };\n})();');
    await p.route('**/js/app.js', r => r.fulfill({ contentType: 'text/javascript', body: app }));
    await p.goto(process.env.BASE || 'http://localhost:8123'); await require('./start.js')(p);
    const click = selector => p.evaluate(s => document.querySelector(s).click(), selector);
    assert.equal(await p.locator('[data-action=studyMenu]').count(), 0);
    await p.evaluate(() => __studyTest.ACTIONS.studyStart({ dataset: { subject: 'math' } }));
    assert.equal(await p.evaluate(() => __studyTest.run()), null);
    await p.evaluate(() => {
      const S = __leopaState(), legacy = JSON.parse(JSON.stringify(S)); delete legacy.study;
      const migrated = __studyTest.migrate(legacy); if (migrated.study.rewarded !== 0 || migrated.coins !== S.coins) throw Error('旧データの引き継ぎ');
      S.kids = true; S.tut = { step: 99 }; document.querySelector('[data-view=case]').click();
    });
    const before = await p.evaluate(() => __leopaState().coins);
    await click('[data-action=studyMenu]'); await click('[data-action=studyStart][data-subject=math]');
    const correct = async () => {
      await p.evaluate(() => {
        const r = __studyTest.run(), q = r.questions[r.index], i = q.choices.indexOf(q.answer);
        __studyTest.ACTIONS.studyAnswer({ dataset: { token: String(r.token), index: String(i) } });
      });
    };
    await p.evaluate(() => {
      const r = __studyTest.run(), q = r.questions[r.index], i = q.choices.findIndex(a => a !== q.answer);
      __studyTest.ACTIONS.studyAnswer({ dataset: { token: String(r.token), index: String(i) } });
    });
    assert.equal(await p.evaluate(() => __leopaState().coins), before);
    assert.match(await p.locator('.study-feedback').innerText(), /もういちど/);
    await correct(); await correct();
    assert.equal(await p.evaluate(() => __leopaState().coins), before + 2);
    const stale = await p.evaluate(() => { const r = __studyTest.run(); return { token: String(r.token), index: String(r.questions[r.index].choices.indexOf(r.questions[r.index].answer)) }; });
    await click('[data-action=studyNext]');
    await p.evaluate(dataset => __studyTest.ACTIONS.studyAnswer({ dataset }), stale);
    assert.equal(await p.evaluate(() => __leopaState().coins), before + 2);
    for (let i = 1; i < 5; i++) { await correct(); await click('[data-action=studyNext]'); }
    assert.match(await p.locator('.study-finish').innerText(), /5もん とけたね/);
    assert.equal(await p.evaluate(() => __leopaState().coins), before + 10);
    await click('[data-action=studyMenu]'); await click('[data-action=studyStart][data-subject=language]');
    for (let i = 0; i < 5; i++) {
      if (i === 1 || i === 4) {
        await p.waitForTimeout(100);
        const q = await p.evaluate(() => __studyTest.run().questions[__studyTest.run().index]);
        assert.equal(await p.locator('.study-expression').innerText(), q.expression);
      }
      assert(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
      await correct(); await click('[data-action=studyNext]');
    }
    assert.equal(await p.evaluate(() => __leopaState().coins), before + 20);
    await click('[data-action=closeSheet]'); await p.reload();
    assert.equal(await p.evaluate(() => __leopaState().study.rewarded), 10);
    await click('[data-action=studyMenu]'); await click('[data-action=studyStart][data-subject=math]'); await correct();
    assert.equal(await p.evaluate(() => __leopaState().coins), before + 20);
    await click('[data-action=studyNext]');
    await p.evaluate(() => {
      const Original = Date, later = Original.now() + 86400000;
      window.Date = class extends Original { constructor(...a) { super(...(a.length ? a : [later])); } static now() { return later; } };
    });
    await correct(); assert.equal(await p.evaluate(() => __leopaState().coins), before + 22);
    await click('[data-action=closeSheet]');
    await p.evaluate(() => { __leopaState().kids = false; document.querySelector('[data-view=case]').click(); });
    assert.equal(await p.locator('[data-action=studyMenu]').count(), 0);
    const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('leopa-together-v1')));
    assert.equal(saved.study.total, 12); assert.equal(saved.study.rewarded, 1);
    assert.deepEqual(errors, []);
    // 初回のキャッシュ完了後は、ネットなしでも新しい問題ファイルを読み込める。
    await b.close();
    offlineBrowser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/chromium' });
    const context = await offlineBrowser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'allow' });
    const offline = await context.newPage();
    await offline.addInitScript(s => {
      if (!localStorage.getItem('leopa-together-v1')) { s.kids = true; s.study = { day: '', rewarded: 0, total: 0 }; localStorage.setItem('leopa-together-v1', JSON.stringify(s)); }
      const ctx = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (k, ...a) { return k.includes('webgl') ? null : ctx.call(this, k, ...a); };
    }, saved);
    await offline.goto(process.env.BASE || 'http://localhost:8123');
    await offline.waitForFunction(() => navigator.serviceWorker.controller?.state === 'activated', null, { timeout: 30000 });
    assert(await offline.evaluate(async () => (await caches.match('js/study.js')) != null));
    await context.setOffline(true); await offline.reload();
    await offline.locator('[data-action=studyMenu]').click(); await offline.locator('[data-action=studyStart][data-subject=math]').click();
    assert.match(await offline.locator('.study-expression').innerText(), /＋/); await context.close();
    console.log('問題400セット・モード制限・再挑戦・重複報酬防止・日付更新・保存・オフライン OK'); console.log(JSON.stringify(errors));
  } finally { if (offlineBrowser) await offlineBrowser.close(); await b.close(); }
})().catch(e => { console.error(e); process.exit(1); });
