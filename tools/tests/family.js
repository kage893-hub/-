const assert = require('node:assert/strict'), fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
require('../../js/family.js');
const F = global.LeopaFamily;
const s = { geckos: [], eggs: [] };
let previous;
for (let gen = 1; gen <= 7; gen++) {
  const g = { id: 'g' + gen, name: '第' + gen + '世代の子', gen, sex: 'F', seed: gen, genes: {}, poly: {}, parents: previous ? { mom: { id: previous.id, name: previous.name, seed: previous.seed } } : null };
  s.geckos.push(g); F.sync(s); previous = g;
}
assert.equal(Object.keys(s.familyRecords).length, 7);
assert.equal(F.relatives(s, 'g1').grandchildren[0].id, 'g3');
assert.equal(F.relatives(s, 'g7').mom.id, 'g6');
s.geckos[0].name = '名前を変更'; F.sync(s);
assert.equal(F.relatives(s, 'g2').mom.name, '名前を変更');
s.geckos = s.geckos.slice(3); F.sync(s);
assert.equal(F.relatives(s, 'g4').mom.id, 'g3');
assert.equal(Object.keys(F.sync(JSON.parse(JSON.stringify(s)))).length, 7);
const legacy = { geckos: [{ id: 'p', seed: 123, name: '親の新しい名前', parents: null }, { id: 'c', name: '子', parents: { mom: { seed: 123, name: '前の名前' }, dad: { name: '父の名前だけ' } } }], eggs: [] };
F.sync(legacy); assert.equal(F.relatives(legacy, 'c').mom.id, 'p'); assert.equal(F.relatives(legacy, 'c').dad.genes, null);
assert.equal(Object.keys(F.sync(legacy)).length, 3); F.sync(legacy); assert.equal(Object.keys(legacy.familyRecords).length, 3);
// 同名でも異なる個体を結び付けない。
const same = { geckos: [{ id: 'a', name: 'レオ', seed: 1 }, { id: 'b', name: 'レオ', seed: 2 }, { id: 'c', name: '子', parents: { dad: { name: 'レオ', seed: 2 } } }] };
F.sync(same); assert.equal(F.relatives(same, 'c').dad.id, 'b');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/chromium' });
  try {
    const p = await b.newPage({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' }), errors = [];
    p.on('pageerror', e => errors.push(String(e)));
    await p.addInitScript(() => { const ctx = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (k, ...a) { return k.includes('webgl') ? null : ctx.call(this, k, ...a); }; });
    const app = fs.readFileSync(__dirname + '/../../js/app.js', 'utf8').replace(/\}\)\(\);\s*$/, 'window.__familyTest = { snap, hatch, ACTIONS, saveNow };\n})();');
    await p.route('**/js/app.js', r => r.fulfill({ contentType: 'text/javascript', body: app }));
    await p.goto(process.env.BASE || 'http://localhost:8123'); await require('./start.js')(p);
    const ids = await p.evaluate(() => {
      const S = __leopaState(), T = __familyTest, mom = S.geckos.find(g => g.sex === 'F'), dad = S.geckos.find(g => g.sex === 'M'); S.cases = 12; S.tut = { step: 99 };
      function born(m, d, id) {
        S.eggs.push({ id, genes: m.genes, tang: m.tang, poly: m.poly, sex: 'F', temp: 29.5, laidAt: Date.now() - 1000, hatchAt: Date.now() - 1, mom: m.name, dad: d.name, pmom: T.snap(m, 1), pdad: T.snap(d, 1), gen: Math.max(m.gen, d.gen) + 1 });
        T.hatch(id); return S.geckos[S.geckos.length - 1];
      }
      const child = born(mom, dad, 'e-child'), grandchild = born(child, dad, 'e-grandchild');
      mom.name = 'お母さんの新しい名前'; T.ACTIONS.rehome({ dataset: { id: mom.id } }); T.saveNow();
      return { mom: mom.id, child: child.id, grandchild: grandchild.id };
    });
    await p.evaluate(id => __familyTest.ACTIONS.family({ dataset: { id } }), ids.child);
    assert.match(await p.locator('.lineage').innerText(), /お母さんの新しい名前/);
    await p.locator(`.lineage [data-id="${ids.mom}"]`).click();
    assert.match(await p.locator('.lineage h4').nth(0).innerText(), /子 1匹/); assert.match(await p.locator('.lineage h4').nth(1).innerText(), /孫 1匹/);
    await p.locator(`.lineage [data-id="${ids.grandchild}"]`).click();
    await p.evaluate(() => { __leopaState().kids = true; document.querySelector('[data-action=closeSheet]').click(); document.querySelector('[data-view=case]').click(); });
    await p.evaluate(id => __familyTest.ACTIONS.family({ dataset: { id } }), ids.grandchild);
    await p.waitForTimeout(100);
    assert.match(await p.locator('.lineage').innerText(), /かけいず/);
    assert(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    await p.evaluate(() => __familyTest.saveNow()); await p.reload();
    const family = await p.evaluate(ids => LeopaFamily.relatives(__leopaState(), ids.mom), ids);
    assert.equal(family.children[0].id, ids.child); assert.equal(family.grandchildren[0].id, ids.grandchild);
    assert.deepEqual(errors, []); console.log('7世代・旧データ・同名の区別・ふ化・里親後の保存・親子孫の移動・ひらがな OK'); console.log(JSON.stringify(errors));
  } finally { await b.close(); }
})().catch(e => { console.error(e); process.exit(1); });
