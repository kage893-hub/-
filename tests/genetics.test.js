// node tests/genetics.test.js で実行
const assert = require('assert');
const G = require('../js/genetics.js');

// モルフ名
assert.strictEqual(G.morphName({}, 10), 'ノーマル');
assert.strictEqual(G.morphName({}, 50), 'ハイイエロー');
assert.strictEqual(G.morphName({}, 80), 'タンジェリン');
assert.strictEqual(G.morphName({ snow: 1, alb: 2 }, 10), 'マックスノー トレンパーアルビノ');
assert.strictEqual(G.morphName({ snow: 2, ecl: 2 }, 10), 'トータルエクリプス');
assert.strictEqual(G.morphName({ alb: 2, ecl: 2 }, 10), 'レッドアイアルビノ');
assert.strictEqual(G.morphName({ alb: 2, ecl: 2 }, 80), 'ラプター');
assert.strictEqual(G.morphName({ alb: 2, bliz: 2 }, 10), 'ブレイジングブリザード');
assert.strictEqual(G.morphName({ alb: 2, ecl: 2, bliz: 2 }, 10), 'ディアブロブランコ');
assert.strictEqual(G.morphName({ alb: 1, ecl: 1 }, 10), 'ノーマル');
assert.deepStrictEqual(G.hets({ alb: 1, ecl: 1, snow: 1 }), ['アルビノ', 'エクリプス']);

// 図鑑の名前はすべて morphName で作れる
for (const d of G.DEX) assert.strictEqual(G.morphName(d.genes, d.tang), d.name, d.name);

// 予想: het アルビノ同士 → アルビノ 25%、het 50%
const het = { genes: { alb: 1 }, tang: 20 };
const fc = G.forecast(het, het);
const alb = fc.morphs.find(m => m.name === 'トレンパーアルビノ');
assert.ok(Math.abs(alb.p - 0.25) < 1e-9);
assert.ok(Math.abs(fc.hets.find(h => h.name === 'アルビノ').p - 0.5) < 1e-9);
assert.ok(Math.abs(fc.morphs.reduce((s, m) => s + m.p, 0) - 1) < 1e-9);

// マックスノー同士 → スーパー 25%
const ms = { genes: { snow: 1 }, tang: 20 };
const fc2 = G.forecast(ms, ms);
assert.ok(Math.abs(fc2.morphs.find(m => m.name === 'スーパーマックスノー').p - 0.25) < 1e-9);

// 実際の交配も予想どおりの割合になる
let n = 0;
for (let i = 0; i < 20000; i++) if (G.breed(het, het).genes.alb === 2) n++;
assert.ok(Math.abs(n / 20000 - 0.25) < 0.02, 'albino ratio ' + n / 20000);

console.log('genetics: all tests passed');
