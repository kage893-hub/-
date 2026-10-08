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
    const app = fs.readFileSync(__dirname + '/../../js/app.js', 'utf8').replace(/\}\)\(\);\s*$/, 'window.__nutritionTest = { advanceNutrition, weightOf, applyEat, migrate, bulkFeedLimit, checkSick, saveNow, actions: ACTIONS, setTank: t => { tank = t; } };\n})();');
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
      // まとめ入れ：実際の給餌処理と、捕食待ちのケースを使って在庫・粉・二重投入を検査。
      const g = S.geckos.find(x => x.id === S.selected);
      Object.assign(g, { growth: 260, hunger: 50, shedUntil: 0, pasteOk: 1, left: [] });
      Object.assign(S, { feedMode: 'drop', dust: true, calc: 2 });
      for (const k of ['cricketS', 'cricket', 'dubia', 'worm', 'paste']) S.food[k] = 20;
      const pending = [];
      const fakeTank = {
        pendingFoods: () => pending.map(f => f.kind), handling: () => false,
        spawnFood: (kind, opt) => pending.push({ kind, dust: opt.dust }),
        startTweezers: (kind, opt) => pending.push({ kind, dust: opt.dust, held: true })
      };
      N.setTank(fakeTank);
      const portions = { cricketS: 9, cricket: 15, dubia: 25, worm: 18, paste: 14 };
      for (const [k, portion] of Object.entries(portions)) for (const hunger of [0, 30, 50, 60, 70, 85, 89, 90, 100]) {
        g.hunger = hunger; const n = N.bulkFeedLimit(g, k);
        check(`まとめ入れの満腹上限 ${k}/${hunger}`, n >= 0 && hunger + n * portion <= 100 && (n === 0 || hunger + (n - 1) * portion < 90));
      }
      g.hunger = 50;
      N.actions.feed({ dataset: { kind: 'cricket', bulk: '1' } });
      check('3匹を入れた分だけ在庫を減らす', pending.length === 3 && S.food.cricket === 17 && g.hunger === 50);
      check('粉を一匹ずつ使い、途中で尽きても負にならない', S.calc === 0 && pending.filter(f => f.dust).length === 2);
      check('投入済みの餌を見込んで追加を止める', N.bulkFeedLimit(g, 'worm') === 0);
      N.actions.feed({ dataset: { kind: 'cricket', bulk: '1' } });
      check('連続操作でも二重投入しない', pending.length === 3 && S.food.cricket === 17);
      pending.length = 0; g.hunger = 60;
      check('デュビアで満腹100を超える分は入れない', N.bulkFeedLimit(g, 'dubia') === 1);
      pending.push({ kind: 'dubia' });
      check('違う種類の食べかけも数える', N.bulkFeedLimit(g, 'cricketS') === 1);
      pending.length = 0; g.hunger = 30; S.food.cricketS = 2;
      N.actions.feed({ dataset: { kind: 'cricketS', bulk: '1' } });
      check('在庫が上限より少なければ在庫まで', pending.length === 2 && S.food.cricketS === 0);
      pending.length = 0; S.food.cricketS = 20; g.growth = 0;
      check('ベビーには大きい餌をまとめて入れない', N.bulkFeedLimit(g, 'cricket') === 0 && N.bulkFeedLimit(g, 'dubia') === 0);
      g.shedDur = 40 * 60000; g.shedUntil = Date.now() + g.shedDur;
      check('脱皮前は一つずつ様子を見る', N.bulkFeedLimit(g, 'cricketS') === 0);
      g.shedUntil = 0; g.pasteOk = 0;
      check('なれていない練り餌をまとめて入れない', N.bulkFeedLimit(g, 'paste') === 0);
      const pasteStock = S.food.paste;
      N.actions.feed({ dataset: { kind: 'paste', bulk: '1' } });
      check('危険なまとめ入れは在庫・食べ残しを増減しない', S.food.paste === pasteStock && pending.length === 0 && g.left.length === 0);
      g.pasteOk = 1;
      N.actions.feed({ dataset: { kind: 'paste', bulk: '1' } });
      check('なれた練り餌は回分でまとめ、粉を使わない', pending.length === 5 && pending.every(f => f.kind === 'paste' && !f.dust) && S.food.paste === pasteStock - 5);
      pending.length = 0; S.feedMode = 'tw';
      N.actions.feed({ dataset: { kind: 'cricketS', bulk: '1' } });
      check('ピンセットは一匹ずつ', pending.length === 1 && pending[0].held);
      N.setTank(null); S.feedMode = 'drop'; g.hunger = 50; g.growth = 260;
      N.actions.feed({ dataset: { kind: 'cricket', bulk: '1' } });
      check('3D非対応でもまとめた分を実際に食べる', g.hunger === 95 && S.food.cricket === 14 && g.left.length === 0);
      // 体調不良の猶予と受診。3つの原因それぞれを速度別に検査する。
      const day = 24 * 60 * 60 * 1000;
      for (const speed of [1, 3, 12]) for (const cause of ['mouth', 'bone', 'tummy']) {
        S.speed = speed;
        const patient = { ...specimen(260), id: 'clinic-test', clean: 100, poop: 0, bone: 100, heat: 32, wormRun: 0, bad: {}, sick: null };
        if (cause === 'mouth') patient.clean = 0;
        if (cause === 'bone') patient.bone = 0;
        if (cause === 'tummy') patient.heat = 28;
        N.checkSick(patient, 3 * day / Math.sqrt(speed), Date.now());
        check(`${speed}倍速 ${cause} 以前の発症時間ではまだ健康`, !patient.sick);
        N.checkSick(patient, 3 * day / Math.sqrt(speed) + 1, Date.now());
        check(`${speed}倍速 ${cause} 2倍の時間で発症`, patient.sick?.type === cause);
      }
      S.speed = 1;
      Object.assign(g, { sick: { type: 'mouth', at: Date.now() }, bad: { mouth: day, bone: day * 5, tummy: day * 4 }, clean: 0, poop: 3, bone: 0, heat: 28 });
      S.coins = 9; const beforeBad = JSON.stringify(g.bad);
      N.actions.clinic();
      check('9コインでは受診できず原因の蓄積も消えない', S.coins === 9 && !!g.sick && JSON.stringify(g.bad) === beforeBad);
      S.coins = 10; N.actions.clinic();
      check('10コインで治りすべての原因時間を完全リセット', S.coins === 0 && !g.sick && Object.keys(g.bad).length === 0);
      N.saveNow();
      const saved = JSON.parse(localStorage.getItem('leopa-together-v1')).geckos.find(x => x.id === g.id);
      check('受診後のリセットがセーブにも残る', !saved.sick && Object.keys(saved.bad).length === 0);
      N.actions.clinic(); check('治ったあとの再操作で二重請求しない', S.coins === 0 && !g.sick);
      N.checkSick(g, day, Date.now());
      check('原因が残っていても受診直後から再び数え直す', !g.sick && ['mouth', 'bone', 'tummy'].every(k => g.bad[k] === day));
      const past = JSON.parse(JSON.stringify(S)); delete past.clinicApology;
      past.coins = 100;
      const clinicMemo = { t: Date.now() - day, text: 'どうぶつ病院でみてもらって、元気になった' };
      past.albums = { living: { entries: [clinicMemo, { text: 'ごはんを食べた' }] }, departed: { entries: [clinicMemo, clinicMemo] } };
      N.migrate(past);
      check('更新時に現在と旅立った子の受診3回分で60コインを配る', past.coins === 160 && past.clinicApology.visits === 3 && past.clinicApology.coins === 60);
      N.migrate(past); check('移行を繰り返してもお詫びを重複配布しない', past.coins === 160);
      past.albums.living.entries.push(clinicMemo); N.migrate(past);
      check('更新後の受診はお詫びに加算しない', past.coins === 160 && past.clinicApology.visits === 3);
      const none = JSON.parse(JSON.stringify(S)); delete none.clinicApology; none.coins = 100; delete none.albums;
      N.migrate(none); check('受診記録がない旧セーブも配布済み0回にする', none.coins === 100 && none.clinicApology.visits === 0);
      none.albums = { living: { entries: [clinicMemo] } }; N.migrate(none);
      check('更新時0回でも、その後の受診にお詫びを出さない', none.coins === 100);
      const current = JSON.parse(JSON.stringify(S)), currentCoins = current.coins; N.migrate(current);
      check('新しく始めたセーブの受診も対象外', current.coins === currentCoins && current.clinicApology.visits === 0);
      return checks;
    });
    assert.deepEqual(results.filter(r => !r.ok), []); assert.deepEqual(errors, []);
    console.log(`栄養テスト ${results.length}件 OK`); console.log(JSON.stringify(errors));
  } finally { await b.close(); }
})().catch(e => { console.error(e); process.exit(1); });
