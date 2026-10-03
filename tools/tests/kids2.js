const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright');
const SP = process.argv[2];
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await p.goto((process.env.BASE || 'http://localhost:8123') + '/index.html');
  await require(__dirname + '/start.js')(p, null);
  const click = s => p.evaluate(s => document.querySelector(s).click(), s);
  await p.evaluate(() => { const S = window.__leopaState(); S.tut = { step: 9 }; });
  const wide = () => p.evaluate(() => { const W = document.documentElement.clientWidth; return [document.documentElement.scrollWidth, [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > W + 1 && e.offsetParent).slice(0, 5).map(e => e.className + ':' + e.textContent.slice(0, 30))]; });
  for (const k of [0, 1]) {
    await p.evaluate(k => { window.__leopaState().kids = !!k; }, k);
    for (const v of ['shop', 'dex', 'eggs', 'case']) { await click(`[data-view=${v}]`); await p.waitForTimeout(600); console.log(k, v, JSON.stringify(await wide())); }
  }
  await p.evaluate(() => { window.__leopaState().kids = false; }); await click('[data-view=shop]'); await click('[data-view=case]'); await p.waitForTimeout(500);
  console.log('restored', await p.evaluate(() => /[一-鿿]/.test(document.body.innerText)), await p.title());
  await b.close();
})();
