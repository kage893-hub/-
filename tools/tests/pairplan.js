const assert = require('node:assert/strict'), fs = require('fs');
const G = require('../../js/genetics.js');
const parent = (genes, tang = 15, poly = {}) => ({ genes: G.normGenes(genes), tang, poly: { ...G.DEX[0].rep.poly, ...poly } });
const chance = (a, b, id) => G.targetChance(parent(a), parent(b), id).p;
assert.equal(chance({ snow: 1 }, {}, 'マックスノー'), .5);
assert.equal(chance({ snow: 1 }, { snow: 1 }, 'スーパーマックスノー'), .25);
assert.equal(chance({ alb: 1 }, { alb: 1 }, 'トレンパーアルビノ'), .25);
assert.equal(chance({ alb: 2 }, {}, 'トレンパーアルビノ'), 0);
assert.equal(chance({ alb: 2 }, { bell: 2 }, 'ベルアルビノ'), 0);
assert.equal(chance({ alb: 2 }, { bell: 2 }, 'トレンパーアルビノ'), 0);
assert.equal(chance({ snow: 2 }, { snow: 2 }, 'スーパーマックスノー'), 1);
assert.equal(chance({ alb: 1, ecl: 1, bliz: 1 }, { alb: 1, ecl: 1, bliz: 1 }, 'ディアブロブランコ'), 1 / 64);
const orange = parent({ alb: 2, ecl: 2 }, 95), original = JSON.stringify(orange);
const line = G.targetChance(orange, orange, 'ラプター');
assert.equal(line.approximate, true); assert.ok(line.p > .7 && line.p < 1);
assert.deepEqual(G.targetChance(orange, orange, 'ラプター'), line);
assert.equal(JSON.stringify(orange), original);
for (const target of G.DEX) { const r = G.targetChance(orange, orange, target.id); assert.ok(Number.isFinite(r.p) && r.p >= 0 && r.p <= 1); }
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
(async () => {
 const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/chromium' });
 try {
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' }), errors = [];
  p.on('pageerror', e => errors.push(String(e)));
  await p.addInitScript(() => { const get = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (kind, ...args) { return kind.includes('webgl') ? null : get.call(this, kind, ...args); }; });
  let code = fs.readFileSync(__dirname + '/../../js/app.js', 'utf8');
  code = code.replace(/\}\)\(\);\s*$/, 'window.__pairPlanTest = {start:ACTIONS.pairFromPlan, saveNow};})();');
  await p.route('**/js/app.js', r => r.fulfill({ contentType: 'application/javascript', body: code }));
  await p.goto(process.env.BASE || 'http://localhost:8123'); await require('./start.js')(p);
  await p.evaluate(() => {
   const S = __leopaState(), base = S.geckos[0]; S.tut = { step: 99 }; S.kids = false; LKids.set(false); S.cases = 30; S.eggs = []; S.layBox = [];
   S.geckos = Array.from({ length: 30 }, (_, i) => ({ ...structuredClone(base), id: 'planner-' + i, name: (i % 2 ? 'おとうさん' : 'おかあさん') + (Math.floor(i / 2) + 1), sex: i % 2 ? 'M' : 'F', genes: LeopaGenetics.normGenes({ snow: 1 }), poly: { ...LeopaGenetics.DEX[0].rep.poly }, tang: i * 3, growth: 180, hunger: 90, clean: 100, poop: 0, gravid: null, restUntil: 0 }));
   S.geckos[2].growth = 10; S.geckos[4].hunger = 10; S.geckos[6].gravid = { layAt: Date.now() + 86400000, dad: { name: 'おとうさん', genes: LeopaGenetics.normGenes({}) } }; S.geckos[3].restUntil = Date.now() + 86400000;
   S.selected = 'planner-1'; __pairPlanTest.saveNow();
  });
  await p.locator('[data-view=eggs]').click(); await p.locator('[data-action=pairPlanner][data-mode=parents]').click();
  assert.equal(await p.locator('#pairPlanDad').inputValue(), 'planner-1'); assert.equal(await p.locator('#pairPlanMom').inputValue(), 'planner-0');
  const originalId = await p.evaluate(() => __leopaState().selected);
  for (const [id, reason] of [['planner-2', 'まだアダルト'], ['planner-4', 'おなかが空'], ['planner-6', '抱卵中']]) {
   await p.locator('#pairPlanMom').selectOption(id); assert.equal(await p.locator('[data-action=pairFromPlan]').isDisabled(), true); assert.ok((await p.locator('.pair-plan').textContent()).includes(reason));
   await p.evaluate(id => __pairPlanTest.start({ dataset: { mom: id, dad: 'planner-1' } }), id); assert.equal(await p.evaluate(() => __leopaState().selected), originalId);
  }
  await p.locator('#pairPlanMom').selectOption('planner-0'); await p.locator('#pairPlanDad').selectOption('planner-3'); assert.equal(await p.locator('[data-action=pairFromPlan]').isDisabled(), true);
  await p.locator('[data-action=pairPlanMode][data-mode=target]').click();
  assert.equal(await p.locator('.pair-candidates .pair-card').count(), 6); assert.match(await p.locator('.pair-plan').textContent(), /候補 225組/); assert.ok((await p.locator('.pair-candidates .pair-chance').first().textContent()).includes('25%'));
  await p.locator('[data-action=pairPlanMore]').click(); assert.equal(await p.locator('.pair-candidates .pair-card').count(), 12);
  await p.locator('#pairPlanTarget').selectOption('ディアブロブランコ'); assert.equal(await p.locator('.pair-candidates .pair-card').count(), 0);
  const approximateMs = await p.evaluate(() => { const el = document.querySelector('#pairPlanTarget'), t = performance.now(); el.value = 'タンジェリン'; el.dispatchEvent(new Event('change', { bubbles: true })); return performance.now() - t; });
  await p.locator('#pairPlanTarget').selectOption('スーパーマックスノー');
  await p.locator('[data-action=pairPlanChoose]').first().click(); assert.ok((await p.locator('.pair-chance').textContent()).includes('25%')); assert.equal(await p.locator('[data-action=pairFromPlan]').isDisabled(), false);
  await p.evaluate(() => LKids.set(true)); await p.locator('[data-action=pairPlanMode][data-mode=parents]').click(); assert.ok(!/[一-龯]/.test(await p.locator('#pairPlanMom').textContent())); assert.equal(await p.locator('.pair-plan').evaluate(el => el.scrollWidth <= el.clientWidth + 1), true);
  await p.locator('[data-action=pairFromPlan]').click(); await p.evaluate(() => __pairPlanTest.saveNow());
  const paired = await p.evaluate(() => { const S = __leopaState(), mom = S.geckos.find(g => g.id === S.selected); return { id: mom.id, sex: mom.sex, dad: mom.gravid.dad.id, layAt: mom.gravid.layAt, rest: S.geckos.find(g => g.id === mom.gravid.dad.id).restUntil }; });
  assert.equal(paired.sex, 'F'); assert.ok(paired.layAt > Date.now()); assert.ok(paired.rest > Date.now());
  await p.reload(); await p.waitForFunction(() => window.__leopaState()); assert.ok(await p.evaluate(id => __leopaState().geckos.find(g => g.id === id).gravid, paired.id));
  // オスしかいない場合も操作でき、原因を案内する。
  await p.evaluate(() => { const S = __leopaState(); S.geckos = S.geckos.filter(g => g.sex === 'M'); S.selected = S.geckos[0].id; });
  await p.locator('[data-view=eggs]').click(); await p.locator('[data-action=pairPlanner][data-mode=target]').click(); assert.ok((await p.locator('.pair-plan').textContent()).includes('メス')); assert.equal(await p.locator('[data-action=pairFromPlan]').count(), 0);
  assert.deepEqual(errors, []);
  console.log('逆引きの遺伝確率・目安・30匹225組・条件の再確認・卵から開始・保存・ひらがな・親不足 OK ' + JSON.stringify({ approximateMs })); console.log('[]');
 } finally { await b.close(); }
})().catch(e => { console.error(e); process.exit(1); });
