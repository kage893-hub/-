// node tests/genetics.test.js で実行
const assert = require('assert');
const G = require('../js/genetics.js');

// ---- 単一遺伝子のモルフ名
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

// ---- ライン（見た目の遺伝）の名前
const P = o => Object.assign({ spots: 60, blotch: 45, head: 60, carrot: 5, lav: 20, aberrant: 18 }, o);
assert.strictEqual(G.morphName({}, 30, P({})), 'ノーマル');
assert.strictEqual(G.morphName({}, 50, P({})), 'ハイイエロー');
assert.strictEqual(G.morphName({}, 50, P({ spots: 15 })), 'ハイポ');
assert.strictEqual(G.morphName({}, 90, P({ spots: 2, head: 3, carrot: 80 })), 'スーパーハイポ タンジェリン キャロットテール ボールディ');
assert.strictEqual(G.morphName({ snow: 1 }, 20, P({ spots: 15 })), 'マックスノー ハイポ');
assert.strictEqual(G.morphName({ alb: 2, ecl: 2 }, 85, P({})), 'ラプター'); // ラプターはタンジェリンをふくむ
assert.strictEqual(G.morphName({}, 30, P({ aberrant: 70 })), 'ジャングル');
assert.strictEqual(G.morphName({}, 30, P({ aberrant: 90 })), 'ストライプ');
assert.strictEqual(G.morphName({ bliz: 2 }, 30, P({ spots: 2, aberrant: 90 })), 'ブリザード'); // 模様がないのでハイポ等は付かない
assert.strictEqual(G.morphName({}, 30, P({ lav: 80 })), 'ラベンダー');

// ---- 図鑑：代表の個体は自分の項目に当てはまる
for (const d of G.DEX) {
  assert.ok(G.dexMatches(d.rep.genes, d.rep.tang, d.rep.poly).includes(d.id), d.id);
}
assert.ok(G.dexMatches({}, 90, P({ spots: 2, head: 3, carrot: 80 })).includes('SHTCTB'));
assert.ok(!G.dexMatches({}, 60, P({ spots: 2, head: 3, carrot: 80 })).includes('SHTCTB'));

// ---- 予想: het アルビノ同士 → アルビノ 25%、het 50%
const het = { genes: { alb: 1 }, tang: 20, poly: P({ spots: 40 }) };
const fc = G.forecast(het, { genes: { alb: 1 }, tang: 40, poly: P({ spots: 20 }) });
assert.ok(Math.abs(fc.morphs.find(m => m.name === 'トレンパーアルビノ').p - 0.25) < 1e-9);
assert.ok(Math.abs(fc.hets.find(h => h.name === 'アルビノ').p - 0.5) < 1e-9);
assert.ok(Math.abs(fc.morphs.reduce((s, m) => s + m.p, 0) - 1) < 1e-9);
assert.strictEqual(fc.tang, 30);
assert.strictEqual(fc.poly.spots, 30);

// マックスノー同士 → スーパー 25%
const ms = { genes: { snow: 1 }, tang: 20 };
assert.ok(Math.abs(G.forecast(ms, ms).morphs.find(m => m.name === 'スーパーマックスノー').p - 0.25) < 1e-9);

// ---- 実際の交配
let n = 0;
for (let i = 0; i < 20000; i++) if (G.breed(het, het).genes.alb === 2) n++;
assert.ok(Math.abs(n / 20000 - 0.25) < 0.02, 'albino ratio ' + n / 20000);

// 見た目の遺伝は親の平均のまわりにばらつく
const lo = { genes: {}, tang: 30, poly: P({ spots: 10 }) }, lo2 = { genes: {}, tang: 30, poly: P({ spots: 20 }) };
const kids = Array.from({ length: 4000 }, () => G.breed(lo, lo2).poly.spots);
const mean = kids.reduce((a, b) => a + b, 0) / kids.length;
assert.ok(Math.abs(mean - 15.5) < 2, 'spots mean ' + mean);
assert.ok(new Set(kids).size > 15, '子の値がばらつく');
assert.ok(kids.every(v => v >= 0 && v <= 100));

// 古いデータ（poly なし）でも交配できる
const old = G.breed({ genes: {}, tang: 40 }, { genes: {}, tang: 40 });
assert.ok(typeof old.poly.spots === 'number');

console.log('genetics: all tests passed');
