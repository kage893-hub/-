/* レオパといっしょ — 遺伝とモルフ名
 *
 * 1) 単一遺伝子のモルフ（メンデル遺伝）
 *    遺伝子は「その遺伝子を何コピー持っているか」(0/1/2) で表す。
 *      snow : マックスノー（共優性。1コピーで見た目に出て、2コピーでスーパー）
 *      alb  : トレンパーアルビノ（劣性）
 *      ecl  : エクリプス（劣性）
 *      bliz : ブリザード（劣性）
 *
 * 2) 見た目の遺伝（ライン遺伝・多因子）
 *    0〜100 の値で持ち、子は「両親の平均＋ゆらぎ」になる。たまに大きくぶれる。
 *    同じモルフ名でも1匹ずつ見た目がちがい、選んで掛けあわせると血統が作れる。
 *      tang     : タンジェリン度（オレンジの濃さ）
 *      spots    : 斑点の量（少ないとハイポ、ゼロに近いとスーパーハイポ）
 *      blotch   : 斑点の大きさ
 *      head     : 頭の斑点（少ないとボールディ）
 *      carrot   : しっぽのオレンジ（キャロットテール）
 *      lav      : ラベンダー（紫がかった灰色）
 *      aberrant : 模様の乱れ（ジャングル → ストライプ）
 *      mel      : 黒さ（とても黒いとブラックナイト。アルビノには出ない）
 */
