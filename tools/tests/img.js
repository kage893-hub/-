const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright');
const SP = process.argv[2];
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e.stack || e)));
  await p.addInitScript(() => { window.__H = 13; const gh = Date.prototype.getHours; Date.prototype.getHours = function () { return window.__H; }; Date.prototype.getMinutes = function () { return 0; }; });
  await p.goto((process.env.BASE || 'http://localhost:8123') + '/index.html');
  await require(__dirname + '/start.js')(p, null);
  const ev = (f, a) => p.evaluate(f, a);
  const re = () => ev(() => { document.querySelector('[data-view=shop]').click(); document.querySelector('[data-view=case]').click(); });
  await ev(() => { const S = window.__leopaState(); S.tut = { step: 9 }; });
  await re(); await p.waitForTimeout(2500);
  await p.addStyleTag({ content: '.thermo,.cam-btn,.tank-name,.full-btn{display:none!important}' });
  await ev(() => { const T = window.__leopaTank(), s = T._st; s.x = 0; s.z = 1.5; s.mode = 'idle'; s.wait = 99; T.setClose(true); s.zoom = 2.2; s.elev = 0.14; s.orbit = -s.yaw; });
  await p.waitForTimeout(2500);
  for (const h of [13, 17.6, 22]) {
    await ev(h => { window.__H = Math.floor(h); window.__leopaTank().setClock(h, 'summer'); }, h);
    await p.waitForTimeout(1500);
    await p.locator('#tank').screenshot({ path: `${SP}/room-${h}.png` });
  }
  await ev(() => { window.__H = 13; window.__leopaTank().setClock(13, 'summer'); window.__leopaTank().setClose(false); });
  for (const th of ['expoGold', 'expoNight']) {
    await ev(th => { const S = window.__leopaState(), g = S.geckos.find(x => x.id === S.selected); g.cage = { size: 'std', theme: th }; document.querySelector('[data-view=shop]').click(); document.querySelector('[data-view=case]').click(); }, th);
    await p.waitForTimeout(2500);
    await p.locator('#tank').screenshot({ path: `${SP}/cage-${th}.png` });
  }
  console.log('thumb', await ev(() => new Promise(r => { const u = () => Leopa3D.itemPhoto('theme', 'expoGold'); let n = 0; const t = setInterval(() => { const x = u(); if (x || ++n > 40) { clearInterval(t); r(x ? x.length : x); } }, 300); })));
  await ev(() => { const S = window.__leopaState(); S.license = Date.now(); document.querySelector('[data-action=settings]').click(); });
  await p.waitForTimeout(400);
  await ev(() => document.querySelector('[data-action=licenseView]').click());
  await p.waitForTimeout(300);
  await p.fill('#licName', 'ももか'); await ev(() => document.querySelector('[data-action=licenseName]').click());
  await p.waitForTimeout(600);
  await p.locator('#sheetBody').screenshot({ path: `${SP}/license.png` });
  await ev(() => { window.__leopaState().kids = true; document.querySelector('[data-action=licenseView]') ; window.__leopaTank && 0; });
  console.log(JSON.stringify(errs)); await b.close();
})();
