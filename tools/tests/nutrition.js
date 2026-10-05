// 空腹・成長・しっぽの栄養。既存のrun.shと同じCHROME/PLAYWRIGHT/BASEで実行。
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const fs = require('fs'), assert = require('node:assert/strict');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/chromium' });
  try {
    const p = await b.newPage({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const errors = []; p.on('pageerror', e => errors.push(String(e)));
    await p.addInitScript(() => {
      const ctx = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (k, ...a) { return k.includes('webgl') ? null : ctx.call(this, k, ...a); };
    });
    // 検査用の関数公開はテストの配信だけに挿入し、製品コードには入れない。
    const app = fs.readFileSync(__dirname + '/../../js/app.js', 'utf8').replace(/\}\)\(\);\s*$/, 'window.__nutritionTest = { advanceNutrition, weightOf, applyEat, migrate };\n})();');
    await p.route('**/js/app.js', r => r.fulfill({ contentType: 'text/javascript', body: app }));
    await p.goto(process.env.BASE || 'http://localhost:8123');
    await require('./start.js')(p);
    const results = await p.evaluate(() => {
      const S = __leopaState(), N = __nutritionTest;
      const specimen = growth => ({ ...S.geckos[0], growth, hunger: 90, cond: 70, emptyH: 0, bone: 100, heat: 32, sick: null, shedUntil: 0, _shedMemo: true });
      const near = (a, b) => Math.abs(a - b) < 1e-7;
      const checks = [], check = (name, ok) => checks.push({ name, ok });
      for (const speed of [1, 3, 12]) for (const [stage, growth, interval] of [['baby', 0, 24], ['young', 60, 36], ['adult', 260, 72]]) {
        S.speed = speed; const g = specimen(growth); N.advanceNutrition(g, interval / Math.sqrt(speed), Date.now());
        check(`${speed}倍速 ${stage} 給餌間隔`, near(g.hunger, 30));
      }
      const legacy = JSON.parse(JSON.stringify(S)); delete legacy.geckos[0].emptyH;
      N.migrate(legacy); check('旧セーブの空腹時間を0で初期化しコインを維持', legacy.geckos[0].emptyH === 0 && legacy.coins === S.coins);
      for (const speed of [1, 3, 12]) for (const [growth, grace] of [[0, 12], [60, 24], [260, 48]]) {
        S.speed = speed; const g = specimen(growth); g.hunger = 0;
        N.advanceNutrition(g, grace / Math.sqrt(speed), Date.now());
        check(`0の猶予 ${growth}/${speed}`, near(g.cond, 70));
        N.advanceNutrition(g, 24 / Math.sqrt(speed), Date.now());
        check(`猶予後の減少 ${growth}/${speed}`, g.cond < 70 && g.cond > 65);
      }
      S.speed = 1;
      const a = specimen(0); a.hunger = 30; N.advanceNutrition(a, 2, Date.now()); check('30でも成長する', a.growth > 0);
      const zero = specimen(260); zero.hunger = 0; N.advanceNutrition(zero, 48, Date.now()); check('アダルト0から48時間は栄養を減らさない', zero.cond === 70);
      const weight = N.weightOf(zero); N.advanceNutrition(zero, 96, Date.now()); check('猶予後に緩やかに体重が減る', zero.cond < 70 && zero.cond > 65 && N.weightOf(zero) < weight);
      for (const growth of [0, 49.9, 139.9, 259.9]) for (const speed of [1, 3, 12]) {
        S.speed = speed; const whole = specimen(growth), split = specimen(growth);
        N.advanceNutrition(whole, 180, Date.now());
        for (let i = 0; i < 720; i++) N.advanceNutrition(split, .25, Date.now());
        check(`閉じた間と小刻み操作が同じ ${growth}/${speed}`, near(whole.hunger, split.hunger) && near(whole.growth, split.growth) && near(whole.cond, split.cond) && near(whole.emptyH, split.emptyH));
      }
      const starved = specimen(0); starved.hunger = 0; starved.emptyH = 20; S.speed = 1; N.applyEat(starved, 'cricketS', true);
      check('実際の給餌で空腹の累積をリセット', starved.hunger === 9 && starved.emptyH === 0);
      check('長期間でも体重が正で成長値は減らない', zero.growth === 260 && N.weightOf(zero) > 0);
      return checks;
    });
    assert.deepEqual(results.filter(r => !r.ok), []); assert.deepEqual(errors, []);
    console.log(`栄養テスト ${results.length}件 OK`); console.log(JSON.stringify(errors));
  } finally { await b.close(); }
})().catch(e => { console.error(e); process.exit(1); });
