/* レオパといっしょ — 遺伝とモルフ名
 * 遺伝子は「その遺伝子を何コピー持っているか」(0/1/2) で表す。
 *   snow : マックスノー（共優性。1コピーで見た目に出て、2コピーでスーパー）
 *   alb  : トレンパーアルビノ（劣性）
 *   ecl  : エクリプス（劣性）
 *   bliz : ブリザード（劣性）
 * tang はタンジェリン度 (0-100)。多因子遺伝なので両親の平均にゆらぎを足して決める。
 */
(function (root) {
  'use strict';

  const LOCI = [
    { key: 'snow', name: 'マックスノー', type: 'codom' },
    { key: 'alb', name: 'トレンパーアルビノ', short: 'アルビノ', type: 'rec' },
    { key: 'ecl', name: 'エクリプス', short: 'エクリプス', type: 'rec' },
    { key: 'bliz', name: 'ブリザード', short: 'ブリザード', type: 'rec' },
  ];
  const TANG_HIGH = 70;
  const TANG_MID = 40;

  function normGenes(g) {
    return { snow: g.snow || 0, alb: g.alb || 0, ecl: g.ecl || 0, bliz: g.bliz || 0 };
  }

  function morphName(genes, tang) {
    const g = normGenes(genes);
    const a = g.alb === 2, e = g.ecl === 2, b = g.bliz === 2;
    let tangUsed = false;
    const tokens = [];
    if (g.snow === 1) tokens.push('マックスノー');
    if (g.snow === 2 && e && !a && !b) {
      tokens.push('トータルエクリプス');
    } else {
      if (g.snow === 2) tokens.push('スーパーマックスノー');
      if (b && a && e) {
        tokens.push('ディアブロブランコ');
      } else if (a && e) {
        if (tang >= TANG_HIGH) { tokens.push('ラプター'); tangUsed = true; }
        else tokens.push('レッドアイアルビノ');
      } else if (a && b) {
        tokens.push('ブレイジングブリザード');
      } else {
        if (b) tokens.push('ブリザード');
        if (a) tokens.push('トレンパーアルビノ');
        if (e) tokens.push('エクリプス');
      }
    }
    if (tokens.length === 0) {
      if (tang >= TANG_HIGH) return 'タンジェリン';
      if (tang >= TANG_MID) return 'ハイイエロー';
      return 'ノーマル';
    }
    if (tang >= TANG_HIGH && !tangUsed) tokens.unshift('タンジェリン');
    return tokens.join(' ');
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

  function breed(mom, dad, rng) {
    rng = rng || Math.random;
    const m = normGenes(mom.genes), d = normGenes(dad.genes);
    const genes = {};
    for (const l of LOCI) {
      genes[l.key] = (rng() < m[l.key] / 2 ? 1 : 0) + (rng() < d[l.key] / 2 ? 1 : 0);
    }
    // 少しだけ上ぶれしやすくして、選別交配でオレンジを濃くしていける
    const avg = (mom.tang + dad.tang) / 2;
    const tang = Math.max(0, Math.min(100, Math.round(avg + rng() * 28 - 12)));
    return { genes, tang };
  }

  // ペアリング前の子の予想
  function forecast(mom, dad) {
    const m = normGenes(mom.genes), d = normGenes(dad.genes);
    const dists = LOCI.map(l => locusDist(m[l.key], d[l.key]));
    const morphs = {};
    (function walk(i, genes, p) {
      if (p === 0) return;
      if (i === LOCI.length) {
        const name = morphName(genes, 0);
        morphs[name] = (morphs[name] || 0) + p;
        return;
      }
      for (let c = 0; c < 3; c++) walk(i + 1, Object.assign({}, genes, { [LOCI[i].key]: c }), p * dists[i][c]);
    })(0, {}, 1);
    const hetList = LOCI.map((l, i) => ({ name: l.short, p: dists[i][1] }))
      .filter((h, i) => LOCI[i].type === 'rec' && h.p > 0);
    return {
      morphs: Object.entries(morphs).map(([name, p]) => ({ name, p })).sort((x, y) => y.p - x.p),
      hets: hetList,
      tang: Math.round((mom.tang + dad.tang) / 2),
    };
  }

  // 図鑑に載せる目標モルフ
  const DEX = [
    { name: 'ノーマル', genes: {}, tang: 15, hint: 'いちばん基本の色。野生のレオパに近い姿' },
    { name: 'ハイイエロー', genes: {}, tang: 50, hint: '黄色が強いノーマル。タンジェリン度40以上' },
    { name: 'タンジェリン', genes: {}, tang: 85, hint: 'タンジェリン度70以上。オレンジの濃い子同士を掛けあわせよう' },
    { name: 'マックスノー', genes: { snow: 1 }, tang: 15, hint: '共優性。マックスノー×ノーマルで50%' },
    { name: 'スーパーマックスノー', genes: { snow: 2 }, tang: 15, hint: 'マックスノー同士で25%。目が真っ黒になる' },
    { name: 'トレンパーアルビノ', genes: { alb: 2 }, tang: 15, hint: '劣性。het アルビノ同士で25%' },
    { name: 'エクリプス', genes: { ecl: 2 }, tang: 15, hint: '劣性。目が真っ黒になる' },
    { name: 'ブリザード', genes: { bliz: 2 }, tang: 15, hint: '劣性。模様がまったくなくなる' },
    { name: 'マックスノー トレンパーアルビノ', genes: { snow: 1, alb: 2 }, tang: 15, hint: '通称スノーアルビノ。マックスノー＋アルビノ' },
    { name: 'スーパーマックスノー トレンパーアルビノ', genes: { snow: 2, alb: 2 }, tang: 15, hint: 'スーパーマックスノー＋アルビノ' },
    { name: 'マックスノー エクリプス', genes: { snow: 1, ecl: 2 }, tang: 15, hint: 'マックスノー＋エクリプス' },
    { name: 'トータルエクリプス', genes: { snow: 2, ecl: 2 }, tang: 15, hint: 'スーパーマックスノー＋エクリプス' },
    { name: 'レッドアイアルビノ', genes: { alb: 2, ecl: 2 }, tang: 15, hint: 'アルビノ＋エクリプス。目がルビー色に' },
    { name: 'ラプター', genes: { alb: 2, ecl: 2 }, tang: 85, hint: 'レッドアイアルビノで、タンジェリン度70以上' },
    { name: 'ブレイジングブリザード', genes: { alb: 2, bliz: 2 }, tang: 15, hint: 'アルビノ＋ブリザード' },
    { name: 'ディアブロブランコ', genes: { alb: 2, ecl: 2, bliz: 2 }, tang: 15, hint: 'アルビノ＋エクリプス＋ブリザード。最難関' },
  ];

  const api = { LOCI, TANG_HIGH, TANG_MID, DEX, morphName, hets, locusDist, breed, forecast, normGenes };
  root.LeopaGenetics = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
