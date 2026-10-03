const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const SP = process.argv[2];
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e.stack || e)));
  await p.goto((process.env.BASE || 'http://localhost:8123') + '/index.html');
  await require(__dirname + '/start.js')(p, null);
  const ev = (f, a) => p.evaluate(f, a);
  await ev(() => { const S = window.__leopaState(); S.tut = { step: 9 }; S.geckos.forEach(g => g.growth = 200); S.trophies = [{ rank: 1, name: S.geckos[0].name, date: '9/27' }]; document.querySelector('[data-view=shop]').click(); document.querySelector('[data-view=case]').click(); });
  await p.waitForTimeout(1200);
  for (const kids of [false, true]) {
    await ev(k => { window.__leopaState().kids = k; document.querySelector('[data-view=shop]').click(); document.querySelector('[data-view=case]').click(); }, kids);
    await p.waitForTimeout(600);
    await ev(() => document.querySelector('[data-action=profileCard]').click());
    await p.waitForFunction(() => document.querySelector('#sheetBody .shot-view img'), null, { timeout: 60000 });
    const url = await ev(() => document.querySelector('#sheetBody .shot-view img').src);
    fs.writeFileSync(`${SP}/card-${kids ? 'kids' : 'normal'}.jpg`, Buffer.from(url.split(',')[1], 'base64'));
    console.log('card', kids, url.length);
    await ev(() => document.querySelector('[data-action=closeSheet]').click());
  }
  await ev(() => { window.__leopaState().kids = false; });
  // ふ化（3D）
  await ev(() => { const S = window.__leopaState(), m = S.geckos.find(g => g.sex === 'F'), d = S.geckos.find(g => g.sex === 'M'); S.eggs.push({ id: 'etest', genes: { snow: 0, alb: 0, ecl: 0, bliz: 0, bell: 0, giant: 0 }, tang: 40, poly: m.poly, sex: 'F', temp: 29.5, laidAt: Date.now() - 1000, hatchAt: Date.now() - 1, mom: m.name, dad: d.name, gen: 2 }); document.querySelector('[data-view=eggs]').click(); });
  await p.waitForTimeout(600);
  await ev(() => document.querySelector('[data-action=hatch]').click());
  const shots = [800, 2500, 4000, 6000, 9000, 13000];
  let t0 = Date.now();
  for (const [i, at] of shots.entries()) {
    await p.waitForTimeout(Math.max(0, at - (Date.now() - t0)));
    const say = await ev(() => (document.querySelector('#hatchSay') || {}).textContent || (document.querySelector('#renameForm') ? '(名前のシート)' : ''));
    console.log(at, say);
    await p.locator('#sheetBody').screenshot({ path: `${SP}/hatch-${i}.png` });
    if (say === '(名前のシート)') break;
  }
  for (let i = 0; i < 30; i++) { if (await ev(() => !!document.querySelector('#renameForm'))) { console.log('名前のシートへ', i); break; } await p.waitForTimeout(1000); }
  console.log(JSON.stringify(errs)); await b.close();
})();
