const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright');
const SP = process.argv[2];
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e.stack || e)));
  await p.addInitScript(() => { Date.prototype.getHours = function () { return 14; }; });
  await p.goto((process.env.BASE || 'http://localhost:8123') + '/index.html');
  await require(__dirname + '/start.js')(p, null);
  const click = s => p.evaluate(s => document.querySelector(s).click(), s);
  await p.evaluate(() => { const S = window.__leopaState(); S.tut = { step: 9 }; S.geckos.forEach(g => { g.growth = 220; g.hunger = 100; g.tame = 60; }); S.selected = S.geckos.find(g => g.sex === 'M').id; });
  await click('[data-view=shop]'); await click('[data-view=case]'); await p.waitForTimeout(2000);
  await click('[data-action=pairMenu]'); await p.waitForTimeout(300);
  await click('[data-action=pair]'); await p.waitForTimeout(500); await p.evaluate(() => { const D = window.__leopaTank()._st.pair.D; for (const k in D) D[k] = 0.6; });
  const t0 = Date.now(); let last = '';
  for (let i = 0; i < 120; i++) {
    await p.waitForTimeout(800);
    const r = await p.evaluate(() => { const T = window.__leopaTank(), st = T._st, R = st.pair; return { ph: T.pairing(), say: (document.querySelector('#pairSay') || {}).textContent, f: [st.x.toFixed(1), st.z.toFixed(1)], m: R ? [R.M.x.toFixed(1), R.M.y.toFixed(2), R.M.z.toFixed(1)] : null }; });
    console.log(((Date.now() - t0) / 1000).toFixed(1), JSON.stringify(r));
    if (r.ph !== last || i % 4 === 3) await p.locator('#tank').screenshot({ path: `${SP}/fast-${i}-${r.ph}.png` });
    last = r.ph;
    if (!r.ph) break;
  }
  console.log(await p.evaluate(() => [document.querySelector('.toast') && document.querySelector('.toast').textContent, !!document.querySelector('#pairBar'), window.__leopaState().geckos.map(g => !!g.gravid)]));
  console.log(JSON.stringify(errs)); await b.close();
})();
