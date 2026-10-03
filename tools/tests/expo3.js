const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const SP = process.argv[2];
// 問題の正解（各問の選択肢の先頭）をソースから取り出す
const src = fs.readFileSync(__dirname + '/../../js/app.js', 'utf8');
const ANS = {};
for (const m of src.matchAll(/\['([^']+？)', \['([^']+)'/g)) ANS[m[1]] = m[2];
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e.stack || e)));
  await p.addInitScript(() => {
    const RD = Date; let off = new RD('2026-10-01T13:00:00').getTime() - RD.now();
    class FD extends RD { constructor(...a) { if (!a.length) super(RD.now() + off); else super(...a); } static now() { return RD.now() + off; } }
    window.Date = FD; window.__setNow = s => { off = new RD(s).getTime() - RD.now(); };
  });
  await p.goto((process.env.BASE || 'http://localhost:8123') + '/index.html');
  await require(__dirname + '/start.js')(p, null);
  const ev = (f, a) => p.evaluate(f, a);
  const re = () => ev(() => { document.querySelector('[data-view=shop]').click(); document.querySelector('[data-view=case]').click(); });
  await ev(() => { const S = window.__leopaState(); S.tut = { step: 9 }; S.coins = 3000; });
  await re(); await p.waitForTimeout(600);
  console.log('木', await ev(() => !!document.querySelector('.expo-banner')));
  await ev(() => window.__setNow('2026-10-02T13:00:00')); await re(); await p.waitForTimeout(600);
  console.log('金', await ev(() => !!document.querySelector('.expo-banner')), await ev(() => window.__leopaState().expo && window.__leopaState().expo.day));
  // ライセンス：わざと3問まちがえて不合格 → もう一度で合格
  async function quiz(wrong) {
    let n = 0;
    for (let i = 0; i < 20; i++) {
      const t = await ev(() => { const h = document.querySelector('#sheetBody .sheet-title'); return document.querySelector('#sheetBody [data-action=quizAns]') ? h.textContent : null; });
      if (!t) break;
      n++;
      const ans = ANS[t];
      await ev(([ans, bad]) => { const rows = [...document.querySelectorAll('#sheetBody [data-action=quizAns]')]; const r = rows.find(x => (x.innerText.trim() === ans) !== bad); r.click(); }, [ans, i < wrong]);
      await p.waitForTimeout(120);
    }
    return n;
  }
  await ev(() => document.querySelector('[data-action=settings]').click()); await p.waitForTimeout(300);
  await ev(() => document.querySelector('[data-action=licenseStart]').click()); await p.waitForTimeout(300);
  const n1 = await quiz(3);
  console.log('1回目', n1, '問', await ev(() => document.querySelector('#sheetBody .sheet-title').textContent), await ev(() => !!window.__leopaState().license));
  await ev(() => document.querySelector('#sheetBody [data-action=licenseStart]').click()); await p.waitForTimeout(300);
  const n2 = await quiz(2);
  console.log('2回目', n2, '問', await ev(() => document.querySelector('#sheetBody .sheet-title').textContent), await ev(() => !!window.__leopaState().license));
  await ev(() => document.querySelector('[data-action=closeSheet]').click());
  for (const t of ['2026-10-04T10:05:00', '2026-10-04T12:05:00', '2026-10-04T15:05:00', '2026-10-04T18:05:00', '2026-10-04T20:05:00', '2026-10-04T21:30:00']) {
    await ev(t => window.__setNow(t), t); await re(); await p.waitForTimeout(300);
    console.log(t.slice(11, 16), await ev(() => { const E = window.__leopaState().expo; return E.stock.filter(o => !o.sold && !o.other).length; }));
  }
  console.log(JSON.stringify(errs)); await b.close();
})();
