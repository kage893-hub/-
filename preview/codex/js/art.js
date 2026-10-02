/* レオパといっしょ — 見た目（SVG を文字列で組み立てる）
 * レオパは上から見た姿。viewBox 0 0 100 200、頭が上。
 */
(function (root) {
  'use strict';

  let uid = 0;
  const VISUAL_DEFAULTS = { spots: 60, blotch: 45, head: 60, carrot: 5, lav: 20, aberrant: 18, mel: 6 };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  function visualPoly(poly) {
    const out = {};
    for (const key of Object.keys(VISUAL_DEFAULTS)) {
      out[key] = Number.isFinite(poly && poly[key]) ? clamp(poly[key], 0, 100) : VISUAL_DEFAULTS[key];
    }
    return out;
  }

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

  function colors(genes, tang, stage, poly) {
    genes = genes || {};
    poly = visualPoly(poly);
    tang = Number.isFinite(tang) ? clamp(tang, 0, 100) : 15;
    const s = genes.snow || 0, a = genes.alb === 2, e = genes.ecl === 2, b = genes.bliz === 2;
    const bl = genes.bell === 2 && !a, albino = a || bl;
    const galaxy = !b && !albino && root.LeopaGenetics.isGalaxy(genes, poly);
    const superSnow = s === 2, fineSpots = superSnow || galaxy;
    const patternKind = b ? 'none' : fineSpots ? 'fine' : poly.aberrant >= 82 ? 'stripe' : poly.aberrant >= 60 ? 'jungle' : 'spots';
    // 黄色の強さとオレンジの強さを分ける。ノーマルを一律オレンジにしない。
    let base = tang < 40 ? mix('#DCC77D', '#EBCB55', tang / 40)
      : tang < 70 ? mix('#EBCB55', '#F0BB41', (tang - 40) / 30)
        : mix('#EFAA39', '#E87928', (tang - 70) / 30);
    if (stage === 'baby') base = mix(base, '#F3D86B', 0.25);
    let tail = mix('#EDE4DE', '#D9CFDD', poly.lav / 100 * 0.35);
    let spot = '#272329';
    let eye = '#77705F', pupil = '#16130F', solid = false;
    if (a) { spot = stage === 'baby' ? '#AA8791' : '#987257'; base = mix(base, '#F6E3C4', 0.22); tail = '#EEDBE2'; }
    if (bl) { spot = stage === 'baby' ? '#A88091' : '#A57679'; base = mix(base, '#F7DECD', 0.22); tail = '#F0DCE3'; }
    if (s === 1 && !galaxy) {
      const whiten = stage === 'baby' ? 0.95 : stage === 'young' ? 0.82 : 0.68;
      base = mix(base, '#F1EFEB', whiten); tail = mix(tail, '#F2EFEE', 0.7);
    }
    if (fineSpots) {
      base = stage === 'baby' ? '#BDB2C8' : stage === 'young' ? '#DED9E4' : '#EEECEF';
      if (albino) base = mix(base, '#F5E4E6', 0.3);
      tail = mix(base, '#F5F1F2', 0.4);
    }
    if (b) {
      base = albino ? '#F2E9E0' : mix('#DDD8DE', '#ECE6DB', tang / 100 * 0.35);
      tail = mix(base, '#F5EEF0', 0.25);
      if (stage === 'baby') { base = mix(base, '#DFCEE1', 0.3); tail = mix(tail, '#E5D7E4', 0.3); }
      if (a && e) { base = '#F4F0EE'; tail = '#F4F0F0'; }
    }
    // 両アルビノ系統で黒いメラニンを出さない。
    const melanism = albino ? 0 : clamp((poly.mel - 30) / 55, 0, 1);
    if (melanism > 0) {
      const k = melanism, m = k * k * (3 - 2 * k) * 0.97;
      base = mix(base, '#141210', m); tail = mix(tail, '#1C1917', m * 0.95); spot = mix(spot, '#050404', m);
    }
    if (e || superSnow) { solid = true; eye = albino ? (bl ? '#A3283A' : '#8E2231') : '#151515'; }
    else if (a) { eye = '#E2C1BC'; pupil = '#B4535A'; }
    else if (bl) { eye = '#E5B3B3'; pupil = '#C0505E'; }
    else if (b) { eye = '#4A4540'; }
    const whiteOut = e && !b;
    const carrot = b || fineSpots ? 0 : poly.carrot;
    return { base, tail, spot, eye, pupil, solid, galaxy, superSnow, fineSpots, albino, whiteOut, melanism, carrot,
      patternKind, pattern: !b, outline: mix(base, albino ? '#9E7272' : '#3A2E22', 0.38) };
  }

  // 2D・3Dで共有する斑点配置。u は胴まわり、z は鼻先から尾先への位置。
  // 成長で座標を再抽選せず、帯と斑点の濃さだけを変える。
  function markings(genes, tang, stage, poly, seed) {
    poly = visualPoly(poly);
    const pal = colors(genes, tang, stage, poly);
    const r = prng((seed || 1) * 7 + 3);
    const spots = [], bands = [], stripes = [];
    const spotAlpha = stage === 'baby' ? 0 : stage === 'young' ? 0.78 : 0.96;
    const density = poly.spots < 8 ? 0 : poly.spots < 22 ? poly.spots / 22 * 0.07 : Math.pow(poly.spots / 60, 1.15);
    const size = 0.65 + poly.blotch / 100 * 0.7;
    const addRegion = (region, n, zTop, zBot, spread, radius) => {
      const rng = prng((seed || 1) * 11 + (region === 'head' ? 101 : region === 'body' ? 203 : 307));
      const placed = [];
      const cols = region === 'head' ? 10 : pal.fineSpots ? 18 : 7, rows = Math.ceil(n / cols);
      for (let i = 0; i < n; i++) {
        const row = Math.floor(i / cols), col = i % cols;
        const jungleBody = region === 'body' && pal.patternKind === 'jungle';
        const z = jungleBody ? zTop - rng() * (zTop - zBot)
          : zTop - (row + 0.18 + rng() * 0.65) / rows * (zTop - zBot);
        const u = jungleBody ? 0.5 + (rng() + rng() - 1) * spread
          : 0.5 + ((col + 0.2 + rng() * 0.6) / cols * 2 - 1) * spread;
        const taper = region === 'tail' ? 1 - (zTop - z) / (zTop - zBot) * 0.7 : 1;
        const point = { region, u, z, radius: radius * size * (0.72 + rng() * 0.5) * taper,
          stretch: 0.85 + rng() * 0.35, alpha: spotAlpha };
        const circumference = (region === 'head' ? 2.2 : region === 'body' ? 3.3 : 2.4 * taper);
        if (pal.patternKind !== 'jungle' && placed.some(q => Math.hypot((q.u - u) * circumference, q.z - z)
          < (q.radius + point.radius) * 1.12)) continue;
        placed.push(point); spots.push(point);
      }
    };
    if (pal.pattern) {
      if (pal.patternKind === 'stripe' && density > 0) {
        for (const u of [0.4, 0.6]) {
          const points = [];
          for (let i = 0; i <= 22; i++) points.push({u: u + Math.sin(i * 0.8 + r() * 0.5) * 0.012, z: 1.2 - i / 22 * 4.35});
          stripes.push({ points, width: 0.055, alpha: stage === 'young' ? 0.85 : 0.96 });
        }
      } else {
        const n = Math.round((pal.fineSpots ? 420 : pal.patternKind === 'jungle' ? 30 : 90) * density);
        addRegion('body', n, 1.22, -0.92, pal.fineSpots ? 0.32 : 0.34,
          pal.fineSpots ? 0.033 : pal.patternKind === 'jungle' ? 0.105 : 0.078);
        // ハイポは胴の特徴。頭と尾の斑点まで消さない。
        addRegion('tail', Math.round((pal.fineSpots ? 210 : 90) * (0.55 + poly.spots / 100 * 0.65)),
          -1, pal.whiteOut ? -2.9 : -3.2, 0.34, pal.fineSpots ? 0.04 : 0.057);
      }
      const headCount = poly.head < 10 ? 0 : Math.round((pal.fineSpots ? 110 : 65) * poly.head / 60);
      addRegion('head', headCount, pal.whiteOut ? 1.84 : 2.08, 1.3, 0.27, pal.fineSpots ? 0.018 : 0.03);
      if (!pal.fineSpots && pal.patternKind !== 'stripe') {
        const bodyBandAlpha = stage === 'baby' ? 0.95 : stage === 'young' ? 0.27 : 0;
        const lavenderAlpha = density === 0 ? 0 : clamp((poly.lav - 30) / 70, 0, 1) * (stage === 'baby' ? 0 : 0.8);
        for (const [z0, z1] of [[1.22, 0.88], [0.38, 0.02], [-0.43, -0.79], [-1.16, -1.39], [-1.8, -2.02], [-2.4, -2.61], [-2.94, -3.12]]) {
          // キャロットテールのオレンジ区間には黒い帯を重ねない。
          if (z0 < -0.92 && pal.carrot >= 50 && z0 > -0.92 - pal.carrot / 100 * 1.8) continue;
          bands.push({z0, z1, phase: r() * 6.28, broken: pal.patternKind === 'jungle', alpha: bodyBandAlpha, lavenderAlpha});
        }
      }
    }
    return { palette: pal, spots, bands, stripes, poly };
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

  const svgY = z => z >= 1.22 ? 14 + (2.195 - z) / 0.975 * 48
    : z >= -0.92 ? 62 + (1.22 - z) / 2.14 * 62 : 124 + (-0.92 - z) / 2.44 * 74;
  const svgWidth = z => z >= -0.92 ? 56 : 56 * (1 - clamp((-0.92 - z) / 2.44, 0, 1) * 0.9);
  const svgX = (u, z) => 50 + (u - 0.5) * svgWidth(z);
  function pattern(c, plan) {
    let out = '';
    // 尾のオレンジは頭や胴へ広げない。無地・スノー系の尾には描かない。
    if (c.carrot > 8) {
      const end = svgY(-0.92 - c.carrot / 100 * 1.8);
      out += `<path d="M25 124 H75 V${end.toFixed(1)} H25 Z" fill="#EB8A31" opacity="${Math.min(0.95, c.carrot / 55) * (1 - c.melanism)}"/>`;
    }
    for (const band of plan.bands) {
      const y0 = svgY(band.z0), y1 = svgY(band.z1);
      const segments = band.broken ? [[0.12, 0.38], [0.45, 0.7], [0.77, 0.88]] : [[0, 1]];
      for (const [lo, hi] of segments) {
        const x0 = svgX(lo, band.z0), x1 = svgX(hi, band.z0);
        const d = `M${x0} ${y0} Q50 ${y0 + Math.sin(band.phase) * 2} ${x1} ${y0} V${y1} Q50 ${y1 + 2} ${x0} ${y1} Z`;
        if (band.lavenderAlpha > 0) out += `<path d="${d}" fill="#A998B5" opacity="${band.lavenderAlpha}"/>`;
        if (band.alpha > 0) out += `<path d="${d}" fill="${c.spot}" opacity="${band.alpha}"/>`;
      }
    }
    for (const stripe of plan.stripes) {
      const d = stripe.points.map((p, i) => `${i ? 'L' : 'M'}${svgX(p.u, p.z).toFixed(1)} ${svgY(p.z).toFixed(1)}`).join(' ');
      out += `<path d="${d}" fill="none" stroke="${c.spot}" stroke-width="3.3" stroke-linejoin="round" stroke-linecap="round" opacity="${stripe.alpha}"/>`;
    }
    for (const p of plan.spots) {
      if (!p.alpha) continue;
      const radius = p.radius * (p.region === 'tail' ? 25 : 24);
      out += `<ellipse data-region="${p.region}" cx="${svgX(p.u, p.z).toFixed(1)}" cy="${svgY(p.z).toFixed(1)}" rx="${(radius * p.stretch).toFixed(2)}" ry="${radius.toFixed(2)}" fill="${c.spot}" opacity="${p.alpha}"/>`;
    }
    if (c.whiteOut) out += '<ellipse cx="50" cy="22" rx="13" ry="7" fill="#F7F4F4"/><path d="M35 185 H65 V200 H35 Z" fill="#F7F4F4"/>';
    return out;
  }

  /* g: { genes, tang, seed }  opt: { stage, gravid, shed, label } */
  function gecko(g, opt) {
    opt = opt || {};
    const id = 'lg' + (++uid);
    const stage = opt.stage || 'adult';
    const plan = markings(g.genes, g.tang, stage, g.poly, g.seed || 1);
    const c = plan.palette;

    const legColor = c.whiteOut ? '#F2EDF0' : c.base;
    const legs = LEGS.map(([cls, d, [ex, ey], origin, front]) => {
      const dir = front ? -1 : 1;
      const toes = [[-3, -0.5 * dir], [0, 3 * dir], [3, -0.5 * dir]]
        .map(([tx, ty]) => `<circle cx="${ex + tx}" cy="${ey + ty}" r="2" fill="${legColor}" stroke="${c.outline}" stroke-width=".8"/>`).join('');
      return `<g class="leg ${cls}" style="transform-origin:${origin}">` +
        `<path d="${d}" stroke="${c.outline}" stroke-width="9" stroke-linecap="round" fill="none"/>` +
        `<path d="${d}" stroke="${legColor}" stroke-width="6" stroke-linecap="round" fill="none"/>${toes}</g>`;
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
      `<g clip-path="url(#${id}c)">${pattern(c, plan)}${gloss}${eggs}</g>` +
      `${shed}${nose}${eyes}</svg>`;
  }

  function swatch(g) {
    const c = colors(g.genes, g.tang, 'adult', g.poly);
    let dots = '';
    if (c.pattern && visualPoly(g.poly).spots >= 8) {
      if (c.patternKind === 'stripe') dots = `<path d="M7 4 V16 M13 4 V16" stroke="${c.spot}" stroke-width="1.5"/>`;
      else if (c.fineSpots) dots = [[6, 7], [10, 6], [14, 7], [6, 11], [10, 10], [14, 11], [8, 14], [12, 14]]
        .map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".8" fill="${c.spot}"/>`).join('');
      else dots = `<circle cx="7" cy="8" r="1.8" fill="${c.spot}"/><circle cx="13" cy="11" r="1.6" fill="${c.spot}"/><circle cx="9" cy="14" r="1.3" fill="${c.spot}"/>`;
    }
    return `<svg class="swatch" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.5" fill="${c.base}" stroke="${c.outline}" stroke-width="1.2"/>${dots}</svg>`;
  }

  // レオパの卵：白くて少し細長い、やわらかい革のような殻（つやは少なめ）。
  // mark：上下がわかるように、えんぴつでつけたしるし
  function egg(mark) {
    const id = 'eg' + (++uid);
    const r = prng(uid * 97 + 13);
    let dots = '';
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r());
      dots += `<circle cx="${(30 + Math.cos(a) * d * 17).toFixed(1)}" cy="${(43 + Math.sin(a) * d * 28).toFixed(1)}" r="${(0.4 + r() * 0.8).toFixed(2)}" fill="#C9BFA9" opacity="${(0.25 + r() * 0.35).toFixed(2)}"/>`;
    }
    return `<svg class="egg-svg" viewBox="0 0 60 80" aria-hidden="true"><defs>
        <radialGradient id="${id}g" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="#FFFEFA"/><stop offset=".55" stop-color="#F3EEE2"/><stop offset=".85" stop-color="#E2D9C6"/><stop offset="1" stop-color="#CFC4AC"/></radialGradient>
        <clipPath id="${id}c"><path d="M30 10 C43 10 48 28 48 45 C48 63 40 75 30 75 C20 75 12 63 12 45 C12 28 17 10 30 10 Z"/></clipPath>
      </defs>
      <ellipse cx="31" cy="76.5" rx="15" ry="2.6" fill="#000" opacity=".1"/>
      <path d="M30 10 C43 10 48 28 48 45 C48 63 40 75 30 75 C20 75 12 63 12 45 C12 28 17 10 30 10 Z" fill="url(#${id}g)" stroke="#CDBFA4" stroke-width="1.2"/>
      <g clip-path="url(#${id}c)">${dots}<ellipse cx="22" cy="30" rx="5" ry="9" fill="#fff" opacity=".45"/></g>
      ${mark ? '<path d="M25 22 L35 22 M30 17 L30 27" stroke="#55524C" stroke-width="2.2" stroke-linecap="round"/>' : ''}</svg>`;
  }

  const FOOD_SVG = {
    cricketS: '<svg viewBox="0 0 40 30" aria-hidden="true"><g transform="translate(9 6) scale(.62)"><g stroke="#5A3B1C" stroke-width="2" stroke-linecap="round" fill="none"><path d="M16 18 L8 27 M24 18 L32 28 M18 12 L11 4 M26 12 L35 5"/><path d="M8 13 Q1 6 3 1 M8 17 Q1 22 2 28" stroke-width="1.3"/></g><ellipse cx="23" cy="15" rx="11" ry="6" fill="#8A5A2B"/><circle cx="11" cy="15" r="4.5" fill="#6B4320"/></g></svg>',
    paste: '<svg viewBox="0 0 40 30" aria-hidden="true"><ellipse cx="20" cy="22" rx="16" ry="5" fill="#E9E4DA" stroke="#C9C1B2" stroke-width="1"/><path d="M9 20 Q10 11 17 10 Q20 6 24 10 Q31 11 31 20 Q20 23 9 20 Z" fill="#B5793F"/><ellipse cx="16" cy="13" rx="3" ry="1.5" fill="#D9A46E" opacity=".7"/></svg>',
    cricket: '<svg viewBox="0 0 40 30" aria-hidden="true"><g stroke="#5A3B1C" stroke-width="1.6" stroke-linecap="round" fill="none"><path d="M16 18 L8 27 M24 18 L32 28 M18 12 L11 4 M26 12 L35 5"/><path d="M8 13 Q1 6 3 1 M8 17 Q1 22 2 28" stroke-width="1"/></g><ellipse cx="23" cy="15" rx="11" ry="6" fill="#8A5A2B"/><circle cx="11" cy="15" r="4.5" fill="#6B4320"/></svg>',
    dubia: '<svg viewBox="0 0 40 30" aria-hidden="true"><ellipse cx="20" cy="15" rx="13" ry="10" fill="#5E3A22"/><g stroke="#3E2515" stroke-width="1" fill="none"><path d="M9 11 Q20 8 31 11 M8 15 Q20 12 32 15 M9 19 Q20 17 31 19"/></g><ellipse cx="20" cy="6" rx="6" ry="3" fill="#7A4E2E"/></svg>',
    worm: '<svg viewBox="0 0 40 30" aria-hidden="true"><path d="M5 18 Q14 8 22 15 T36 12" stroke="#C99A3E" stroke-width="7" stroke-linecap="round" fill="none"/><path d="M9 14 v6 M14 11 v6 M19 12 v6 M24 14 v6 M29 13 v6" stroke="#9C7427" stroke-width="1"/></svg>',
  };
  function food(kind) { return FOOD_SVG[kind] || FOOD_SVG.cricket; }

  // フンの白いところは尿酸
  function poop() {
    return '<svg viewBox="0 0 30 20" aria-hidden="true"><ellipse cx="12" cy="11" rx="9" ry="5.5" fill="#4A3524"/><ellipse cx="23" cy="11" rx="4.5" ry="3.8" fill="#F4F1E8" stroke="#D9D2C0" stroke-width=".8"/></svg>';
  }

  root.LeopaArt = { gecko, swatch, egg, food, poop, colors, markings, visualPoly, mix };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.LeopaArt;
})(typeof window !== 'undefined' ? window : globalThis);
