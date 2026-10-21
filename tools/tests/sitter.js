const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const fs = require('fs'), assert = require('node:assert/strict');
(async () => {
 const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/chromium' });
 try {
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' }), errors = [];
  p.on('pageerror', e => errors.push(String(e)));
  await p.addInitScript(() => {
   const RealDate = Date; let saved; try { saved = JSON.parse(localStorage.getItem('leopa-together-v1')); } catch (e) { /* 初回 */ }
   window.__sitterNow = saved?.lastTick || RealDate.now();
   window.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [window.__sitterNow])); } static now() { return window.__sitterNow; } };
   const ctx = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (k, ...a) { return k.includes('webgl') ? null : ctx.call(this, k, ...a); };
   const interval = window.setInterval; window.__sitterIntervals = []; window.setInterval = (...a) => { const id = interval(...a); __sitterIntervals.push(id); return id; };
  });
  const app = fs.readFileSync(__dirname + '/../../js/app.js', 'utf8').replace(/\}\)\(\);\s*$/, 'window.__sitterTest = { simulate, sitterCare, sitterActive, sitterFoodEstimate, normalizeSitter, migrate, applyEat, saveNow, actions:ACTIONS, setState:s=>{S=s;} };})();');
  await p.route('**/js/app.js', r => r.fulfill({ contentType: 'application/javascript', body: app }));
  await p.goto(process.env.BASE || 'http://localhost:8123'); await require('./start.js')(p);
  const results = await p.evaluate(() => {
   __sitterIntervals.forEach(clearInterval);
   const T = __sitterTest, H = 3600000, D = 24 * H, base = structuredClone(__leopaState()), now = Date.now(), checks = [];
   const check = (name, ok, data) => { checks.push({ name, ok, data }); if (!ok) throw Error(name + ' ' + JSON.stringify(data)); };
   const setup = (speed = 1, count = 1, growth = 260) => {
    window.__sitterNow = now;
    const s = structuredClone(base), sample = s.geckos[0];
    Object.assign(s, { coins: 1000, speed, cases: 30, eggs: [], layBox: [], sitter: null, lastTick: now, food: { cricketS: 2000, cricket: 2000, dubia: 0, worm: 0, paste: 0 }, calc: 4000, dust: true, learned: {}, daily: { day: '', fed: 0, cleaned: 0, handled: 0, claimed: false, streak: 0 } });
    s.geckos = Array.from({ length: count }, (_, i) => ({ ...structuredClone(sample), id: 'sitter-' + i, name: 'レオパ' + (i + 1), growth, hunger: 60, clean: 20, poop: 2, poopAt: 0, left: ['cricketS'], shedUntil: 0, _shedMemo: false, sick: null, bad: {}, gravid: null, restUntil: 0, adopted: now - 7 * D, born: now - 70 * D, waterAt: now - 3 * D, decor: [{ t: 'dish', x: 0, z: 0 }], bone: 100, cond: 55, emptyH: 0, mile: {}, wlog: [] }));
    s.selected = s.geckos[0].id; T.setState(s); return s;
   };
   const buy = () => { T.actions.sitterMenu(); const btn = document.querySelector('[data-action=sitterBuy]'); const target = { dataset: { quote: btn.dataset.quote } }; T.actions.sitterBuy(target); return target; };
   for (const speed of [1, 3, 12]) {
    const s = setup(speed, 30, 0), token = buy();
    check(speed + '倍でも全30匹・100コイン・実時間24時間', s.coins === 900 && s.sitter.until - s.sitter.startedAt === D && s.sitter.meals === 30);
    check('ベビーにはSだけを使う ' + speed, s.sitter.food.cricketS === 120 && s.sitter.food.cricket === 0 && s.calc === 3880);
    check('全員の掃除と水替え ' + speed, s.sitter.cleans === 30 && s.sitter.waters === 30 && s.geckos.every(g => g.poop === 0 && g.clean === 100 && g.waterAt === now));
    check('自動給餌はコイン・今日のおせわ・なれ度・学習・初回給餌実績を増やさない ' + speed, s.coins === 900 && !s.daily.fed && !s.daily.cleaned && !s.learned.calcium && s.geckos.every(g => !g.mile.eat && g.tame === base.geckos[0].tame));
    T.actions.sitterBuy(token); check('同じ購入ボタンの二重処理を止める ' + speed, s.coins === 900 && s.sitter.until === now + D);
    window.__sitterNow = now + D; T.simulate(Date.now());
    check('24時間後は自動終了し全員を給餌 ' + speed, s.sitter.finished && !s.sitter.seen && !T.sitterActive(Date.now()) && s.geckos.every(g => g.hunger >= 59 && g.clean >= 69 && g.poop === 0));
    const stock = JSON.stringify(s.food), fees = s.coins, meals = s.sitter.meals;
    window.__sitterNow += D; T.simulate(Date.now());
    check('期限後はエサ・コイン・お世話回数を追加しない ' + speed, JSON.stringify(s.food) === stock && s.coins === fees && s.sitter.meals === meals);
   }
   const compare = [];
   for (const fine of [false, true]) {
    const s = setup(12); buy();
    if (fine) for (let i = 1; i <= 24 * 60; i++) { window.__sitterNow = now + i * 60000; T.simulate(Date.now()); }
    else { window.__sitterNow = now + D; T.simulate(Date.now()); }
    compare.push({ hunger: s.geckos[0].hunger, cond: s.geckos[0].cond, stock: { ...s.food }, report: structuredClone(s.sitter) });
   }
   check('閉じた24時間と毎分開いた24時間の給餌・在庫・報告が一致', Math.abs(compare[0].hunger - compare[1].hunger) < 1e-7 && Math.abs(compare[0].cond - compare[1].cond) < 1e-7 && JSON.stringify(compare[0].stock) === JSON.stringify(compare[1].stock) && JSON.stringify(compare[0].report) === JSON.stringify(compare[1].report), compare);
   let s = setup(); buy(); const until = s.sitter.until; s.speedOpen = true; window.__sitterNow += 6 * H; T.actions.setSpeed({ dataset: { x: '12' } }); check('倍速変更前の6時間は元の速さで処理する', Math.abs(s.geckos[0].hunger - 85) < 1e-7 && s.sitter.until === until); buy();
   check('途中の倍速変更は期限を変えず100コインで24時間延長', s.coins === 800 && s.sitter.until === until + D && s.sitter.startedAt === now);
   s = setup(); s.coins = 99; buy(); check('残高不足は契約も課金もしない', !s.sitter && s.coins === 99);
   s = setup(); s.food = { cricketS: 0, cricket: 0, dubia: 0, worm: 0, paste: 0 }; const forecast = T.sitterFoodEstimate(24); buy();
   check('在庫不足の案内と記録・自動購入なし', Object.keys(forecast.short).length > 0 && s.sitter.shortages['sitter-0'] && s.geckos[0].hunger === 60 && s.coins === 900 && Object.values(s.food).every(n => n === 0));
   s.food.cricket = 10; window.__sitterNow += 5 * 60000; T.simulate(Date.now()); check('補充後は次のお世話で給餌を再開', s.geckos[0].hunger >= 89 && s.sitter.meals === 1);
   s = setup(); s.food = { cricketS: 0, cricket: 0, dubia: 0, worm: 0, paste: 0 }; buy(); window.__sitterNow += 12 * H;
   T.actions.buyFood({ dataset: { kind: 'cricket' } }); check('あとから買ったエサを過去のお世話に使わない', s.sitter.meals === 0 && s.food.cricket === 10);
   window.__sitterNow += 5 * 60000; T.simulate(Date.now()); check('買ったあとの時刻から給餌する', s.sitter.meals === 1 && s.food.cricket < 10);
   s = setup(); s.geckos[0].shedUntil = now + 40 * 60000; s.geckos[0].shedDur = 40 * 60000; buy(); check('脱皮前は在庫を使わず待つ', s.sitter.meals === 0 && s.sitter.needs['sitter-0'] === 'shed');
   s = setup(); s.food = { cricketS: 0, cricket: 0, dubia: 0, worm: 10, paste: 10 }; s.geckos[0].wormRun = 3; s.geckos[0].pasteOk = 0; buy(); check('ミルワームの連続と不慣れな練り餌を避ける', s.sitter.meals === 0);
   s = setup(); s.food = { cricketS: 0, cricket: 0, dubia: 10, worm: 0, paste: 0 }; buy(); check('85で止めた食事を在庫不足と誤判定しない', s.geckos[0].hunger === 85 && !Object.keys(s.sitter.needs).length);
   s = setup(); s.geckos[0].sick = { type: 'mouth', at: now }; buy(); check('病院の治療を自動で行わない', s.geckos[0].sick.type === 'mouth' && s.coins === 900);
   const legacy = structuredClone(base); delete legacy.sitter; const coins = legacy.coins; T.migrate(legacy); check('旧セーブは未契約で移行・コイン維持', legacy.sitter === null && legacy.coins === coins);
   const restored = T.migrate(structuredClone(s)); check('保存した契約・使用量・報告を移行で保持', JSON.stringify(restored.sitter) === JSON.stringify(s.sitter));
   const bad = T.normalizeSitter({ startedAt: now, until: Infinity }); check('不正な期限を有効な契約にしない', bad === null);
   window.__sitterNow = now + D; T.simulate(Date.now()); window.__sitterNow = now + H; T.simulate(Date.now()); check('時計が戻っても終了済みの契約を再開しない', !T.sitterActive(Date.now()));
   s = setup(); buy(); __sitterTest.saveNow(); return checks;
  });
  await p.reload(); await p.waitForFunction(() => window.__sitterTest);
  assert.ok(await p.evaluate(() => !!__leopaState().sitter && __leopaState().sitter.until - __leopaState().sitter.startedAt === 86400000));
  await p.locator('[data-action=sitterMenu]').first().click();
  await p.evaluate(() => { __leopaState().kids = true; LKids.set(true); });
  const kidsText = await p.locator('.sitter-sheet').innerText();
  for (const wrong of ['けいだいたい', 'おがんい', 'しっている', 'げんる', 'ぷれいやーにれいります']) assert.ok(!kidsText.includes(wrong), wrong);
  assert.equal(await p.locator('.sitter-sheet').evaluate(el => el.scrollWidth <= el.clientWidth + 1), true);
  assert.deepEqual(errors, []); assert.deepEqual(results.filter(r => !r.ok), []);
  if (process.argv[2]) fs.writeFileSync(process.argv[2] + '/sitter-results.json', JSON.stringify(results, null, 2));
  console.log('ペットシッター検査 ' + results.length + '件・保存再読み込み・ひらがな OK'); console.log('[]');
 } finally { await b.close(); }
})().catch(e => { console.error(e); process.exit(1); });
