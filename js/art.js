/* レオパといっしょ — 見た目（SVG を文字列で組み立てる）
 * レオパは上から見た姿。viewBox 0 0 100 200、頭が上。
 */
(function (root) {
  'use strict';

  let uid = 0;

  function h2r(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function r2h(r) { return '#' + r.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join(''); }
  function mix(a, b, t) { const A = h2r(a), B = h2r(b); return r2h(A.map((v, i) => v + (B[i] - v) * t)); }

  function prng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function colors(genes, tang, stage) {
    const s = genes.snow || 0, a = genes.alb === 2, e = genes.ecl === 2, b = genes.bliz === 2;
    let base = mix('#E9C64C', '#EE7A2A', Math.max(0, tang - 15) / 85);
    if (stage === 'baby' && !s && !b) base = mix(base, '#F2D34E', 0.3);
    let tail = mix(base, '#EDE3D6', 0.5);
    let spot = '#2A2521';
    let eye = '#77705F', pupil = '#16130F', solid = false;

    if (a) { spot = '#A0704A'; base = mix(base, '#F5E6BE', 0.25); tail = mix(tail, '#F5E6BE', 0.25); }
    if (s === 1) { base = mix(base, '#F3F0E6', 0.62); tail = mix(tail, '#F2F0EC', 0.6); }
    if (s === 2) { base = '#F2F1EC'; tail = '#EDEDE9'; }
    if (b) { base = s ? mix(base, '#F4F2EC', 0.5) : mix(base, '#EFE7CF', 0.55); tail = mix(base, '#F2EEE6', 0.3); }
    if (b && a && e) { base = '#F6F4EE'; tail = '#F4F2EC'; }

    if (e) { solid = true; eye = a ? '#8E2231' : '#151515'; }
    else if (s === 2) { solid = true; eye = '#161616'; }
    else if (a) { eye = '#E2C1BC'; pupil = '#B4535A'; }
    else if (b) { eye = '#4A4540'; }

    return { base, tail, spot, eye, pupil, solid, pattern: !b, outline: mix(base, '#3A2E22', 0.38) };
  }

  const SHAPES = [
    ['path', 'd="M37 124 C28 150 38 178 50 198 C62 178 72 150 63 124 Z"', 'tail'],
    ['ellipse', 'cx="50" cy="96" rx="19" ry="33"', 'body'],
    ['ellipse', 'cx="50" cy="62" rx="12.5" ry="10"', 'body'],
    ['ellipse', 'cx="50" cy="42" rx="16.5" ry="17"', 'body'],
    ['ellipse', 'cx="50" cy="27" rx="11.5" ry="10"', 'body'],
  ];
  function drawShapes(attrs) {
    return SHAPES.map(([tag, geo, part]) => `<${tag} ${geo} ${attrs(part)}/>`).join('');
  }

  // [組, 肩→足先のパス, 足先, 回転の中心, 前足か]
  const LEGS = [
    ['a', 'M37 72 Q24 70 20 58', [20, 58], '37px 72px', true],
    ['b', 'M63 72 Q76 70 80 58', [80, 58], '63px 72px', true],
    ['b', 'M36 114 Q22 118 19 132', [19, 132], '36px 114px', false],
    ['a', 'M64 114 Q78 118 81 132', [81, 132], '64px 114px', false],
  ];

  function pattern(c, stage, seed, genes) {
    if (!c.pattern) return '';
    const r = prng(seed);
    let out = '';
    // ベビーはしま模様。成長すると斑点に変わっていく
    const bandOp = stage === 'baby' ? 0.95 : stage === 'young' ? 0.4 : 0;
    if (bandOp > 0) {
      const bands = [[53, 8], [74, 10], [96, 10], [118, 9], [142, 8], [162, 8], [181, 7]];
      for (const [y, h] of bands) {
        const w1 = (y - 3 + r() * 6).toFixed(1), w2 = (y + h + r() * 4).toFixed(1);
        out += `<path d="M0 ${y} Q25 ${w1} 50 ${y + 1} T100 ${y} V${y + h} Q75 ${w2} 50 ${y + h - 1} T0 ${y + h} Z" fill="${c.spot}" opacity="${bandOp}"/>`;
      }
    }
    const spotOp = stage === 'baby' ? 0 : stage === 'young' ? 0.75 : 1;
    if (spotOp > 0) {
      const n = genes.snow === 2 ? 72 : 54;
      for (let i = 0; i < n; i++) {
        const x = 28 + r() * 44, y = 14 + r() * 178, rr = 1.2 + r() * 2.3;
        out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rr.toFixed(1)}" fill="${c.spot}" opacity="${spotOp}"/>`;
      }
    }
    return out;
  }

  /* g: { genes, tang, seed }  opt: { stage, gravid, shed, label } */
  function gecko(g, opt) {
    opt = opt || {};
    const id = 'lg' + (++uid);
    const stage = opt.stage || 'adult';
    const c = colors(g.genes, g.tang, stage);

    const legs = LEGS.map(([cls, d, [ex, ey], origin, front]) => {
      const dir = front ? -1 : 1;
      const toes = [[-3, -0.5 * dir], [0, 3 * dir], [3, -0.5 * dir]]
        .map(([tx, ty]) => `<circle cx="${ex + tx}" cy="${ey + ty}" r="2" fill="${c.base}" stroke="${c.outline}" stroke-width=".8"/>`).join('');
      return `<g class="leg ${cls}" style="transform-origin:${origin}">` +
        `<path d="${d}" stroke="${c.outline}" stroke-width="9" stroke-linecap="round" fill="none"/>` +
        `<path d="${d}" stroke="${c.base}" stroke-width="6" stroke-linecap="round" fill="none"/>${toes}</g>`;
    }).join('');

    const outline = drawShapes(() => `fill="${c.outline}" stroke="${c.outline}" stroke-width="3.2"`);
    const fill = drawShapes(p => `fill="${p === 'tail' ? c.tail : c.base}"`);
    const clip = `<clipPath id="${id}c">${drawShapes(() => '')}</clipPath>`;
    const gloss = '<ellipse cx="45" cy="88" rx="7" ry="20" fill="#fff" opacity=".13"/><ellipse cx="45" cy="38" rx="6" ry="7" fill="#fff" opacity=".12"/>';
    // 抱卵中はおなかが透けて卵が見える
    const eggs = opt.gravid ? '<ellipse cx="43.5" cy="102" rx="5" ry="8.5" fill="#FFF4E8" opacity=".6"/><ellipse cx="56.5" cy="102" rx="5" ry="8.5" fill="#FFF4E8" opacity=".6"/>' : '';
    const shed = opt.shed ? `<g opacity=".5">${drawShapes(() => 'fill="#FFFFFF"')}</g>` : '';
    const eyes = [[35.5, 35], [64.5, 35]].map(([x, y]) =>
      `<g class="eye"><ellipse cx="${x}" cy="${y}" rx="4.6" ry="5.4" fill="${c.eye}" stroke="${c.outline}" stroke-width="1"/>` +
      (c.solid ? '' : `<rect x="${x - 0.7}" y="${y - 4}" width="1.4" height="8" rx=".7" fill="${c.pupil}"/>`) +
      `<circle cx="${x - 1.3}" cy="${y - 2}" r="1.1" fill="#fff" opacity=".8"/></g>`).join('');
    const nose = `<circle cx="46" cy="20" r=".9" fill="${c.outline}"/><circle cx="54" cy="20" r=".9" fill="${c.outline}"/>`;
    const tongue = '<path class="tongue" d="M50 18 L50 9 M50 9 L47.5 6 M50 9 L52.5 6" stroke="#E0707E" stroke-width="2.2" stroke-linecap="round" fill="none" style="transform-origin:50px 18px"/>';

    return `<svg class="gsvg" viewBox="0 0 100 200" xmlns="http://www.w3.org/2000/svg"${opt.label ? ` role="img" aria-label="${opt.label}"` : ' aria-hidden="true"'}>` +
      `<defs>${clip}</defs>${tongue}${legs}${outline}${fill}` +
      `<g clip-path="url(#${id}c)">${pattern(c, stage, g.seed || 1, g.genes)}${gloss}${eggs}</g>` +
      `${shed}${nose}${eyes}</svg>`;
  }

  function swatch(g) {
    const c = colors(g.genes, g.tang, 'adult');
    const dots = c.pattern ? `<circle cx="7" cy="8" r="1.8" fill="${c.spot}"/><circle cx="13" cy="11" r="1.6" fill="${c.spot}"/><circle cx="9" cy="14" r="1.3" fill="${c.spot}"/>` : '';
    return `<svg class="swatch" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.5" fill="${c.base}" stroke="${c.outline}" stroke-width="1.2"/>${dots}</svg>`;
  }

  // mark：上下がわかるように、えんぴつでつけたしるし
  function egg(mark) {
    return `<svg class="egg-svg" viewBox="0 0 60 80" aria-hidden="true"><ellipse cx="30" cy="44" rx="21" ry="29" fill="#F7F2E6" stroke="#D6CBB5" stroke-width="2"/><ellipse cx="23" cy="32" rx="5" ry="8" fill="#fff" opacity=".75"/><circle cx="38" cy="55" r="1.2" fill="#DCD2BE"/><circle cx="33" cy="62" r="1" fill="#DCD2BE"/>${mark ? '<path d="M25 24 L35 24 M30 19 L30 29" stroke="#55524C" stroke-width="2.4" stroke-linecap="round"/>' : ''}</svg>`;
  }

  const FOOD_SVG = {
    cricket: '<svg viewBox="0 0 40 30" aria-hidden="true"><g stroke="#5A3B1C" stroke-width="1.6" stroke-linecap="round" fill="none"><path d="M16 18 L8 27 M24 18 L32 28 M18 12 L11 4 M26 12 L35 5"/><path d="M8 13 Q1 6 3 1 M8 17 Q1 22 2 28" stroke-width="1"/></g><ellipse cx="23" cy="15" rx="11" ry="6" fill="#8A5A2B"/><circle cx="11" cy="15" r="4.5" fill="#6B4320"/></svg>',
    dubia: '<svg viewBox="0 0 40 30" aria-hidden="true"><ellipse cx="20" cy="15" rx="13" ry="10" fill="#5E3A22"/><g stroke="#3E2515" stroke-width="1" fill="none"><path d="M9 11 Q20 8 31 11 M8 15 Q20 12 32 15 M9 19 Q20 17 31 19"/></g><ellipse cx="20" cy="6" rx="6" ry="3" fill="#7A4E2E"/></svg>',
    worm: '<svg viewBox="0 0 40 30" aria-hidden="true"><path d="M5 18 Q14 8 22 15 T36 12" stroke="#C99A3E" stroke-width="7" stroke-linecap="round" fill="none"/><path d="M9 14 v6 M14 11 v6 M19 12 v6 M24 14 v6 M29 13 v6" stroke="#9C7427" stroke-width="1"/></svg>',
  };
  function food(kind) { return FOOD_SVG[kind] || FOOD_SVG.cricket; }

  // フンの白いところは尿酸
  function poop() {
    return '<svg viewBox="0 0 30 20" aria-hidden="true"><ellipse cx="12" cy="11" rx="9" ry="5.5" fill="#4A3524"/><ellipse cx="23" cy="11" rx="4.5" ry="3.8" fill="#F4F1E8" stroke="#D9D2C0" stroke-width=".8"/></svg>';
  }

  root.LeopaArt = { gecko, swatch, egg, food, poop, colors, mix };
})(typeof window !== 'undefined' ? window : globalThis);
