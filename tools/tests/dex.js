// 組み合わせ名の追加スノーと、更新前に取りこぼした図鑑の修復。
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const fs = require('fs'), assert = require('node:assert/strict');
const G = require('../../js/genetics.js');
const SP = process.argv[2] || '/tmp/leopa-tests'; fs.mkdirSync(SP, { recursive: true });
const red = 'レッドアイアルビノ', raptor = 'ラプター', poly = { spots: 60, blotch: 45, head: 60, carrot: 5, lav: 20, aberrant: 18, mel: 8 };
let count = 0;
for (const snow of [0, 1, 2]) for (const giant of [0, 1, 2]) for (const tang of [30, 69, 70, 90]) {
  const genes = G.normGenes({ snow, giant, alb: 2, ecl: 2, bliz: 1 });
  const matches = G.dexMatches(genes, tang, poly);
  assert.ok(matches.includes(tang < 70 ? red : raptor));
  assert.ok(!matches.includes(tang < 70 ? raptor : red)); count++;
}
for (const genes of [{ alb: 1, ecl: 2 }, { alb: 2, ecl: 1 }, { snow: 2, ecl: 2 }, { bell: 2, ecl: 2 }, { alb: 2, ecl: 2, bliz: 2 }]) {
  for (const tang of [30, 90]) {
    const matches = G.dexMatches(genes, tang, poly); assert.ok(!matches.includes(red) && !matches.includes(raptor)); count++;
  }
}
for (const [tang, target] of [[0, red], [100, raptor]]) {
  const parent = { genes: G.normGenes({ snow: 1, alb: 2, ecl: 2 }), tang, poly };
  const plain = { ...parent, genes: { ...parent.genes, snow: 0 } };
  const probability = G.targetChance(parent, parent, target).p;
  assert.equal(probability, G.targetChance(plain, plain, target).p);
  assert.ok(probability > .95); count++;
}
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/chromium' });
  try {
    const p = await b.newPage({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' }), errors = [];
    p.on('pageerror', e => errors.push(String(e)));
    await p.addInitScript(() => {
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (k, ...a) { return k.includes('webgl') ? null : get.call(this, k, ...a); };
      const interval = window.setInterval; window._dexIntervals = [];
      window.setInterval = (...a) => { const id = interval(...a); _dexIntervals.push(id); return id; };
    });
    const app = fs.readFileSync(__dirname + '/../../js/app.js', 'utf8').replace(/\}\)\(\);\s*$/, 'window._dexTest={migrate,hatch,saveNow,setState:s=>{S=s}};})();');
    await p.route('**/js/app.js', r => r.fulfill({ contentType: 'application/javascript', body: app }));
    await p.goto(process.env.BASE || 'http://localhost:8123'); await require('./start.js')(p);
    const checks = await p.evaluate(() => {
      _dexIntervals.forEach(clearInterval);
      const T = _dexTest, G = LeopaGenetics, base = structuredClone(__leopaState()), checks = [];
      const check = (name, ok) => { checks.push({ name, ok }); if (!ok) throw Error(name); };
      const red = 'レッドアイアルビノ', raptor = 'ラプター';
      const child = { ...structuredClone(base.geckos[0]), id: 'cream', name: 'くりーむ', sex: 'F', growth: 0, gen: 2, seed: 123, genes: G.normGenes({ snow: 1, alb: 2, ecl: 2, bliz: 1 }), tang: 30 };
      const setup = () => { const s = structuredClone(base); s.geckos = [structuredClone(child)]; s.selected = child.id; s.dex = { ノーマル: true }; s.names = {}; s.coins = 300; s.eggs = []; s.offers = []; s.layBox = []; return s; };
      let s = setup(), genes = JSON.stringify(s.geckos[0].genes), names = s.geckos.map(g => g.name);
      T.migrate(s); check('所持中の追加スノーの子を図鑑に補完', !!s.dex[red] && !s.dex[raptor]);
      check('遺伝子・名前・コイン・既存の図鑑を変えない', genes === JSON.stringify(s.geckos[0].genes) && JSON.stringify(names) === JSON.stringify(s.geckos.map(g => g.name)) && s.coins === 300 && s.dex.ノーマル);
      const dex = JSON.stringify(s.dex); T.migrate(s); check('補完は再読み込みでも同じで重複報酬なし', JSON.stringify(s.dex) === dex && s.coins === 300);
      s = setup(); s.geckos = []; s.names = { 'マックスノー レッドアイアルビノ ラベンダー': true }; T.migrate(s);
      check('旅立った子も出会ったモルフ名から補完', !!s.dex[red] && !s.dex[raptor]);
      s = setup(); s.geckos = []; s.names = { 'スーパージャイアント マックスノー ラプター': true }; T.migrate(s);
      check('追加スノーのラプターも過去の記録から補完', !!s.dex[raptor] && !s.dex[red]);
      s = setup(); s.geckos = []; s.names = { 'レッドアイアルビノに似た': true, レッドアイアルビノ: false }; s.offers = [structuredClone(child)]; s.eggs = [structuredClone(child)]; T.migrate(s);
      check('未入手の店頭候補・卵・曖昧な名前では登録しない', !s.dex[red] && !s.dex[raptor]);
      s = setup(); s.dex = Object.fromEntries(G.DEX.filter(d => d.id !== red).map(d => [d.id, true])); T.migrate(s);
      check('最後の取りこぼしを補完したらコンプリートも反映', s.achievementMedals.dall === true && s.coins === 300);
      s = setup(); s.geckos = []; s.cases = 4; T.setState(s);
      s.eggs = [{ ...structuredClone(child), id: 'red-eye-egg', laidAt: Date.now() - 10000, hatchAt: Date.now() - 1, mom: 'おかあさん', dad: 'おとうさん', temp: 29.5 }];
      T.hatch('red-eye-egg'); check('新しく生まれた追加スノーの子をその場で登録', !!s.dex[red] && !s.dex[raptor] && s.geckos.length === 1);
      s = setup(); s.names = { [G.morphName(child.genes, child.tang, child.poly)]: true }; T.setState(s); T.saveNow();
      return checks;
    });
    await p.reload(); await p.waitForFunction(() => window._dexTest);
    assert.equal(await p.evaluate(() => __leopaState().dex.レッドアイアルビノ), true);
    await p.locator('[data-view=dex]').click();
    assert.equal(await p.locator('[data-action=dexDetail][data-id="レッドアイアルビノ"]').getAttribute('data-found'), 'true');
    await p.locator('[data-action=dexDetail][data-id="レッドアイアルビノ"]').click();
    await p.addStyleTag({ content: '#toast{display:none!important}' }); await p.waitForTimeout(300);
    await p.screenshot({ path: SP + '/レッドアイアルビノの登録.png' });
    await p.evaluate(() => _dexTest.saveNow()); await p.reload(); await p.waitForFunction(() => window._dexTest);
    assert.equal(await p.evaluate(() => __leopaState().dex.レッドアイアルビノ && __leopaState().geckos[0].name === 'くりーむ'), true);
    assert.deepEqual(errors, []);
    fs.writeFileSync(SP + '/dex-results.json', JSON.stringify({ genetics: count, checks, errors }, null, 2));
    console.log(`図鑑の組み合わせ ${count}件・旧セーブ補完 ${checks.length}件・孵化・保存再読込・画面 OK`); console.log('[]');
  } finally { await b.close(); }
})().catch(e => { console.error(e); process.exit(1); });