(function (root) {
  'use strict';

  const LOCI = [
    { key: 'snow', name: 'マックスノー', type: 'codom' },
    { key: 'alb', name: 'トレンパーアルビノ', short: 'アルビノ', type: 'rec' },
    { key: 'ecl', name: 'エクリプス', short: 'エクリプス', type: 'rec' },
    { key: 'bliz', name: 'ブリザード', short: 'ブリザード', type: 'rec' },
  ];
  const POLY = [
    { key: 'spots', name: '斑点の量', lo: '少ない', hi: '多い' },
    { key: 'blotch', name: '斑点の大きさ', lo: 'こまかい', hi: '大きい' },
    { key: 'head', name: '頭の斑点', lo: '少ない', hi: '多い' },
    { key: 'carrot', name: 'しっぽのオレンジ', lo: 'なし', hi: '濃い' },
    { key: 'lav', name: 'ラベンダー', lo: 'なし', hi: '濃い' },
    { key: 'aberrant', name: '模様の乱れ', lo: 'ふつう', hi: '乱れる' },
    { key: 'mel', name: '黒さ', lo: 'ふつう', hi: 'まっくろ' },
  ];
  const TANG_HIGH = 70;
  const TANG_MID = 40;
  const T = {
    hypo: 22, superHypo: 8, baldy: 10, carrot: 50, jungle: 60, stripe: 82, lav: 70, night: 85,
  };

  const c100 = v => Math.max(0, Math.min(100, Math.round(v)));
  function gauss(rng) {
    let u = 0;
    while (!u) u = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
  }

  function normGenes(g) {
    g = g || {};
    return { snow: g.snow || 0, alb: g.alb || 0, ecl: g.ecl || 0, bliz: g.bliz || 0 };
  }
  // ペットショップやワイルドにいそうな、ふつうの個体の値
  function randomPoly(rng) {
    rng = rng || Math.random;
    return {
      spots: c100(62 + gauss(rng) * 17),
      blotch: c100(45 + gauss(rng) * 20),
      head: c100(62 + gauss(rng) * 18),
      carrot: c100(4 + Math.abs(gauss(rng)) * 14),
      lav: c100(22 + gauss(rng) * 18),
      aberrant: c100(20 + gauss(rng) * 15),
      mel: c100(6 + Math.abs(gauss(rng)) * 9),
    };
  }
  function normPoly(p, rng) {
    const base = randomPoly(rng);
    if (!p) return base;
    const out = {};
    for (const t of POLY) out[t.key] = typeof p[t.key] === 'number' ? p[t.key] : base[t.key];
    return out;
  }

  // ---------- 名前
  function mendelTokens(genes, tang) {
    const g = normGenes(genes);
    const a = g.alb === 2, e = g.ecl === 2, b = g.bliz === 2;
    let tangUsed = false;
    const tokens = [];
    if (g.snow === 1) tokens.push('マックスノー');
    if (g.snow === 2 && e && !a && !b) {
      tokens.push('トータルエクリプス');
    } else {
      if (g.snow === 2) tokens.push('スーパーマックスノー');
      if (b && a && e) tokens.push('ディアブロブランコ');
      else if (a && e) {
        if (tang >= TANG_HIGH) { tokens.push('ラプター'); tangUsed = true; } else tokens.push('レッドアイアルビノ');
      } else if (a && b) tokens.push('ブレイジングブリザード');
      else {
        if (b) tokens.push('ブリザード');
        if (a) tokens.push('トレンパーアルビノ');
        if (e) tokens.push('エクリプス');
      }
    }
    return { tokens, tangUsed };
  }
  // 単一遺伝子のモルフだけの名前（交配予想や図鑑で使う）
  function mendelName(genes, tang) {
    const m = mendelTokens(genes, tang || 0);
    return m.tokens.length ? m.tokens.join(' ') : 'ノーマル';
  }
  // ライン（見た目の遺伝）の呼び名。並びは実際の呼び方（SHTCTB など）にそろえる
  function lineTokens(genes, tang, poly) {
    const g = normGenes(genes);
    const pattern = g.bliz !== 2;
    const t = [];
    if (poly && poly.mel >= T.night && g.alb !== 2) t.push('ブラックナイト');
    if (poly && pattern) {
      if (poly.spots < T.superHypo) t.push('スーパーハイポ');
      else if (poly.spots < T.hypo) t.push('ハイポ');
    }
    if (tang >= TANG_HIGH && !(poly && poly.mel >= T.night)) t.push('タンジェリン');
    if (poly) {
      if (poly.carrot >= T.carrot) t.push('キャロットテール');
      if (pattern && poly.spots < T.superHypo && poly.head < T.baldy) t.push('ボールディ');
      if (pattern && poly.aberrant >= T.stripe) t.push('ストライプ');
      else if (pattern && poly.aberrant >= T.jungle) t.push('ジャングル');
      if (poly.lav >= T.lav) t.push('ラベンダー');
    }
    return t;
  }
  function morphName(genes, tang, poly) {
    const m = mendelTokens(genes, tang);
    let line = lineTokens(genes, tang, poly);
    if (m.tangUsed) line = line.filter(x => x !== 'タンジェリン');
    if (!m.tokens.length && !line.length) return tang >= TANG_MID ? 'ハイイエロー' : 'ノーマル';
    return m.tokens.concat(line).join(' ');
  }

  // 見た目に出ていない劣性遺伝子（ヘテロ）
  function hets(genes) {
    const g = normGenes(genes);
    return LOCI.filter(l => l.type === 'rec' && g[l.key] === 1).map(l => l.short);
  }

  // 子が持つコピー数の確率 [0コピー, 1コピー, 2コピー]
  function locusDist(a, b) {
    const pa = a / 2, pb = b / 2;
    return [(1 - pa) * (1 - pb), pa * (1 - pb) + (1 - pa) * pb, pa * pb];
  }

  function inherit(a, b, rng) {
    const jump = rng() < 0.08 ? 2.6 : 1;
    return c100((a + b) / 2 + gauss(rng) * 8 * jump);
  }
  function breed(mom, dad, rng) {
    rng = rng || Math.random;
    const m = normGenes(mom.genes), d = normGenes(dad.genes);
    const genes = {};
    for (const l of LOCI) {
      genes[l.key] = (rng() < m[l.key] / 2 ? 1 : 0) + (rng() < d[l.key] / 2 ? 1 : 0);
    }
    const mp = normPoly(mom.poly, rng), dp = normPoly(dad.poly, rng);
    const poly = {};
    for (const t of POLY) poly[t.key] = inherit(mp[t.key], dp[t.key], rng);
    const tang = c100(inherit(mom.tang, dad.tang, rng) + 1);
    return { genes, tang, poly };
  }

  // ペアリング前の子の予想
  function forecast(mom, dad) {
    const m = normGenes(mom.genes), d = normGenes(dad.genes);
    const dists = LOCI.map(l => locusDist(m[l.key], d[l.key]));
    const morphs = {};
    (function walk(i, genes, p) {
      if (p === 0) return;
      if (i === LOCI.length) {
        const name = mendelName(genes, 0);
        morphs[name] = (morphs[name] || 0) + p;
        return;
      }
      for (let c = 0; c < 3; c++) walk(i + 1, Object.assign({}, genes, { [LOCI[i].key]: c }), p * dists[i][c]);
    })(0, {}, 1);
    const hetList = LOCI.map((l, i) => ({ name: l.short, p: dists[i][1] }))
      .filter((h, i) => LOCI[i].type === 'rec' && h.p > 0);
    const mp = normPoly(mom.poly), dp = normPoly(dad.poly);
    const poly = {};
    for (const t of POLY) poly[t.key] = Math.round((mp[t.key] + dp[t.key]) / 2);
    return {
      morphs: Object.entries(morphs).map(([name, p]) => ({ name, p })).sort((x, y) => y.p - x.p),
      hets: hetList,
      tang: Math.round((mom.tang + dad.tang) / 2),
      poly,
    };
  }

  // ---------- 図鑑
  const noVisual = g => { g = normGenes(g); return !g.snow && g.alb !== 2 && g.ecl !== 2 && g.bliz !== 2; };
  const hasPattern = g => normGenes(g).bliz !== 2;
  const P = (o) => Object.assign({ spots: 60, blotch: 45, head: 60, carrot: 5, lav: 20, aberrant: 18, mel: 8 }, o);
  const mendelEntry = (name, genes, hint, tang) => ({
    id: name, name, hint, rep: { genes, tang: tang || 15, poly: P({}) },
    test: (g, t) => mendelName(g, t) === name,
  });
  const DEX = [
    { id: 'ノーマル', name: 'ノーマル', hint: 'いちばん基本の色。野生のレオパに近い姿', rep: { genes: {}, tang: 15, poly: P({}) }, test: g => noVisual(g) },
    { id: 'ハイイエロー', name: 'ハイイエロー', hint: '黄色が強いノーマル。タンジェリン度40以上', rep: { genes: {}, tang: 52, poly: P({}) }, test: (g, t) => noVisual(g) && t >= TANG_MID },
    { id: 'タンジェリン', name: 'タンジェリン', hint: 'タンジェリン度70以上。オレンジの濃い子同士を掛けあわせよう', rep: { genes: {}, tang: 85, poly: P({ spots: 45 }) }, test: (g, t) => t >= TANG_HIGH },
    { id: 'ハイポ', name: 'ハイポ', hint: '体の斑点がとても少ない。斑点の少ない子同士を選んで', rep: { genes: {}, tang: 55, poly: P({ spots: 15, head: 40 }) }, test: (g, t, p) => hasPattern(g) && p.spots < T.hypo },
    { id: 'スーパーハイポ', name: 'スーパーハイポ', hint: '体の斑点がまったくない。ハイポをさらに選別', rep: { genes: {}, tang: 60, poly: P({ spots: 3, head: 35 }) }, test: (g, t, p) => hasPattern(g) && p.spots < T.superHypo },
    { id: 'キャロットテール', name: 'キャロットテール', hint: 'しっぽの付け根がオレンジ。しっぽのオレンジを選別', rep: { genes: {}, tang: 60, poly: P({ carrot: 75, spots: 40 }) }, test: (g, t, p) => p.carrot >= T.carrot },
    { id: 'SHTCTB', name: 'SHTCTB', hint: 'スーパーハイポ・タンジェリン・キャロットテール・ボールディ。ラインブリードの頂点', rep: { genes: {}, tang: 90, poly: P({ spots: 2, head: 3, carrot: 85 }) }, test: (g, t, p) => hasPattern(g) && p.spots < T.superHypo && t >= TANG_HIGH && p.carrot >= T.carrot && p.head < T.baldy },
    { id: 'ジャングル', name: 'ジャングル', hint: '模様が不規則につながる。模様の乱れを選別', rep: { genes: {}, tang: 40, poly: P({ aberrant: 70, blotch: 70 }) }, test: (g, t, p) => hasPattern(g) && p.aberrant >= T.jungle && p.aberrant < T.stripe },
    { id: 'ストライプ', name: 'ストライプ', hint: '背中にすじ模様。ジャングルをさらに選別', rep: { genes: {}, tang: 45, poly: P({ aberrant: 92, blotch: 60 }) }, test: (g, t, p) => hasPattern(g) && p.aberrant >= T.stripe },
    { id: 'ブラックナイト', name: 'ブラックナイト', hint: '全身がまっくろになる。黒さの強い子同士を何代も選別しよう（アルビノには出ない）', rep: { genes: {}, tang: 10, poly: P({ mel: 95, spots: 70 }) }, test: (g, t, p) => p.mel >= T.night && g.alb !== 2 },
    { id: 'ラベンダー', name: 'ラベンダー', hint: '紫がかった灰色がのる。ラベンダーの濃い子を選別', rep: { genes: {}, tang: 20, poly: P({ lav: 90 }) }, test: (g, t, p) => p.lav >= T.lav },
    mendelEntry('マックスノー', { snow: 1 }, '共優性。マックスノー×ノーマルで50%'),
    mendelEntry('スーパーマックスノー', { snow: 2 }, 'マックスノー同士で25%。目が真っ黒になる'),
    mendelEntry('トレンパーアルビノ', { alb: 2 }, '劣性。het アルビノ同士で25%'),
    mendelEntry('エクリプス', { ecl: 2 }, '劣性。目が真っ黒になる'),
    mendelEntry('ブリザード', { bliz: 2 }, '劣性。模様がまったくなくなる'),
    mendelEntry('マックスノー トレンパーアルビノ', { snow: 1, alb: 2 }, '通称スノーアルビノ。マックスノー＋アルビノ'),
    mendelEntry('スーパーマックスノー トレンパーアルビノ', { snow: 2, alb: 2 }, 'スーパーマックスノー＋アルビノ'),
    mendelEntry('マックスノー エクリプス', { snow: 1, ecl: 2 }, 'マックスノー＋エクリプス'),
    mendelEntry('トータルエクリプス', { snow: 2, ecl: 2 }, 'スーパーマックスノー＋エクリプス'),
    mendelEntry('レッドアイアルビノ', { alb: 2, ecl: 2 }, 'アルビノ＋エクリプス。目がルビー色に'),
    mendelEntry('ラプター', { alb: 2, ecl: 2 }, 'レッドアイアルビノで、タンジェリン度70以上', 85),
    mendelEntry('ブレイジングブリザード', { alb: 2, bliz: 2 }, 'アルビノ＋ブリザード'),
    mendelEntry('ディアブロブランコ', { alb: 2, ecl: 2, bliz: 2 }, 'アルビノ＋エクリプス＋ブリザード。最難関'),
  ];
  // その個体が当てはまる図鑑の項目
  function dexMatches(genes, tang, poly) {
    const g = normGenes(genes), p = normPoly(poly);
    return DEX.filter(d => d.test(g, tang, p)).map(d => d.id);
  }

  const api = {
    LOCI, POLY, TANG_HIGH, TANG_MID, THRESH: T, DEX,
    morphName, mendelName, lineTokens, hets, locusDist, breed, forecast, normGenes, normPoly, randomPoly, dexMatches,
  };
  root.LeopaGenetics = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
