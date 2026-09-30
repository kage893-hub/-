/* レオパといっしょ — 3D 表示（Three.js r128）
 *
 * レオパの体は「頭〜しっぽまで 1 枚つながりのメッシュ」を断面の輪郭から作り、
 * 目のくぼみ・まぶた・口の溝などを頭の面に彫りこんで、背骨のボーンで曲げる（SkinnedMesh）。
 * 目玉・まぶた・脚・舌はボーンにぶら下げる。
 * 模様・おなか・唇・突起（ぶつぶつ）は、体の UV に合わせてキャンバスに描く。
 * 模様の置き方は個体ごとの seed、斑点の量や大きさは見た目の遺伝（poly）で決まる。
 *
 * 座標: レオパは +Z 向き。鼻先 z≈2.26、しっぽの先 z≈-3.36。ケースの床は x: -5〜5, z: -3.75〜3.75。
 */
(function (root) {
  'use strict';
  const T = root.THREE;
  const A = root.LeopaArt;

  const supported = (() => {
    try {
      const c = document.createElement('canvas');
      return !!(T && (c.getContext('webgl2') || c.getContext('webgl')));
    } catch (e) { return false; }
  })();

  const V = (x, y, z) => new T.Vector3(x, y, z);
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const smooth = t => t * t * (3 - 2 * t);
  function angleTo(from, to) { return ((to - from + Math.PI * 3) % (Math.PI * 2)) - Math.PI; }
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

  // ======================================================
  // 体の形（断面の輪郭）
  // ======================================================
  // 実物の比率に合わせる：胴は細長い円柱、幅は頭とほぼ同じ。しっぽは胴と同じくらい長く、付け根から先へまっすぐ細くなる。
  // z, 半幅, 上の厚み, 下の厚み, 中心の高さ, 断面の角ばり具合
  const PROFILE = [
    [2.17, 0.11, 0.075, 0.055, 0.40, 2.3],
    [2.14, 0.20, 0.135, 0.09, 0.405, 2.3],
    [2.09, 0.29, 0.185, 0.125, 0.415, 2.35],
    [2.02, 0.37, 0.22, 0.155, 0.43, 2.4],
    [1.94, 0.43, 0.245, 0.175, 0.445, 2.45],
    [1.83, 0.48, 0.26, 0.19, 0.455, 2.5],
    [1.71, 0.52, 0.265, 0.205, 0.46, 2.5],
    [1.59, 0.55, 0.27, 0.22, 0.46, 2.45],
    [1.49, 0.54, 0.265, 0.23, 0.46, 2.4],
    [1.39, 0.5, 0.26, 0.24, 0.455, 2.3],
    [1.26, 0.49, 0.26, 0.245, 0.455, 2.3],
    [1.05, 0.52, 0.27, 0.25, 0.46, 2.4],
    [0.70, 0.57, 0.29, 0.26, 0.46, 2.5],
    [0.30, 0.61, 0.31, 0.27, 0.46, 2.5],
    [-0.10, 0.62, 0.31, 0.27, 0.46, 2.5],
    [-0.45, 0.59, 0.30, 0.26, 0.45, 2.5],
    [-0.72, 0.51, 0.27, 0.24, 0.44, 2.4],
    [-0.90, 0.47, 0.26, 0.23, 0.42, 2.3],
    [-1.15, 0.48, 0.26, 0.22, 0.39, 2.2],
    [-1.50, 0.44, 0.24, 0.20, 0.34, 2.2],
    [-1.90, 0.35, 0.20, 0.17, 0.28, 2.2],
    [-2.30, 0.25, 0.15, 0.13, 0.21, 2.2],
    [-2.70, 0.15, 0.10, 0.09, 0.14, 2.2],
    [-3.05, 0.08, 0.055, 0.05, 0.09, 2.2],
    [-3.30, 0.03, 0.025, 0.02, 0.05, 2.2],
  ];

  const Z0 = PROFILE[0][0], Z1 = PROFILE[PROFILE.length - 1][0];
  const Z_NOSE = 2.195, Z_TAIL = -3.36, LEN = Z_NOSE - Z_TAIL;
  const Z_TAILBASE = -0.92;

  function catmull(p0, p1, p2, p3, t) {
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  }
  function profileAt(z, gravid) {
    z = clamp(z, Z1, Z0);
    let i = 0;
    while (i < PROFILE.length - 2 && PROFILE[i + 1][0] > z) i++;
    const a = PROFILE[Math.max(0, i - 1)], b = PROFILE[i], c = PROFILE[i + 1], d = PROFILE[Math.min(PROFILE.length - 1, i + 2)];
    const t = (b[0] - z) / (b[0] - c[0]);
    const k = n => catmull(a[n], b[n], c[n], d[n], t);
    const p = { w: k(1), ht: k(2), hb: k(3), y: k(4), n: k(5) };
    // 体を厚く丸く、脚で地面から持ち上げる（しっぽの先に向かって地面に近づく）
    const body = z > Z_TAILBASE ? 1 : clamp(1 - (Z_TAILBASE - z) / 2.3, 0, 1);
    const hw = smooth(clamp((z - 1.25) / 0.2, 0, 1));
    const arch = Math.exp(-Math.pow((z + 0.05) / 0.9, 2));
    p.ht *= lerp(1.2 + 0.2 * body + 0.18 * arch, 1.5, hw);
    p.hb *= lerp(1.1 + 0.3 * body, 1.38, hw);
    p.w *= lerp(1, 1.1, hw);
    p.y += 0.02 * body + 0.02 * hw;
    if (gravid) { const g = Math.exp(-Math.pow((z + 0.1) / 0.45, 2)); p.w *= 1 + 0.13 * g; p.hb *= 1 + 0.14 * g; }
    return p;
  }
  // th: 0 = 右側, π/2 = 背中, π = 左側, 3π/2 = おなか
  function section(p, th) {
    const c = Math.cos(th), s = Math.sin(th);
    const e = 2 / (s >= 0 ? p.n : 3.4);
    return [p.w * Math.sign(c) * Math.pow(Math.abs(c), e), p.y + (s >= 0 ? p.ht : p.hb) * Math.sign(s) * Math.pow(Math.abs(s), e)];
  }
  function surf(z, th) { const [x, y] = section(profileAt(z), th); return V(x, y, z); }
  function surfNormal(z, th) {
    const e = 0.01;
    const a = surf(z, th + e).sub(surf(z, th - e));
    const b = surf(z - e, th).sub(surf(z + e, th));
    const n = new T.Vector3().crossVectors(a, b).normalize();
    if (n.dot(surf(z, th).sub(V(0, profileAt(z).y, z))) < 0) n.negate();
    return n;
  }
  const thToU = th => { let u = (th - 1.5 * Math.PI) / (2 * Math.PI); return u - Math.floor(u); };
  const zToV = z => (Z_NOSE - z) / LEN;
  function circumference(z) {
    const p = profileAt(z), h = (p.ht + p.hb) / 2;
    return Math.PI * (3 * (p.w + h) - Math.sqrt((3 * p.w + h) * (p.w + 3 * h)));
  }
  // 口のライン（右側）。鼻先から目のうしろまで長く、うしろで少し上がる
  const MOUTH_FRONT = 2.16, MOUTH_BACK = 1.55;
  const mouthTh = z => { const t = clamp((MOUTH_FRONT - z) / (MOUTH_FRONT - MOUTH_BACK), 0, 1); return -0.34 + 0.24 * t + 0.14 * t * t; };

  // ---------- 顔のパーツの位置
  const EYE = { z: 1.83, th: 0.6, r: 0.172, depth: 0.078, a: 0.146, b: 0.122 };
  function eyeFrame(side) {
    const th = side > 0 ? EYE.th : Math.PI - EYE.th;
    const S = surf(EYE.z, th);
    const n = surfNormal(EYE.z, th).add(V(0, 0.05, 0.28)).normalize();
    const e1 = new T.Vector3().crossVectors(V(0, 1, 0), n).normalize();
    const e2 = new T.Vector3().crossVectors(n, e1).normalize();
    return { side, S, n, e1, e2, C: S.clone().addScaledVector(n, -EYE.depth) };
  }
  const EYES = [eyeFrame(1), eyeFrame(-1)];
  const EARS = [1, -1].map(side => { const th = side > 0 ? 0.1 : Math.PI - 0.1; return { side, p: surf(1.47, th), n: surfNormal(1.47, th) }; });
  const NOSTRILS = [1, -1].map(side => { const th = side > 0 ? 1.0 : Math.PI - 1.0; return { side, p: surf(2.12, th), n: surfNormal(2.12, th) }; });

  /* 頭の面を彫る：目のくぼみ・まぶたのふち・眉・口の溝とくちびる・ほほ・鼻・耳 */
  const _q = new T.Vector3();
  function sculpt(v, z, th, p) {
    if (z < 1.3) {
      // しっぽの節（輪状のくびれ）と、わき腹のゆるいひだ
      let out = 0;
      if (z < Z_TAILBASE - 0.05) out -= 0.012 * Math.pow(Math.max(0, Math.cos((z - Z_TAILBASE) / 0.09 * Math.PI)), 6) * clamp(p.w / 0.4, 0.3, 1);
      else if (z < 1.0 && z > -0.7) out -= 0.006 * Math.exp(-Math.pow((Math.sin(th) + 0.25) / 0.12, 2)) * (0.5 + 0.5 * Math.sin(z * 22));
      if (out) {
        const rx = v.x, ry = v.y - p.y, rl = Math.hypot(rx, ry) || 1;
        v.x += rx / rl * out;
        v.y += ry / rl * out;
      }
      return;
    }
    const rx = v.x, ry = v.y - p.y;
    const rl = Math.hypot(rx, ry) || 1;
    let out = 0;
    // 口の溝と、上下のくちびる（大きめのうろこの列）
    if (z > MOUTH_BACK - 0.08) {
      const side = Math.cos(th) >= 0 ? 1 : -1;
      const thm = side > 0 ? mouthTh(z) : Math.PI - mouthTh(z);
      const dth = ((th - thm + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      const d = dth * side * rl;
      const fade = smooth(clamp((z - (MOUTH_BACK - 0.08)) / 0.12, 0, 1));
      out += fade * (-0.016 * Math.exp(-Math.pow(d / 0.011, 2)) + 0.01 * Math.exp(-Math.pow((d - 0.03) / 0.022, 2)) + 0.005 * Math.exp(-Math.pow((d + 0.03) / 0.02, 2)));
    }
    // あごの筋肉でふくらんだほほ
    out += 0.045 * Math.exp(-Math.pow((z - 1.62) / 0.17, 2)) * Math.exp(-Math.pow((Math.sin(th) + 0.1) / 0.45, 2)) * Math.abs(Math.cos(th));
    // 鼻先の上はほんの少し平らに
    out -= 0.008 * Math.exp(-Math.pow((z - 1.99) / 0.12, 2)) * Math.max(0, Math.sin(th));
    v.x += rx / rl * out;
    v.y += ry / rl * out;
    for (const s of NOSTRILS) v.addScaledVector(s.n, 0.013 * Math.exp(-Math.pow(v.distanceTo(s.p) / 0.028, 2)));
    for (const s of EARS) v.addScaledVector(s.n, -0.035 * Math.exp(-Math.pow(v.distanceTo(s.p) / 0.05, 2)));
    // 目
    for (const E of EYES) {
      if (v.x * E.side < 0.05) continue;
      _q.copy(v).sub(E.S);
      if (_q.lengthSq() > 0.25) continue;
      const l1 = _q.dot(E.e1), l2 = _q.dot(E.e2);
      const rho = Math.hypot(l1 / EYE.a, l2 / EYE.b);
      // 厚みのあるまぶた（上は少し厚く）と、なだらかな眉
      const upper = l2 > 0 ? l2 / (Math.hypot(l1, l2) || 1) : 0;
      let push = (0.048 + 0.012 * upper) * Math.exp(-Math.pow((rho - 1.12) / 0.24, 2));
      push += 0.02 * Math.exp(-Math.pow((rho - 1.6) / 0.45, 2)) * upper;
      if (rho < 1) push -= 0.12 * smooth(clamp((1 - rho) / 0.12, 0, 1));
      v.addScaledVector(E.n, push);
    }
  }

  // ======================================================
  // ボーン
  // ======================================================
  const BONES = [
    ['mid', 0.05, null], ['chest', 0.75, 'mid'], ['neck', 1.18, 'chest'], ['head', 1.4, 'neck'],
    ['hip', -0.6, 'mid'], ['t1', -1.05, 'hip'], ['t2', -1.5, 't1'], ['t3', -1.95, 't2'],
    ['t4', -2.4, 't3'], ['t5', -2.82, 't4'], ['t6', -3.15, 't5'],
  ];
  const BONE_ORDER = BONES.map((b, i) => ({ i, z: b[1] })).sort((a, b) => b.z - a.z);
  function boneWorld(name) { const b = BONES.find(x => x[0] === name); return V(0, profileAt(b[1]).y, b[1]); }
  function weightsAt(z) {
    const O = BONE_ORDER;
    if (z >= O[0].z) return [O[0].i, 0, 1, 0];
    if (z <= O[O.length - 1].z) return [O[O.length - 1].i, 0, 1, 0];
    for (let k = 0; k < O.length - 1; k++) {
      if (z <= O[k].z && z >= O[k + 1].z) {
        const t = smooth((O[k].z - z) / (O[k].z - O[k + 1].z));
        return [O[k].i, O[k + 1].i, 1 - t, t];
      }
    }
    return [0, 0, 1, 0];
  }

  // 頭は細かく、しっぽは粗く輪切りにする
  function zSamples(fine) {
    const zs = [];
    for (let z = Z0; z > Z1; z -= z > 1.3 ? (fine ? 0.0075 : 0.012) : z > Z_TAILBASE ? 0.022 : 0.03) zs.push(z);
    zs.push(Z1);
    return zs;
  }
  function bodyGeometry(gravid, fine) {
    const zs = zSamples(fine);
    const N = zs.length, M = fine ? 136 : 96;
    const pos = [], uv = [], si = [], sw = [], idx = [];
    const v = new T.Vector3();
    const push = (x, y, z, u, vv, wz) => {
      pos.push(x, y, z); uv.push(u, vv);
      const w = weightsAt(wz);
      si.push(w[0], w[1], 0, 0); sw.push(w[2], w[3], 0, 0);
    };
    for (let i = 0; i < N; i++) {
      const z = zs[i];
      const p = profileAt(z, gravid);
      for (let j = 0; j <= M; j++) {
        const u = j / M;
        const th = 1.5 * Math.PI + u * 2 * Math.PI;
        const [x, y] = section(p, th);
        v.set(x, y, z);
        sculpt(v, z, th, p);
        push(v.x, v.y, v.z, u, zToV(z), z);
      }
    }
    const nose = N * (M + 1), tail = nose + 1;
    push(0, profileAt(Z0).y - 0.01, Z_NOSE, 0.5, 0, Z0);
    push(0, profileAt(Z1).y, Z_TAIL, 0.5, 1, Z1);
    for (let i = 0; i < N - 1; i++) {
      for (let j = 0; j < M; j++) {
        const a = i * (M + 1) + j, b = a + M + 1, c = b + 1, d = a + 1;
        idx.push(a, b, d, b, c, d);
      }
    }
    for (let j = 0; j < M; j++) {
      idx.push(nose, j, j + 1);
      const r = (N - 1) * (M + 1);
      idx.push(tail, r + j + 1, r + j);
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    geo.setAttribute('skinIndex', new T.Uint16BufferAttribute(si, 4));
    geo.setAttribute('skinWeight', new T.Float32BufferAttribute(sw, 4));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    // おなか側の継ぎ目の法線をそろえる
    const nr = geo.attributes.normal;
    for (let i = 0; i < N; i++) {
      const a = i * (M + 1), b = a + M;
      const x = (nr.getX(a) + nr.getX(b)) / 2, y = (nr.getY(a) + nr.getY(b)) / 2, z = (nr.getZ(a) + nr.getZ(b)) / 2;
      const l = Math.hypot(x, y, z) || 1;
      nr.setXYZ(a, x / l, y / l, z / l);
      nr.setXYZ(b, x / l, y / l, z / l);
    }
    return geo;
  }

  // ======================================================
  // テクスチャ
  // ======================================================
  function canvasTexture(c, opts) {
    const t = new T.CanvasTexture(c);
    t.flipY = false;
    t.anisotropy = 8;
    if (opts && opts.srgb) t.encoding = T.sRGBEncoding;
    if (opts && opts.repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(opts.repeat, opts.repeat); }
    return t;
  }
  const DEFAULT_POLY = { spots: 60, blotch: 45, head: 60, carrot: 5, lav: 20, aberrant: 18 };
  const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };

  /* 体の色と模様。横 = 胴まわり（0 と 1 がおなか、0.5 が背中）、縦 = 鼻先→しっぽの先
   * 模様の置き方は個体ごとの seed、量や大きさは見た目の遺伝（poly）で決まる。 */
  function skinCanvas(pal, look, W, H) {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const r = prng((look.seed || 1) * 7 + 3);
    const st = look.stage;
    const poly = Object.assign({}, DEFAULT_POLY, look.poly || {});
    const scale = W / 1024;
    const belly = A.mix(pal.base, '#FFF9EF', 0.74);
    const lavCol = '#A898B8';

    const around = (cols) => {
      const g = ctx.createLinearGradient(0, 0, W, 0);
      [[0, cols[0]], [0.12, cols[0]], [0.27, cols[1]], [0.5, cols[2]], [0.73, cols[1]], [0.88, cols[0]], [1, cols[0]]].forEach(([p, col]) => g.addColorStop(p, col));
      return g;
    };
    const X = u => u * W, Y = z => zToV(z) * H;
    // 世界の長さ rw の丸を、その位置の太さに合わせて描く
    const blob = (u, z, rw, col, alpha, rot, stretch) => {
      const C = Math.max(0.35, circumference(z));
      ctx.globalAlpha = alpha;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(X(u), Y(z), rw / C * W * (stretch || 1), rw / LEN * H, rot || 0, 0, Math.PI * 2);
      ctx.fill();
    };
    const vertFade = (z0, z1, fill) => {
      const y0 = Y(z0), y1 = Y(z1);
      for (let y = Math.floor(y0); y < H; y += 2) {
        ctx.globalAlpha = smooth(clamp((y - y0) / (y1 - y0), 0, 1));
        ctx.fillStyle = fill;
        ctx.fillRect(0, y, W, 2);
      }
      ctx.globalAlpha = 1;
    };

    // ---- 地の色（背中は少し濃く、横は明るく、おなかは白）
    ctx.fillStyle = around([belly, pal.base, A.mix(pal.base, '#7A4A08', 0.1)]);
    ctx.fillRect(0, 0, W, H);
    const tailCol = A.mix(st === 'baby' ? A.mix(pal.tail, '#FFFFFF', 0.35) : A.mix(pal.base, '#8A8790', 0.4), lavCol, poly.lav / 100 * 0.45);
    vertFade(-0.8, -1.25, around([A.mix(tailCol, '#FFFFFF', 0.6), tailCol, A.mix(tailCol, '#6E6070', 0.08)]));
    // キャロットテール：しっぽの付け根からオレンジ
    if (poly.carrot > 8) {
      const len = 0.25 + poly.carrot / 100 * 1.7;
      const a = Math.min(1, poly.carrot / 45);
      const cg = ctx.createLinearGradient(0, Y(Z_TAILBASE + 0.1), 0, Y(Z_TAILBASE - len));
      const orange = A.mix('#F07A1E', pal.base, 0.15);
      cg.addColorStop(0, rgba(orange, 0));
      cg.addColorStop(0.12, rgba(orange, 0.95 * a));
      cg.addColorStop(0.7, rgba(orange, 0.75 * a));
      cg.addColorStop(1, rgba(orange, 0));
      ctx.fillStyle = cg;
      ctx.fillRect(0, Y(Z_TAILBASE + 0.1), W, Y(Z_TAILBASE - len) - Y(Z_TAILBASE + 0.1));
    }
    // 頭の上はほんの少し明るく
    const hg = ctx.createLinearGradient(0, 0, 0, Y(1.1));
    hg.addColorStop(0, 'rgba(255,248,225,0.16)');
    hg.addColorStop(1, 'rgba(255,248,225,0)');
    ctx.fillStyle = hg;
    ctx.fillRect(0, 0, W, Y(1.1));

    // ---- しま模様（ベビー）と、おとなに残るうすい帯
    const bandZ = [];
    {
      let z = 1.33 - r() * 0.08;
      const widths = [0.3, 0.36, 0.36, 0.3, 0.28, 0.24, 0.2, 0.18];
      for (let i = 0; i < widths.length && z > -3.3; i++) {
        const w = widths[i] * (0.8 + r() * 0.4);
        bandZ.push([z, z - w]);
        z -= w + (0.28 + r() * 0.16) * (z > Z_TAILBASE ? 1.25 : 0.95);
      }
    }
    const band = (z0, z1, col, alpha, broken) => {
      const y0 = Y(z0), y1 = Y(z1), hgt = y1 - y0;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = col;
      const segs = broken ? 3 + Math.floor(r() * 3) : 1;
      for (let s = 0; s < segs; s++) {
        const ua = broken ? r() : 0, ub = broken ? ua + 0.15 + r() * 0.25 : 1;
        const off = broken ? (r() - 0.5) * hgt : 0;
        ctx.beginPath();
        ctx.moveTo(X(ua), y0 + off);
        for (let u = ua; u <= ub + 1e-6; u += 1 / 24) ctx.lineTo(X(u), y0 + off + (r() - 0.5) * hgt * 0.4);
        for (let u = ub; u >= ua - 1e-6; u -= 1 / 24) ctx.lineTo(X(u), y1 + off + (r() - 0.5) * hgt * 0.4);
        ctx.closePath();
        ctx.fill();
      }
    };
    const jungle = poly.aberrant >= 60, stripe = poly.aberrant >= 82;
    if (pal.pattern) {
      const bandA = st === 'baby' ? 0.95 : st === 'young' ? 0.42 : 0;
      if (bandA > 0) {
        if (stripe && st === 'baby') {
          // ストライプのベビーは、背中の両わきに太いすじ
          for (const u of [0.4, 0.6]) {
            ctx.globalAlpha = bandA;
            ctx.fillStyle = pal.spot;
            ctx.beginPath();
            for (let z = 1.25; z > -3.2; z -= 0.05) ctx.lineTo(X(u + (r() - 0.5) * 0.02 - 0.035), Y(z));
            for (let z = -3.2; z < 1.25; z += 0.05) ctx.lineTo(X(u + (r() - 0.5) * 0.02 + 0.035), Y(z));
            ctx.fill();
          }
        } else {
          for (const [z0, z1] of bandZ) band(z0, z1, pal.spot, bandA, jungle);
        }
      }
      // おとなに残る、ラベンダーがかった帯
      if (st !== 'baby') {
        const la = 0.12 + poly.lav / 100 * 0.45;
        for (const [z0, z1] of bandZ) band(z0 + 0.03, z1 - 0.03, A.mix(pal.base, lavCol, 0.75), la * (z1 > Z_TAILBASE ? 1 : 0.8), jungle);
      }
    } else if (poly.lav > 30) {
      ctx.globalAlpha = poly.lav / 100 * 0.35;
      ctx.fillStyle = around([rgba(lavCol, 0), rgba(lavCol, 0.7), rgba(lavCol, 0.4)]);
      ctx.fillRect(0, Y(1.1), W, H - Y(1.1));
    }

    // ---- ヒョウ柄
    const spotA = !pal.pattern ? 0 : st === 'baby' ? 0 : st === 'young' ? 0.72 : 1;
    if (spotA > 0) {
      const sizeMul = 0.55 + poly.blotch / 100 * 0.85;
      const parts = 1 + Math.floor(poly.blotch / 50);
      const alpha = spotA * (pal.spot === '#A0704A' ? 0.85 : 0.95);
      const drawSpot = (u, z, rw) => {
        if (jungle && !stripe && r() < 0.6) {
          // ジャングル：斑点が不規則につながる
          blob(u, z, rw * 0.9, pal.spot, alpha, r() * Math.PI, 2.4 + r() * 1.5);
          return;
        }
        const C = Math.max(0.35, circumference(z));
        for (let k = 0; k < parts; k++) {
          const du = (r() - 0.5) * rw * 1.5 / C, dz = (r() - 0.5) * rw * 1.5;
          blob(u + du, z + dz, rw * (0.55 + r() * 0.5), pal.spot, alpha, r() * 3);
        }
      };
      const bodyN = poly.spots < 8 ? 0 : Math.round(330 * Math.pow(poly.spots / 60, 1.35) * scale);
      for (let i = 0; i < bodyN; i++) {
        let z;
        if (r() < 0.6 && bandZ.length) {
          const b = bandZ[Math.floor(r() * Math.min(3, bandZ.length))];
          z = (b[0] + b[1]) / 2 + (r() + r() - 1) * 0.2;
        } else z = 1.25 - r() * (1.25 - Z_TAILBASE);
        z = clamp(z, Z_TAILBASE, 1.25);
        let u = 0.5 + (r() + r() - 1) * 0.36;
        if (stripe) u = (r() < 0.5 ? 0.42 : 0.58) + (r() - 0.5) * 0.05;
        const region = (z > 1.0 ? 0.65 : 1) * (Math.abs(u - 0.5) > 0.22 ? 0.72 : 1);
        drawSpot(u, z, (0.03 + r() * 0.045) * sizeMul * region);
      }
      // おとなのしっぽには黒い横帯（斑点が帯状に並ぶ）
      if (!jungle && !stripe) {
        const barN = Math.round(4 + poly.spots / 25);
        for (let k = 0; k < barN; k++) {
          const zc = Z_TAILBASE - 0.25 - k * (2.2 / barN);
          const C = circumference(zc);
          for (let i = 0; i < 16 * scale * (0.4 + poly.spots / 100); i++) {
            drawSpot(0.5 + (r() - 0.5) * 0.7, zc + (r() - 0.5) * 0.12, (0.03 + r() * 0.03) * sizeMul * clamp(C / 2.2, 0.4, 1));
          }
        }
      }
      // しっぽの斑点は、ハイポでも少し残る
      const tailN = Math.round(120 * (0.3 + 0.7 * poly.spots / 100) * scale);
      for (let i = 0; i < tailN; i++) {
        const z = Z_TAILBASE - r() * 2.3;
        const u = 0.5 + (r() + r() - 1) * 0.4;
        drawSpot(u, z, (0.025 + r() * 0.04) * sizeMul * clamp(circumference(z) / 2.8, 0.4, 1));
      }
      // 頭の斑点（少ないとボールディ）
      const headN = poly.head < 10 ? 0 : Math.round(80 * Math.pow(poly.head / 60, 1.2) * scale);
      for (let i = 0; i < headN; i++) {
        const z = 1.3 + r() * 0.82;
        const u = 0.5 + (r() + r() - 1) * 0.3;
        blob(u, z, (0.01 + r() * 0.018) * (0.7 + poly.blotch / 250), pal.spot, alpha, r() * 3);
      }
    }
    // 抱卵中はおなかの横に卵が透ける
    if (look.gravid) {
      for (const u of [0.13, 0.87]) for (const z of [0.15, -0.3]) blob(u, z, 0.16, '#FFE9DC', 0.45);
    }
    // ---- おなかは白く
    const bg = ctx.createLinearGradient(0, 0, W, 0);
    [[0, 0.95], [0.1, 0.85], [0.2, 0], [0.8, 0], [0.9, 0.85], [1, 0.95]].forEach(([p, a]) => bg.addColorStop(p, rgba(belly, a)));
    ctx.globalAlpha = 1;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // 目と口は、3D モデルでは形として彫られているので描かない
    if (!look.model) {
    // ---- 目のまわり：まぶたは明るく、ふちに細い線
    for (const E of EYES) {
      const th = E.side > 0 ? EYE.th : Math.PI - EYE.th;
      const C = circumference(EYE.z);
      const cx = X(thToU(th)), cy = Y(EYE.z);
      const rx = EYE.b / C * W, ry = EYE.a / LEN * H;
      const ring = (k, col, a) => { ctx.globalAlpha = a; ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(cx, cy, rx * k, ry * k, 0, 0, Math.PI * 2); ctx.fill(); };
      ring(1.5, A.mix(pal.base, '#FFF8EA', 0.12), 0.9);
      ring(1.28, A.mix(pal.base, '#FFF8EA', 0.42), 0.95);
      ring(1.08, A.mix(pal.spot, pal.base, 0.35), 0.8);
      ring(0.98, '#3A2E26', 1);
    }

    // ---- くちびると口のライン
    const lineAlong = (thOffset, width, col, alpha) => {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = col;
      ctx.lineCap = 'round';
      for (const side of [1, -1]) {
        const at = z => {
          const th = mouthTh(z) + thOffset;
          return [X(thToU(side > 0 ? th : Math.PI - th)), Y(z)];
        };
        for (let z = MOUTH_BACK; z < MOUTH_FRONT; z += 0.008) {
          const [x0, y0] = at(z), [x1, y1] = at(Math.min(MOUTH_FRONT, z + 0.008));
          ctx.lineWidth = width / Math.max(0.35, circumference(z)) * W;
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.stroke();
        }
        // 鼻先の下を回って反対側へ（横向きの線なので、縦方向の密度で太さを決める）
        const [xe, ye] = at(MOUTH_FRONT);
        ctx.lineWidth = width * H / LEN;
        ctx.beginPath();
        ctx.moveTo(xe, ye);
        ctx.lineTo((side > 0 ? 0 : 1) * W, Y(2.18));
        ctx.stroke();
      }
    };
    lineAlong(0.07, 0.05, A.mix(pal.base, '#FFFDF6', 0.5), 0.75);
    lineAlong(-0.07, 0.04, A.mix(pal.base, '#FFFDF6', 0.65), 0.6);
    lineAlong(0, 0.014, '#2A1F18', 0.85);
    }
    ctx.globalAlpha = 1;
    return c;
  }

  // 突起（ぶつぶつ）とうろこの凹凸。全個体で共通
  const bumpCache = {};
  function bumpTexture(W, H) {
    const key = W + 'x' + H;
    if (bumpCache[key]) return bumpCache[key];
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, W, H);
    const r = prng(99);
    const X = u => u * W, Y = z => zToV(z) * H;
    const dot = (u, z, rw, a, stretch) => {
      const C = Math.max(0.35, circumference(z));
      const rx = rw / C * W * (stretch || 1), ry = rw / LEN * H;
      const x = X(u), y = Y(z);
      const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
      g.addColorStop(0, `rgba(255,255,255,${a})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    };
    const scale = W / 1024;
    // 体のこまかいうろこ
    for (let i = 0; i < 8000 * scale; i++) dot(r(), 1.2 - r() * 4.5, 0.011 + r() * 0.008, 0.35);
    // 頭はさらにこまかい粒
    for (let i = 0; i < 9000 * scale; i++) dot(r(), 1.15 + r() * 1.1, 0.006 + r() * 0.005, 0.4);
    // 背中と横の大きめの突起（頭はうしろ半分だけ）
    for (let i = 0; i < 2400 * scale; i++) {
      const z = 1.55 - r() * 4.7;
      const k = z > 1.2 ? 0.55 : 1;
      dot(0.5 + (r() + r() - 1) * 0.42, z, (0.013 + r() * 0.01) * k * clamp(circumference(z) / 3, 0.45, 1), 0.45);
    }
    // くちびるの大きなうろこ（上あごと下あごに一列ずつ）
    for (const side of [1, -1]) {
      for (const [off, count] of [[0.045, 13], [-0.04, 11]]) {
        for (let k = 0; k < count; k++) {
          const z = MOUTH_BACK + 0.04 + (MOUTH_FRONT - MOUTH_BACK - 0.06) * (k + 0.5) / count;
          const p = profileAt(z);
          const th = mouthTh(z) + off / Math.max(0.2, p.w);
          dot(thToU(side > 0 ? th : Math.PI - th), z, 0.03, 0.75, 0.5);
        }
      }
    }
    // おなかはなめらかに
    const g = ctx.createLinearGradient(0, 0, W, 0);
    [[0, 0.8], [0.14, 0.55], [0.24, 0], [0.76, 0], [0.86, 0.55], [1, 0.8]].forEach(([p, a]) => g.addColorStop(p, `rgba(128,128,128,${a})`));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // 顔（目から前）はなめらかに
    {
      const fg = ctx.createLinearGradient(0, Y(1.62), 0, Y(1.78));
      fg.addColorStop(0, 'rgba(128,128,128,0)');
      fg.addColorStop(1, 'rgba(128,128,128,.65)');
      ctx.fillStyle = fg;
      ctx.fillRect(0, Y(1.62), W, Y(Z_NOSE) - Y(1.62) + 2);
    }
    // 鼻先・しっぽの先は輪切りが細く集まるので、凹凸を消す
    for (const [z0, z1] of [[Z_NOSE, 2.1], [Z_TAIL, -3.2]]) {
      const tg = ctx.createLinearGradient(0, Y(z0), 0, Y(z1));
      tg.addColorStop(0, 'rgba(128,128,128,1)');
      tg.addColorStop(1, 'rgba(128,128,128,0)');
      ctx.fillStyle = tg;
      ctx.fillRect(0, Math.min(Y(z0), Y(z1)), W, Math.abs(Y(z1) - Y(z0)));
    }
    bumpCache[key] = canvasTexture(c);
    return bumpCache[key];
  }
  function limbCanvas(pal, look, col) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = col;
    ctx.fillRect(0, 0, 128, 128);
    const poly = Object.assign({}, DEFAULT_POLY, look.poly || {});
    if (pal.pattern && look.stage !== 'baby' && poly.spots >= 8) {
      const r = prng((look.seed || 1) + 41);
      ctx.fillStyle = pal.spot;
      ctx.globalAlpha = look.stage === 'young' ? 0.6 : 0.85;
      const n = Math.round(9 * poly.spots / 60);
      for (let i = 0; i < n; i++) {
        ctx.beginPath();
        ctx.arc(r() * 128, r() * 128, (2.5 + r() * 4) * (0.6 + poly.blotch / 100), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    return c;
  }
  // つやの差：おなかと顔はなめらか、背中はややマット（緑チャンネルが roughness）
  let roughTex = null;
  function roughTexture() {
    if (roughTex) return roughTex;
    const c = document.createElement('canvas');
    c.width = 256; c.height = 384;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 256, 0);
    [[0, 175], [0.18, 185], [0.3, 235], [0.5, 255], [0.7, 235], [0.82, 185], [1, 175]].forEach(([p, v]) => g.addColorStop(p, `rgb(${v},${v},${v})`));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 384);
    const fg = ctx.createLinearGradient(0, 0, 0, zToV(1.5) * 384);
    fg.addColorStop(0, 'rgba(170,170,170,.9)');
    fg.addColorStop(1, 'rgba(170,170,170,0)');
    ctx.fillStyle = fg;
    ctx.fillRect(0, 0, 256, zToV(1.5) * 384);
    roughTex = canvasTexture(c);
    return roughTex;
  }
  let granuleTex = null;
  function granules() {
    if (granuleTex) return granuleTex;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 128, 128);
    const r = prng(5);
    for (let i = 0; i < 260; i++) {
      const x = r() * 128, y = r() * 128, rr = 2 + r() * 3;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rr);
      g.addColorStop(0, 'rgba(255,255,255,.7)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
    granuleTex = canvasTexture(c, { repeat: 3 });
    return granuleTex;
  }

  /* 目の模様。球の正面（+Z）が中心、上が +Y。
   * レオパの虹彩は銀灰色に黒い網目。瞳は縦長でふちが波打つ（夜は丸く開く）。 */
  function irisCanvas(pal, dilated, seed) {
    const W = 1024, H = 512, cx = W / 2, cy = H / 2;
    const R = 175; // 見えている虹彩の半径（px）
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const r = prng(17 + (seed || 0));
    const g = ctx.createRadialGradient(cx, cy, 8, cx, cy, R * 1.25);
    if (pal.solid) {
      g.addColorStop(0, A.mix(pal.eye, '#FFFFFF', 0.08));
      g.addColorStop(0.75, pal.eye);
      g.addColorStop(1, A.mix(pal.eye, '#000000', 0.4));
    } else {
      g.addColorStop(0, A.mix(pal.eye, '#FFF4D8', 0.45));
      g.addColorStop(0.3, A.mix(pal.eye, '#FFFFFF', 0.28));
      g.addColorStop(0.7, pal.eye);
      g.addColorStop(1, A.mix(pal.eye, '#000000', 0.3));
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    if (!pal.solid) {
      // 放射状の細い筋
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 360; i++) {
        const a = r() * Math.PI * 2, d0 = 20 + r() * 40, d1 = d0 + 30 + r() * 120;
        ctx.strokeStyle = r() < 0.5 ? 'rgba(255,255,255,.14)' : 'rgba(0,0,0,.12)';
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * d0, cy + Math.sin(a) * d0);
        ctx.lineTo(cx + Math.cos(a) * d1, cy + Math.sin(a) * d1);
        ctx.stroke();
      }
      // 黒い網目（点をつないだ網）
      const pts = Array.from({ length: 420 }, () => { const a = r() * Math.PI * 2, d = 22 + Math.sqrt(r()) * (R - 10); return [cx + Math.cos(a) * d, cy + Math.sin(a) * d]; });
      ctx.strokeStyle = A.mix(pal.eye, '#000000', 0.7);
      ctx.lineCap = 'round';
      for (const p of pts) {
        const near = [];
        for (const q of pts) { const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d > 0 && d <= 38) near.push([q, d]); }
        near.sort((a, b) => a[1] - b[1]);
        near.length = Math.min(near.length, 2 + Math.floor(r() * 2));
        for (const [q, d] of near) {
          if (d > 38) continue;
          ctx.globalAlpha = 0.3 + r() * 0.35;
          ctx.lineWidth = 0.9 + r() * 1.6;
          ctx.beginPath();
          ctx.moveTo(p[0], p[1]);
          ctx.quadraticCurveTo((p[0] + q[0]) / 2 + (r() - 0.5) * 12, (p[1] + q[1]) / 2 + (r() - 0.5) * 12, q[0], q[1]);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      // ふちの暗い輪
      const rg = ctx.createRadialGradient(cx, cy, R * 0.82, cx, cy, R * 1.1);
      rg.addColorStop(0, 'rgba(0,0,0,0)');
      rg.addColorStop(1, 'rgba(20,16,12,.55)');
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, W, H);
      // 瞳（ふちが波打つ縦長）
      const hw = dilated ? 58 : 15, hh = R * 0.93;
      ctx.fillStyle = A.mix(pal.eye, '#FFE9B0', 0.35);
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.ellipse(cx, cy, hw + 7, hh + 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = pal.pupil;
      ctx.beginPath();
      for (let k = 0; k <= 80; k++) {
        const t = k / 80 * Math.PI * 2;
        const y = Math.sin(t);
        const wav = dilated ? 1 : 1 + 0.35 * Math.pow(Math.cos(y * 7.5), 2) - 0.25;
        const x = cx + Math.cos(t) * hw * wav * Math.pow(1 - y * y, 0.15);
        if (k === 0) ctx.moveTo(x, cy + y * hh); else ctx.lineTo(x, cy + y * hh);
      }
      ctx.fill();
    } else {
      // 真っ黒な目にも、奥にうっすら模様
      ctx.strokeStyle = 'rgba(255,255,255,.05)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 120; i++) {
        const a = r() * Math.PI * 2, d = 30 + r() * (R - 30);
        ctx.beginPath();
        ctx.arc(cx, cy, d, a, a + 0.3);
        ctx.stroke();
      }
    }
    return c;
  }

  // ======================================================
  // レオパのモデル
  // ======================================================
  function phys(color, extra) { return new T.MeshPhysicalMaterial(Object.assign({ color, roughness: 0.6 }, extra)); }
  function taper(rA, rB, L, seg) {
    const g = new T.CylinderGeometry(rB, rA, L, seg || 14, 1, true);
    g.translate(0, L / 2, 0);
    return g;
  }
  function basisQuat(E) {
    return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(E.e1, E.e2, E.n));
  }

  /* look: { genes, tang, poly, seed, stage, gravid, shed }  quality: 'high' | 'photo' */
  function buildGecko(look, quality) {
    if (MODEL.geo) return buildGeckoGLB(look, quality);
    const pal = A.colors(look.genes, look.tang, look.stage);
    const hi = quality !== 'photo';
    const W = hi ? 1024 : 768, H = hi ? 1536 : 1152;
    const colorTex = canvasTexture(skinCanvas(pal, look, W, H), { srgb: true });
    const owned = [colorTex];
    const shed = !!look.shed;
    const skinMat = phys('#ffffff', {
      map: colorTex, bumpMap: bumpTexture(W, H), bumpScale: 0.0065,
      roughnessMap: roughTexture(), roughness: shed ? 0.95 : 0.62,
      clearcoat: shed ? 0 : 0.12, clearcoatRoughness: 0.6, skinning: true,
      // ごく弱い透け感（光が皮ふの中で少し散る感じ）
      emissive: new T.Color('#ffffff'), emissiveMap: colorTex, emissiveIntensity: 0.07,
      sheen: new T.Color('#3a2a18'),
    });
    const limbCol = A.mix(pal.base, '#FFF9EF', 0.06);
    const limbTex = canvasTexture(limbCanvas(pal, look, limbCol), { srgb: true, repeat: 2 });
    owned.push(limbTex);
    const limbMat = phys('#ffffff', { map: limbTex, bumpMap: granules(), bumpScale: 0.005, roughness: 0.6, clearcoat: shed ? 0 : 0.1, emissive: new T.Color('#ffffff'), emissiveMap: limbTex, emissiveIntensity: 0.07 });
    const toeMat = phys(A.mix(limbCol, '#F3D9C8', 0.18), { roughness: 0.55 });
    const lidMat = phys(A.mix(pal.base, '#FFF8EA', 0.08), { roughness: 0.55, bumpMap: granules(), bumpScale: 0.003, side: T.DoubleSide });
    if (shed) for (const m of [skinMat, limbMat, lidMat]) { m.emissive = new T.Color('#FFFFFF'); m.emissiveMap = null; m.emissiveIntensity = 0.22; }

    const rootG = new T.Group();
    const bones = {};
    const boneList = BONES.map(([name, , parent]) => {
      const b = new T.Bone();
      b.name = name;
      const w = boneWorld(name);
      b.position.copy(w.sub(parent ? boneWorld(parent) : V(0, 0, 0)));
      if (parent) bones[parent].add(b);
      bones[name] = b;
      return b;
    });
    const mesh = new T.SkinnedMesh(bodyGeometry(!!look.gravid, hi), skinMat);
    mesh.add(bones.mid);
    mesh.updateMatrixWorld(true);
    mesh.bind(new T.Skeleton(boneList));
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    rootG.add(mesh);

    const HW = boneWorld('head');
    const toHead = p => p.clone().sub(HW);

    // ---- 目（頭に彫ったくぼみにはめこむ）とまぶた
    const eyeTex = [canvasTexture(irisCanvas(pal, false, look.seed % 7), { srgb: true }), canvasTexture(irisCanvas(pal, true, look.seed % 7), { srgb: true })];
    owned.push(...eyeTex);
    const eyeMat = phys('#ffffff', { map: eyeTex[0], roughness: shed ? 0.5 : 0.3, clearcoat: 1, clearcoatRoughness: shed ? 0.6 : 0.04 });
    const corneaMat = phys('#ffffff', { transparent: true, opacity: shed ? 0.35 : 0.1, roughness: shed ? 0.5 : 0, clearcoat: 1, clearcoatRoughness: 0, envMapIntensity: 1.6, depthWrite: false });
    const glintMat = new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85 });
    if (shed) { eyeMat.emissive = new T.Color('#9FA7B0'); eyeMat.emissiveIntensity = 0.25; }
    const eyeGeo = new T.SphereGeometry(EYE.r, 64, 40);
    eyeGeo.rotateY(-Math.PI / 2);
    const lidR = EYE.r * 1.03;
    const lids = [];
    for (const E of EYES) {
      const eg = new T.Group();
      eg.position.copy(toHead(E.C));
      eg.quaternion.copy(basisQuat(E));
      bones.head.add(eg);
      eg.add(new T.Mesh(eyeGeo, eyeMat));
      eg.add(new T.Mesh(new T.SphereGeometry(EYE.r * 1.012, 48, 32), corneaMat));
      const glint = new T.Mesh(new T.SphereGeometry(1, 12, 8), glintMat);
      glint.position.set(-0.04 * E.side, 0.06, Math.sqrt(EYE.r * EYE.r - 0.0052) + 0.003);
      glint.scale.set(0.016, 0.012, 0.004);
      eg.add(glint);
      const mk = upper => {
        const m = new T.Mesh(new T.SphereGeometry(lidR, 48, 16, 0, Math.PI * 2, upper ? 0 : Math.PI / 2, Math.PI / 2), lidMat);
        eg.add(m);
        return m;
      };
      lids.push({ up: mk(true), lo: mk(false) });
    }

    // ---- 耳の穴・鼻の穴
    const holeMat = phys('#221A14', { roughness: 0.35, clearcoat: 0.4 });
    for (const s of EARS) {
      const ear = new T.Mesh(new T.SphereGeometry(1, 20, 12), holeMat);
      ear.position.copy(toHead(s.p.clone().addScaledVector(s.n, -0.03)));
      ear.scale.set(0.028, 0.042, 0.012);
      ear.quaternion.setFromRotationMatrix(new T.Matrix4().lookAt(s.n, V(0, 0, 0), V(0, 1, 0)));
      bones.head.add(ear);
    }
    for (const s of NOSTRILS) {
      const nos = new T.Mesh(new T.SphereGeometry(1, 12, 8), holeMat);
      nos.position.copy(toHead(s.p.clone().addScaledVector(s.n, 0.011)));
      nos.scale.set(0.014, 0.01, 0.006);
      nos.quaternion.setFromRotationMatrix(new T.Matrix4().lookAt(s.n, V(0, 0, 0), V(0, 1, 0)));
      bones.head.add(nos);
    }

    // ---- 舌（太くて先が丸いピンク）
    const tongue = new T.Mesh(new T.SphereGeometry(1, 24, 14), phys('#E36F86', { roughness: 0.28, clearcoat: 0.7 }));
    tongue.scale.set(0.001, 0.001, 0.001);
    const tongueBase = toHead(V(0, profileAt(2.13).y - 0.03, 2.1));
    tongue.position.copy(tongueBase);
    bones.head.add(tongue);
    const mouth = new T.Object3D();
    mouth.position.copy(toHead(V(0, profileAt(2.15).y - 0.03, 2.18)));
    bones.head.add(mouth);

    // ---- 脚（左前・右前・右後ろ・左後ろ）
    const legs = [];
    for (const [side, front] of [[-1, true], [1, true], [1, false], [-1, false]]) {
      legs.push(buildLeg(side, front, front ? bones.chest : bones.hip, limbMat, toeMat));
    }
    legs[0].phaseOff = 0; legs[2].phaseOff = 0;
    legs[1].phaseOff = Math.PI; legs[3].phaseOff = Math.PI;

    rootG.traverse(o => { if (o.isMesh && o !== mesh) o.castShadow = true; });
    // 頭の小物の影が顔に落ちると黒いくまに見えるので、影は落とさない
    bones.head.traverse(o => { if (o.isMesh) o.castShadow = false; });
    const gk = { root: rootG, mesh, bones, eyeMat, eyeTex, lids, tongue, tongueBase, mouth, legs, midY: bones.mid.position.y, owned, dilated: false };
    pose(gk, restPose());
    return gk;
  }

  function buildLeg(side, front, bone, mat, toeMat) {
    const cfg = front
      ? { z: 0.86, x: 0.42, y: 0.42, Lu: 0.3, Lf: 0.36, r0: 0.13, r1: 0.092, r2: 0.07, rest: 0.4, droop: 0.3, toe: [-70, -36, -4, 26, 56], len: [0.1, 0.15, 0.17, 0.16, 0.12], yaw: 0.2 }
      : { z: -0.62, x: 0.44, y: 0.41, Lu: 0.34, Lf: 0.38, r0: 0.165, r1: 0.105, r2: 0.075, rest: -0.45, droop: 0.28, toe: [-58, -24, 8, 38, 68], len: [0.11, 0.16, 0.2, 0.21, 0.15], yaw: 0.55 };
    const BW = boneWorld(bone.name);
    const shoulder = new T.Group();
    shoulder.position.copy(V(side * cfg.x, cfg.y, cfg.z).sub(BW));
    bone.add(shoulder);
    const upper = new T.Group();
    shoulder.add(upper);
    const ug = taper(cfg.r0, cfg.r1 * 1.12, cfg.Lu);
    ug.rotateZ(-side * Math.PI / 2);
    upper.add(new T.Mesh(ug, mat));
    upper.add(new T.Mesh(new T.SphereGeometry(cfg.r0, 16, 12), mat));
    const elbow = new T.Group();
    elbow.position.set(side * cfg.Lu, 0, 0);
    upper.add(elbow);
    elbow.add(new T.Mesh(new T.SphereGeometry(cfg.r1 * 1.15, 16, 12), mat));
    const fg = taper(cfg.r1 * 1.12, cfg.r2 * 1.1, cfg.Lf);
    fg.rotateZ(Math.PI);
    elbow.add(new T.Mesh(fg, mat));
    const wrist = new T.Group();
    wrist.position.set(0, -cfg.Lf, 0);
    elbow.add(wrist);
    const palm = new T.Mesh(new T.SphereGeometry(1, 16, 10), mat);
    palm.scale.set(cfg.r2 * 1.7, cfg.r2 * 0.85, cfg.r2 * 1.6);
    wrist.add(palm);
    cfg.toe.forEach((deg, i) => {
      const phi = side * (cfg.yaw + deg * Math.PI / 180);
      const L = cfg.len[i];
      const tg = taper(0.034, 0.022, L, 10);
      tg.rotateX(Math.PI / 2);
      const toe = new T.Mesh(tg, mat);
      toe.rotation.order = 'YXZ';
      toe.rotation.y = phi;
      toe.rotation.x = 0.1 + (i % 2) * 0.05;
      toe.position.set(Math.sin(phi) * 0.03, -0.012, Math.cos(phi) * 0.03);
      const tip = new T.Mesh(new T.SphereGeometry(0.026, 10, 8), toeMat);
      tip.position.set(0, 0, L);
      toe.add(tip);
      wrist.add(toe);
    });
    // 左右対称すぎないように、置き方を少しずらす
    return { shoulder, upper, elbow, wrist, side, front, rest: cfg.rest + side * (front ? 0.07 : -0.05), droop: cfg.droop + (side > 0 ? 0.03 : 0), Lu: cfg.Lu, Lf: cfg.Lf, phaseOff: 0 };
  }

  function restPose() {
    return { t: 0, phase: 0, walk: 0, look: 0, pitch: 0, tilt: 0, curl: 0, stalk: 0, happy: 0, drop: 0.04, blink: 0, tongue: 0, breathe: 0, sway: 0 };
  }

  // まぶた：開いているときは、ふちが皮ふの下にかくれる角度まで引っこむ
  const LID_OPEN = 1.1, LID_SHUT_UP = 0.06, LID_SHUT_LO = -0.02;
  const _p = new T.Vector3();
  function pose(gk, P) {
    if (gk.glb) return poseGLB(gk, P);
    const B = gk.bones;
    const s = Math.sin(P.phase);
    B.mid.position.y = gk.midY - P.drop + P.walk * Math.abs(Math.cos(P.phase)) * 0.025;
    // 歩くときは体を S 字にくねらせる
    B.chest.rotation.y = -0.2 * s * P.walk;
    B.hip.rotation.y = 0.22 * s * P.walk;
    B.neck.rotation.y = 0.17 * s * P.walk + P.look * 0.45;
    B.head.rotation.y = P.look * 0.55;
    // ふだんは首をすこし上げて、頭を持ち上げている
    B.neck.rotation.x = P.pitch * 0.5 - 0.08;
    B.head.rotation.x = P.pitch * 0.5 - 0.06;
    B.head.rotation.z = P.tilt;
    B.chest.scale.x = 1 + P.breathe * 0.03;
    B.chest.scale.y = 1 + P.breathe * 0.02;
    ['t1', 't2', 't3', 't4', 't5', 't6'].forEach((n, i) => {
      const b = B[n];
      b.rotation.y = P.curl * (0.3 + 0.03 * i)
        + 0.15 * Math.sin(P.phase - (i + 1) * 0.9) * P.walk
        + 0.06 * Math.sin(P.t * 1.2 - i * 0.7) * (1 - P.walk) * P.sway
        + (i >= 3 ? 0.14 * Math.sin(P.t * 30 - i * 1.3) * P.stalk : 0)
        + 0.3 * Math.sin(P.t * 9 - i * 0.8) * P.happy * (i / 5);
      b.rotation.x = i >= 3 ? -0.08 * P.stalk : 0;
    });
    for (const l of gk.lids) {
      l.up.rotation.x = lerp(-LID_OPEN, LID_SHUT_UP, P.blink);
      l.lo.rotation.x = lerp(LID_OPEN, LID_SHUT_LO, Math.min(1, P.blink * 1.1));
    }
    // ぺろっ
    const tg = P.tongue;
    if (tg > 0.01) {
      gk.tongue.scale.set(0.06, 0.024, 0.05 + 0.08 * tg);
      gk.tongue.position.set(gk.tongueBase.x, gk.tongueBase.y + 0.025 * Math.sin(tg * Math.PI), gk.tongueBase.z + 0.1 * tg);
      gk.tongue.rotation.x = -0.5 * tg;
    } else gk.tongue.scale.set(0.001, 0.001, 0.001);

    // 脚：振り出し → 足先が地面につくように、ひじの開きを計算
    gk.root.updateMatrixWorld(true);
    for (const L of gk.legs) {
      const ph = P.phase + L.phaseOff;
      const swing = L.rest + 0.42 * Math.cos(ph) * P.walk;
      const lift = Math.max(0, -Math.sin(ph)) * P.walk;
      const up = L.side * (lift * 0.35 - L.droop);
      L.upper.rotation.y = -L.side * swing;
      L.upper.rotation.z = up;
      L.shoulder.getWorldPosition(_p);
      gk.root.worldToLocal(_p);
      const elbowY = _p.y - L.Lu * Math.sin(L.droop - lift * 0.35);
      const target = 0.03 + lift * 0.09;
      const tilt = Math.acos(clamp((elbowY - target) / L.Lf, -1, 1));
      L.elbow.rotation.z = -up + L.side * tilt;
      L.wrist.rotation.z = -L.side * tilt;
      L.wrist.rotation.y = L.side * swing * 0.8;
    }
  }

  function setPupil(gk, dilated) {
    if (gk.dilated === dilated) return;
    gk.dilated = dilated;
    gk.eyeMat.map = gk.eyeTex[dilated ? 1 : 0];
    gk.eyeMat.needsUpdate = true;
  }

  function disposeGecko(gk) {
    gk.root.traverse(o => {
      if (o.geometry && o.geometry !== MODEL.geo) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    gk.owned.forEach(t => t.dispose());
  }
  function disposeTree(obj) {
    obj.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
    });
  }
  function lookKey(look) {
    const p = look.poly || {};
    return [MODEL.geo ? 'm' : 'p', look.genes.snow, look.genes.alb, look.genes.ecl, look.genes.bliz, look.tang, p.spots, p.blotch, p.head, p.carrot, p.lav, p.aberrant, look.seed, look.stage, !!look.gravid, !!look.shed].join('|');
  }

  // ======================================================
  // 3D モデル（GLB）を使うレオパ
  // 形だけのモデルに、遺伝で決まる模様を体の流れに沿って巻きつけ、
  // 光る眼球とまぶたをはめこむ。骨組みがないので、動きは描画の中で形を曲げて付ける。
  // ======================================================
  const MODEL = { geo: null, eyes: null, ready: null };
  // モデルの座標 → ゲームの座標（鼻先 z≈2.19、しっぽの先 z≈-3.4、足の裏 y=0）
  const MS = 2.95, MZ = -0.6, MY = 0.148;
  const toGame = (x, y, z) => V(x * MS, (y + MY) * MS, z * MS + MZ);
  // 目じるしの位置をそろえて、模様の置き場所を元のモデルと合わせる
  const CANON = [[2.19, 2.195], [1.775, 1.83], [1.02, 1.26], [-1.485, -0.92], [-3.4, -3.36]];
  function canonZ(z) {
    if (z >= CANON[0][0]) return CANON[0][1];
    for (let i = 0; i < CANON.length - 1; i++) {
      const [a0, b0] = CANON[i], [a1, b1] = CANON[i + 1];
      if (z <= a0 && z >= a1) return lerp(b0, b1, (a0 - z) / (a0 - a1));
    }
    return CANON[CANON.length - 1][1];
  }

  function parseGLB(buf) {
    const dv = new DataView(buf);
    const jlen = dv.getUint32(12, true);
    const j = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jlen)));
    const bin = 20 + jlen + 8;
    const acc = i => {
      const a = j.accessors[i], bv = j.bufferViews[a.bufferView];
      const off = bin + (bv.byteOffset || 0) + (a.byteOffset || 0);
      const n = a.count * ({ SCALAR: 1, VEC2: 2, VEC3: 3 })[a.type];
      const T2 = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array }[a.componentType];
      return new T2(buf.slice(off, off + n * T2.BYTES_PER_ELEMENT));
    };
    const p = j.meshes[0].primitives[0];
    return { pos: acc(p.attributes.POSITION), idx: acc(p.indices) };
  }

  function prepareModel(buf) {
    const { pos, idx } = parseGLB(buf);
    const n = pos.length / 3;
    // 脚の見分け：前脚・後ろ脚のあたりで、体の外や下に出ている部分
    const legOf = (x, y, z) => {
      const out = Math.abs(x) > 0.135 || y < -0.085;
      if (z > 0.3 && z < 0.56 && out) return x < 0 ? 1 : 2;
      if (z > -0.33 && z < -0.04 && out) return x > 0 ? 4 : 3;
      return 0;
    };
    const PIV = { 1: [-0.12, 0, 0.43], 2: [0.12, 0, 0.43], 3: [-0.13, -0.01, -0.18], 4: [0.13, -0.01, -0.18] };
    // 体の中心の高さ（輪切りごと）
    const BIN = 0.025, bins = {};
    for (let i = 0; i < n; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      if (legOf(x, y, z)) continue;
      const k = Math.round(z / BIN);
      const b = bins[k] || (bins[k] = [Infinity, -Infinity]);
      b[0] = Math.min(b[0], y); b[1] = Math.max(b[1], y);
    }
    const centerY = z => {
      const k = Math.round(z / BIN);
      for (let d = 0; d < 8; d++) for (const kk of [k - d, k + d]) if (bins[kk]) return (bins[kk][0] + bins[kk][1]) / 2;
      return 0;
    };
    const g = new T.BufferGeometry();
    const P = new Float32Array(n * 3), UV = new Float32Array(n * 2), LEG = new Float32Array(n), PV = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      const q = toGame(x, y, z);
      P.set([q.x, q.y, q.z], i * 3);
      const leg = legOf(x, y, z);
      // 脚は体の横と同じ色・模様にする（おなかの白にならないように）
      const th = leg ? (x > 0 ? 0.35 : Math.PI - 0.35) + (y + 0.05) * 3 * (x > 0 ? 1 : -1) : Math.atan2(y - centerY(z), x);
      UV[i * 2] = thToU(th);
      UV[i * 2 + 1] = zToV(canonZ(q.z));
      LEG[i] = leg;
      if (leg) { const pv = toGame(...PIV[leg]); PV.set([pv.x, pv.y, pv.z], i * 3); }
    }
    g.setAttribute('position', new T.BufferAttribute(P, 3));
    g.setAttribute('uv', new T.BufferAttribute(UV, 2));
    g.setAttribute('aLeg', new T.BufferAttribute(LEG, 1));
    g.setAttribute('aPivot', new T.BufferAttribute(PV, 3));
    g.setIndex(new T.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    // おなか側の継ぎ目（u が 1→0 に戻るところ）で模様が伸びないように、三角形ごとに u をそろえる
    const geo = g.toNonIndexed();
    const uv = geo.attributes.uv;
    for (let t = 0; t < uv.count; t += 3) {
      const u = [uv.getX(t), uv.getX(t + 1), uv.getX(t + 2)];
      if (Math.max(...u) - Math.min(...u) > 0.5) for (let k = 0; k < 3; k++) if (u[k] < 0.5) uv.setX(t + k, u[k] + 1);
    }
    MODEL.geo = geo;
    // 目：左右それぞれ、モデルの目の盛り上がりを測って眼球を合わせる（左右で形が少しちがうため）
    const ER = 0.034;
    // モデルの目の盛り上がりから、眼球をどれだけ外へ出すか（モデルの左右差に合わせて別々に）
    const EYE_OUT = { 1: root.LEOPA_EYE_OUT_R ?? 0.014, '-1': root.LEOPA_EYE_OUT_L ?? 0.018 };
    MODEL.eyes = [[1, 0.805, 0.057], [-1, 0.8, 0.056]].map(([side, z0, y0]) => {
      let n = 0, cz = 0, cy = 0, tip = 0;
      for (let i = 0; i < pos.length / 3; i++) {
        const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
        if (x * side < 0.05) continue;
        if (Math.hypot((z - z0) / 0.033, (y - y0) / 0.022) > 0.6) continue;
        n++; cz += z; cy += y; tip = Math.max(tip, Math.abs(x));
      }
      cz /= n || 1; cy /= n || 1;
      return { side, C: toGame(side * (tip + EYE_OUT[side] - ER), cy, cz), dir: V(side, 0.25, 0.3).normalize() };
    });
    MODEL.eyeR = ER * MS;
    MODEL.mouth = toGame(0, -0.03, 0.93);
    MODEL.head = toGame(0, 0.03, 0.78);
    MODEL.neck = toGame(0, 0.03, 0.58);
    MODEL.mid = toGame(0, 0.03, 0.1);
    MODEL.tailTip = toGame(0, -0.13, -0.93);
  }

  // 形の曲げ方（描画側 GLSL と、眼球などの位置合わせ用 JS で同じ式を使う）
  const DEFORM_GLSL = `
    uniform float uT, uPhase, uWalk, uLook, uPitch, uTilt, uCurl, uStalk, uHappy, uBreathe, uDrop;
    attribute float aLeg;
    attribute vec3 aPivot;
    vec3 rotY(vec3 q, float a) { float c = cos(a), s = sin(a); return vec3(c * q.x + s * q.z, q.y, -s * q.x + c * q.z); }
    vec3 rotX(vec3 q, float a) { float c = cos(a), s = sin(a); return vec3(q.x, c * q.y - s * q.z, s * q.y + c * q.z); }
    vec3 rotZ(vec3 q, float a) { float c = cos(a), s = sin(a); return vec3(c * q.x - s * q.y, s * q.x + c * q.y, q.z); }
    vec3 leoDeform(vec3 p) {
      if (aLeg > 0.5) {
        float off = (aLeg < 1.5 || aLeg > 3.5) ? 0.0 : 3.14159;
        float ph = uPhase + off;
        float fr = aLeg < 2.5 ? 1.0 : -1.0;
        vec3 q = rotY(p - aPivot, -0.45 * cos(ph) * uWalk * sign(aPivot.x) * fr);
        float reach = clamp(length(q.xz) / 0.6, 0.0, 1.0);
        q.y += max(0.0, -sin(ph)) * uWalk * 0.12 * reach;
        p = aPivot + q;
      }
      float hz = smoothstep(0.98, 1.3, p.z);
      if (hz > 0.0) {
        vec3 pv = vec3(0.0, 0.42, 1.08);
        vec3 q = rotZ(rotX(rotY(p - pv, uLook * 0.6 * hz), uPitch * hz), uTilt * hz);
        p = pv + q;
      }
      float body = 1.0 - smoothstep(0.8, 1.35, p.z);
      float w = uWalk * 0.16 * sin(uPhase - p.z * 1.4) * (0.4 + 0.6 * smoothstep(1.2, -1.5, p.z)) * body;
      float tt = clamp((-1.4 - p.z) / 2.0, 0.0, 1.0);
      w += tt * tt * (uCurl * 1.4 + 0.12 * sin(uT * 1.2 - p.z * 1.5) * (1.0 - uWalk) + uHappy * 0.3 * sin(uT * 9.0 - p.z * 2.0));
      w += step(0.55, tt) * uStalk * 0.06 * sin(uT * 28.0 - p.z * 4.0);
      p.x += w;
      if (aLeg < 0.5) p.x *= 1.0 + uBreathe * 0.025 * smoothstep(1.2, 0.8, p.z) * smoothstep(-1.6, -1.1, p.z);
      p.y -= uDrop;
      return p;
    }`;
  function deformPoint(p, U) {
    const q = p.clone();
    const hz = smooth(clamp((q.z - 0.98) / 0.32, 0, 1));
    if (hz > 0) {
      const pv = V(0, 0.42, 1.08);
      q.sub(pv).applyEuler(new T.Euler(U.uPitch.value * hz, U.uLook.value * 0.6 * hz, U.uTilt.value * hz, 'ZXY')).add(pv);
    }
    const body = 1 - smooth(clamp((q.z - 0.8) / 0.55, 0, 1));
    let w = U.uWalk.value * 0.16 * Math.sin(U.uPhase.value - q.z * 1.4) * (0.4 + 0.6 * smooth(clamp((1.2 - q.z) / 2.7, 0, 1))) * body;
    const tt = clamp((-1.4 - q.z) / 2, 0, 1);
    w += tt * tt * (U.uCurl.value * 1.4 + 0.12 * Math.sin(U.uT.value * 1.2 - q.z * 1.5) * (1 - U.uWalk.value) + U.uHappy.value * 0.3 * Math.sin(U.uT.value * 9 - q.z * 2));
    q.x += w;
    q.y -= U.uDrop.value;
    return q;
  }
  function deformMaterial(mat, U) {
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\n' + DEFORM_GLSL)
        .replace('#include <begin_vertex>', 'vec3 transformed = leoDeform(vec3(position));');
    };
    return mat;
  }

  // よく使う絵（模様・目）を、使った順に一定数だけ覚えておく
  const skinCache = new Map(), irisCache = new Map();
  function cachedTex(cache, key, make, limit) {
    if (cache.has(key)) { const t = cache.get(key); cache.delete(key); cache.set(key, t); return t; }
    const t = make();
    cache.set(key, t);
    while (cache.size > limit) { const [k, old] = cache.entries().next().value; cache.delete(k); old.dispose(); }
    return t;
  }
  function buildGeckoGLB(look, quality) {
    const pal = A.colors(look.genes, look.tang, look.stage);
    const hi = quality !== 'photo';
    const W = hi ? 1024 : 768, H = hi ? 1536 : 1152;
    // 描いた模様は覚えておき、同じ子に切りかえたときは描き直さない
    const colorTex = cachedTex(skinCache, 'skin|' + W + '|' + lookKey(look), () => canvasTexture(skinCanvas(pal, Object.assign({}, look, { model: true }), W, H), { srgb: true }), 8);
    colorTex.wrapS = T.RepeatWrapping;
    const bump = bumpTexture(W, H);
    bump.wrapS = T.RepeatWrapping;
    const rough = roughTexture();
    rough.wrapS = T.RepeatWrapping;
    const shed = !!look.shed;
    const U = {};
    for (const k of ['uT', 'uPhase', 'uWalk', 'uLook', 'uPitch', 'uTilt', 'uCurl', 'uStalk', 'uHappy', 'uBreathe', 'uDrop']) U[k] = { value: 0 };
    const skinMat = deformMaterial(phys('#ffffff', {
      map: colorTex, bumpMap: bump, bumpScale: 0.006, roughnessMap: rough, roughness: shed ? 0.95 : 0.6,
      clearcoat: shed ? 0 : 0.12, clearcoatRoughness: 0.6,
      emissive: new T.Color('#ffffff'), emissiveMap: shed ? null : colorTex, emissiveIntensity: shed ? 0.22 : 0.07,
      sheen: new T.Color('#3a2a18'),
    }), U);
    const mesh = new T.Mesh(MODEL.geo, skinMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.customDepthMaterial = deformMaterial(new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking }), U);
    const rootG = new T.Group();
    rootG.add(mesh);

    // 目：虹彩＋濡れた角膜＋キャッチライト、まばたき用のまぶた
    const eyeKey = [pal.eye, pal.pupil, pal.solid, (look.seed || 0) % 7].join('|');
    const eyeTex = [false, true].map(d => cachedTex(irisCache, eyeKey + '|' + d, () => canvasTexture(irisCanvas(pal, d, (look.seed || 0) % 7), { srgb: true }), 24));
    const eyeMat = phys('#ffffff', { map: eyeTex[0], roughness: shed ? 0.5 : 0.3, clearcoat: 1, clearcoatRoughness: shed ? 0.6 : 0.04 });
    const corneaMat = phys('#ffffff', { transparent: true, opacity: shed ? 0.35 : 0.1, roughness: shed ? 0.5 : 0, clearcoat: 1, clearcoatRoughness: 0, envMapIntensity: 1.6, depthWrite: false });
    const glintMat = new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85 });
    const R = MODEL.eyeR;
    const eyeGeo = new T.SphereGeometry(R, 48, 32);
    eyeGeo.rotateY(-Math.PI / 2);
    const eyes = [], lids = [];
    for (const E of MODEL.eyes) {
      const eg = new T.Group();
      const baseQ = new T.Quaternion().setFromRotationMatrix(new T.Matrix4().lookAt(E.dir, V(0, 0, 0), V(0, 1, 0)));
      eg.add(new T.Mesh(eyeGeo, eyeMat));
      eg.add(new T.Mesh(new T.SphereGeometry(R * 1.012, 40, 24), corneaMat));
      const glint = new T.Mesh(new T.SphereGeometry(1, 12, 8), glintMat);
      glint.position.set(-0.25 * R * E.side, 0.35 * R, R * 0.93);
      glint.scale.set(0.1 * R, 0.075 * R, 0.03 * R);
      eg.add(glint);
      rootG.add(eg);
      eyes.push({ g: eg, C: E.C, baseQ });
    }
    // タップや視点合わせに使う、頭・首・胴・口の目じるし
    const mark = () => { const o = new T.Object3D(); rootG.add(o); return o; };
    const bones = { head: mark(), neck: mark(), mid: mark(), tail: mark() };
    const mouth = mark();
    // 舌（ぺろっ）
    const tongue = new T.Mesh(new T.SphereGeometry(1, 20, 12), phys('#E36F86', { roughness: 0.28, clearcoat: 0.7 }));
    tongue.scale.setScalar(0.001);
    rootG.add(tongue);
    rootG.traverse(o => { if (o.isMesh && o !== mesh) o.castShadow = false; });
    const gk = {
      glb: true, root: rootG, mesh, U, eyes, lids, eyeMat, eyeTex, bones, mouth, legs: [],
      owned: [], dilated: false, tongue,
    };
    pose(gk, restPose());
    return gk;
  }

  function poseGLB(gk, P) {
    const U = gk.U;
    U.uT.value = P.t; U.uPhase.value = P.phase; U.uWalk.value = P.walk; U.uLook.value = P.look;
    U.uPitch.value = P.pitch - 0.05; U.uTilt.value = P.tilt; U.uCurl.value = Math.min(P.curl, 1) * 0.9; U.uStalk.value = P.stalk;
    U.uHappy.value = P.happy; U.uBreathe.value = P.breathe; U.uDrop.value = P.drop - 0.04;
    const hz = 1;
    const headQ = new T.Quaternion().setFromEuler(new T.Euler(U.uPitch.value * hz, U.uLook.value * 0.6 * hz, U.uTilt.value * hz, 'ZXY'));
    for (const e of gk.eyes) {
      e.g.position.copy(deformPoint(e.C, U));
      e.g.quaternion.copy(headQ).multiply(e.baseQ);
    }
    // モデルにまぶたの形があるので、まばたきは眼球を縦につぶして表す
    for (const e of gk.eyes) e.g.scale.y = lerp(1, 0.12, P.blink);
    gk.bones.head.position.copy(deformPoint(MODEL.head, U));
    gk.bones.neck.position.copy(deformPoint(MODEL.neck, U));
    gk.bones.mid.position.copy(deformPoint(MODEL.mid, U));
    gk.mouth.position.copy(deformPoint(MODEL.mouth, U));
    const tg = P.tongue;
    if (tg > 0.01) {
      const fwd = new T.Vector3(0, -0.25, 1).applyQuaternion(headQ).normalize();
      gk.tongue.position.copy(gk.mouth.position).addScaledVector(fwd, 0.06 + 0.14 * tg);
      gk.tongue.quaternion.copy(headQ);
      gk.tongue.rotateX(0.35 - 0.6 * tg);
      gk.tongue.scale.set(0.065, 0.026, 0.05 + 0.1 * tg);
    } else gk.tongue.scale.setScalar(0.001);
    gk.bones.tail.position.copy(deformPoint(MODEL.tailTip, U));
  }

  function loadModel(url) {
    if (!MODEL.ready) {
      // ページに埋めこまれたモデル（1枚にまとめた試遊版）があれば、それを使う
      const embedded = root.LEOPA_MODEL_B64
        ? Promise.resolve(Uint8Array.from(atob(root.LEOPA_MODEL_B64), c => c.charCodeAt(0)).buffer)
        : null;
      MODEL.ready = (embedded || fetch(url).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }))
        .then(buf => { prepareModel(buf); photoCache.clear(); return true; })
        .catch(() => false);
    }
    return MODEL.ready;
  }

  // ======================================================
  // 光の映りこみ（環境マップ）
  // ======================================================
  function makeEnvironment(renderer) {
    const env = new T.Scene();
    const sky = new T.Mesh(new T.SphereGeometry(20, 32, 16), new T.MeshBasicMaterial({ side: T.BackSide, vertexColors: true }));
    const cols = [];
    const pos = sky.geometry.attributes.position;
    const top = new T.Color('#FFF7EA').multiplyScalar(0.55), mid = new T.Color('#D9CDB6').multiplyScalar(0.45), bot = new T.Color('#8A7658').multiplyScalar(0.4);
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 20;
      const c = y > 0 ? mid.clone().lerp(top, y) : mid.clone().lerp(bot, -y);
      cols.push(c.r, c.g, c.b);
    }
    sky.geometry.setAttribute('color', new T.Float32BufferAttribute(cols, 3));
    env.add(sky);
    // 窓とライトの映りこみ（目がきらっとする）
    const panel = (w, h, x, y, z, c) => {
      const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: c, side: T.DoubleSide }));
      m.position.set(x, y, z);
      m.lookAt(0, 0, 0);
      env.add(m);
    };
    panel(7, 4.5, -4, 12, 8, new T.Color(2.4, 2.3, 2.1));
    panel(4, 4, 10, 6, -2, new T.Color(1.2, 0.85, 0.5));
    panel(5, 2.5, 0, 4, 14, new T.Color(0.6, 0.6, 0.6));
    const pm = new T.PMREMGenerator(renderer);
    const tex = pm.fromScene(env, 0.02).texture;
    pm.dispose();
    return tex;
  }

  // ======================================================
  // えさ・フン・ケースの小物
  // ======================================================
  function buildFood(kind) {
    const g = new T.Group();
    if (kind === 'cricket') {
      const brown = phys('#7A4E26', { roughness: 0.4, clearcoat: 0.3 }), dark = phys('#4F3217', { roughness: 0.5 });
      const b = new T.Mesh(new T.SphereGeometry(0.13, 16, 12), brown); b.scale.set(1, 0.8, 1.9); b.position.y = 0.12; g.add(b);
      const h = new T.Mesh(new T.SphereGeometry(0.09, 14, 10), dark); h.position.set(0, 0.14, 0.24); g.add(h);
      for (const s of [-1, 1]) {
        const leg = new T.Mesh(new T.CylinderGeometry(0.02, 0.015, 0.42, 6), dark);
        leg.position.set(s * 0.13, 0.13, -0.1); leg.rotation.set(0.9, 0, s * 0.5); g.add(leg);
        const ant = new T.Mesh(new T.CylinderGeometry(0.006, 0.006, 0.5, 4), dark);
        ant.position.set(s * 0.06, 0.2, 0.47); ant.rotation.set(1.2, 0, s * 0.35); g.add(ant);
      }
    } else if (kind === 'dubia') {
      const b = new T.Mesh(new T.SphereGeometry(0.2, 18, 12), phys('#4E2F1A', { roughness: 0.3, clearcoat: 0.5 }));
      b.scale.set(1, 0.4, 1.3); b.position.y = 0.08; g.add(b);
    } else {
      const m = phys('#D2A34A', { roughness: 0.35, clearcoat: 0.4 });
      for (let i = 0; i < 7; i++) {
        const s = new T.Mesh(new T.SphereGeometry(0.065, 12, 8), m);
        s.scale.set(1, 0.95, 1.25);
        s.position.set(0, 0.065, (i - 3) * 0.09);
        g.add(s);
      }
    }
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return g;
  }
  function buildPoop() {
    const g = new T.Group();
    const p = new T.Mesh(new T.SphereGeometry(0.13, 14, 10), phys('#4A3524', { roughness: 0.85 }));
    p.scale.set(1, 0.8, 1.7); p.position.y = 0.1;
    const u = new T.Mesh(new T.SphereGeometry(0.08, 12, 8), phys('#F4F1E8', { roughness: 0.7 }));
    u.scale.set(1, 0.9, 1); u.position.set(0, 0.08, 0.28);
    g.add(p, u);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return g;
  }
  function sandCanvas() {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 768;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, c.width, 0);
    g.addColorStop(0, '#E2CDA2'); g.addColorStop(0.6, '#E4C999'); g.addColorStop(1, '#EABD86');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, c.width, c.height);
    const r = prng(7);
    for (let i = 0; i < 26000; i++) {
      const v = r();
      ctx.fillStyle = v < 0.45 ? 'rgba(120,90,50,.2)' : v < 0.9 ? 'rgba(255,255,255,.3)' : 'rgba(90,70,40,.35)';
      const s = 1 + r() * 2.2;
      ctx.fillRect(r() * c.width, r() * c.height, s, s);
    }
    return c;
  }
  function rockGeometry() {
    const g = new T.IcosahedronGeometry(1, 4);
    const p = g.attributes.position;
    const r = prng(31);
    const bumps = Array.from({ length: 9 }, () => ({ d: V(r() - 0.5, r() - 0.5, r() - 0.5).normalize(), a: 0.08 + r() * 0.12 }));
    const v = new T.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const n = v.clone().normalize();
      let k = 1;
      for (const b of bumps) k += b.a * Math.pow(Math.max(0, n.dot(b.d)), 3);
      k += Math.sin(n.x * 9) * Math.sin(n.y * 11) * Math.sin(n.z * 7) * 0.03;
      v.copy(n.multiplyScalar(k));
      if (v.y < -0.1) v.y = -0.1;
      p.setXYZ(i, v.x, v.y, v.z);
    }
    // 面ごとの法線だと角ばるので、中心からの向きで近似してなめらかに
    const nr = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).normalize();
      nr.setXYZ(i, v.x, v.y, v.z);
    }
    return g;
  }
  function buildPlant() {
    const g = new T.Group();
    const mat = phys('#7FA38E', { roughness: 0.5, clearcoat: 0.3 });
    const tipMat = phys('#C98C95', { roughness: 0.5 });
    [[8, 0.42, 0.9, 0], [7, 0.3, 0.6, 0.4], [5, 0.18, 0.25, 0.1]].forEach(([n, len, tiltOut, off]) => {
      for (let i = 0; i < n; i++) {
        const leaf = new T.Group();
        leaf.rotation.order = 'YXZ';
        leaf.rotation.y = i / n * Math.PI * 2 + off;
        leaf.rotation.x = -tiltOut;
        const m = new T.Mesh(new T.SphereGeometry(1, 14, 10), mat);
        m.scale.set(0.11, 0.045, len / 2);
        m.position.z = len / 2;
        const tip = new T.Mesh(new T.SphereGeometry(0.025, 8, 6), tipMat);
        tip.position.z = len * 0.98;
        leaf.add(m, tip);
        leaf.position.y = 0.08;
        g.add(leaf);
      }
    });
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return g;
  }
  function gradientCanvasTexture(stops) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    stops.forEach(([p, col]) => g.addColorStop(p, col));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    return new T.CanvasTexture(c);
  }

  // ======================================================
  // インテリア（ケースに置ける家具）
  // 原点が中心、+Z が正面（シェルターの入口）。r は当たり判定の半径。
  // ======================================================
  let sandTexCache = null;
  function sandTex() {
    if (!sandTexCache) { sandTexCache = canvasTexture(sandCanvas(), { srgb: true }); sandTexCache.flipY = true; }
    return sandTexCache;
  }
  function doorMesh(w, h) {
    const m = new T.Mesh(new T.CircleGeometry(0.62, 32), new T.MeshBasicMaterial({
      map: gradientCanvasTexture([[0, 'rgba(18,14,10,1)'], [0.7, 'rgba(30,24,18,.95)'], [1, 'rgba(30,24,18,0)']]), transparent: true, depthWrite: false,
    }));
    m.scale.set(w, h, 1);
    return m;
  }
  const DECOR = {
    rock: {
      name: '岩シェルター', price: 60, r: 1.45, shelter: { x: 0.25, z: 2.75 },
      desc: '中にもぐって眠れる。定番のかくれ家',
      build() {
        const g = new T.Group();
        const rock = new T.Mesh(rockGeometry(), phys('#6E6358', { roughness: 0.95, bumpMap: sandTex(), bumpScale: 0.03 }));
        rock.scale.set(1.75, 1.0, 1.4);
        rock.position.y = 0.1;
        const door = doorMesh(1.15, 0.78);
        door.position.set(0.25, 0.36, 1.37);
        door.rotation.x = -0.3;
        g.add(rock, door);
        return g;
      },
    },
    wet: {
      name: 'ウェットシェルター', price: 80, r: 1.15, shelter: { x: 0, z: 2.35 },
      desc: '上に水をためて中をしっとり。脱皮の味方',
      build() {
        const g = new T.Group();
        const dome = new T.Mesh(new T.SphereGeometry(1.05, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), phys('#8E9A94', { roughness: 0.4, clearcoat: 0.5 }));
        dome.scale.set(1, 0.72, 1);
        const pool = new T.Mesh(new T.CircleGeometry(0.42, 32), phys('#6FAECB', { roughness: 0.02, clearcoat: 1 }));
        pool.rotation.x = -Math.PI / 2;
        pool.position.y = 0.745;
        const door = doorMesh(0.75, 0.62);
        door.position.set(0, 0.3, 1.0);
        door.rotation.x = -0.2;
        g.add(dome, pool, door);
        return g;
      },
    },
    cork: {
      name: 'コルクバーク', price: 50, r: 1.2, shelter: { x: 0, z: 2.3 },
      desc: '木の皮のトンネル。自然な雰囲気に',
      build() {
        const g = new T.Group();
        // 半分に割った筒を、入口が正面（+Z）に来るように寝かせる
        const geo = new T.CylinderGeometry(0.8, 0.8, 2.3, 32, 1, true, -Math.PI / 2, Math.PI);
        geo.rotateX(-Math.PI / 2);
        const bark = new T.Mesh(geo, phys('#6B4A30', { roughness: 0.95, bumpMap: sandTex(), bumpScale: 0.08, side: T.DoubleSide }));
        g.add(bark);
        const door = doorMesh(1.0, 0.95);
        door.position.set(0, 0.3, 1.1);
        g.add(door);
        return g;
      },
    },
    log: {
      name: '流木', price: 40, r: 1.1,
      desc: '白っぽい流木。ケースの主役に',
      build() {
        const g = new T.Group();
        const m = phys('#B9A58D', { roughness: 0.9, bumpMap: sandTex(), bumpScale: 0.05 });
        const main = new T.Mesh(new T.CylinderGeometry(0.16, 0.24, 2.3, 12), m);
        main.rotation.set(0, 0, Math.PI / 2 - 0.12);
        main.position.y = 0.22;
        const br = new T.Mesh(new T.CylinderGeometry(0.08, 0.13, 1.0, 10), m);
        br.position.set(0.35, 0.45, 0.25);
        br.rotation.set(0.6, 0, -0.9);
        g.add(main, br);
        return g;
      },
    },
    stone: {
      name: '平たい石', price: 30, r: 0.85,
      desc: 'ひなたぼっこ用の石。ホット側にどうぞ',
      build() {
        const s = new T.Mesh(rockGeometry(), phys('#8C857C', { roughness: 0.85, bumpMap: sandTex(), bumpScale: 0.03 }));
        s.scale.set(0.95, 0.22, 0.75);
        return s;
      },
    },
    plant: {
      name: '多肉植物', price: 25, r: 0.55,
      desc: '小さなエケベリア。ケースに彩りを',
      build: () => buildPlant(),
    },
    dish: {
      name: '水入れ', price: 20, r: 0.95,
      desc: 'いつでも新鮮なお水を',
      build() {
        const g = new T.Group();
        const dish = new T.Mesh(new T.CylinderGeometry(0.85, 0.78, 0.28, 40), phys('#E8E1D2', { roughness: 0.35, clearcoat: 0.6 }));
        dish.position.y = 0.14;
        const water = new T.Mesh(new T.CircleGeometry(0.7, 40), phys('#6FAECB', { roughness: 0.02, clearcoat: 1, transparent: true, opacity: 0.85 }));
        water.rotation.x = -Math.PI / 2;
        water.position.y = 0.285;
        g.add(dish, water);
        return g;
      },
    },
  };
  const DEFAULT_DECOR = [{ t: 'rock', x: -4.4, z: -3.0, rot: 0 }, { t: 'dish', x: -5.0, z: 3.2, rot: 0 }, { t: 'plant', x: 1.8, z: -3.8, rot: 0 }];
  // ケースの広さ（床の半分の幅・奥行き）
  const TANK = { hw: 6.5, hd: 4.5 };

  // ======================================================
  // ケース
  // ======================================================
  function createTank(container, handlers) {
    const renderer = new T.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 2));
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    const fxBox = document.createElement('div');
    fxBox.className = 'fx3d';
    container.appendChild(fxBox);
    const camBtn = document.createElement('button');
    camBtn.type = 'button';
    camBtn.className = 'cam-btn';
    container.appendChild(camBtn);

    const scene = new T.Scene();
    scene.environment = makeEnvironment(renderer);
    const camera = new T.PerspectiveCamera(34, 4 / 3, 0.1, 100);
    const HOME = { pos: V(0, 7.6, 12.6), look: V(0, 0.2, -0.4) };
    camera.position.copy(HOME.pos);
    const camLook = HOME.look.clone();
    camera.lookAt(camLook);

    const hemi = new T.HemisphereLight('#FFF6E4', '#9C8A6A', 0.3);
    const sun = new T.DirectionalLight('#FFF4E6', 1.0);
    sun.position.set(-3, 10, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 8, bottom: -8, near: 1, far: 34 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 5;
    const heat = new T.PointLight('#FFB060', 0.8, 9, 1.6);
    heat.position.set(5.8, 3, -1);
    const rim = new T.DirectionalLight('#DDE8FF', 0.35);
    rim.position.set(2, 4, -8);
    scene.add(hemi, sun, heat, rim);
    // ケースの外：木のテーブルと部屋の壁
    let wall = null, windowG = null, windowGlass = null, sunPatch = null;
    // 夜につける、部屋のスタンドライト
    const lamp = new T.PointLight('#FFC98A', 0, 26, 1.4);
    lamp.position.set(-7, 7, 5);
    scene.add(lamp);
    {
      const c = document.createElement('canvas');
      c.width = 512; c.height = 256;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#A57A52';
      ctx.fillRect(0, 0, 512, 256);
      const r = prng(3);
      for (let i = 0; i < 90; i++) {
        ctx.strokeStyle = `rgba(${r() < 0.5 ? '90,55,30' : '200,160,120'},${0.12 + r() * 0.18})`;
        ctx.lineWidth = 1 + r() * 3;
        const y = r() * 256;
        ctx.beginPath(); ctx.moveTo(0, y);
        for (let x = 0; x <= 512; x += 32) ctx.lineTo(x, y + Math.sin(x / 60 + i) * 4);
        ctx.stroke();
      }
      const wood = new T.CanvasTexture(c);
      wood.encoding = T.sRGBEncoding;
      wood.wrapS = wood.wrapT = T.RepeatWrapping;
      wood.repeat.set(3, 2);
      const table = new T.Mesh(new T.PlaneGeometry(60, 40), phys('#ffffff', { map: wood, roughness: 0.55, clearcoat: 0.3 }));
      table.rotation.x = -Math.PI / 2;
      table.position.y = -0.02;
      table.receiveShadow = true;
      wall = new T.Mesh(new T.PlaneGeometry(80, 30), phys('#E9E4D8', { roughness: 0.95 }));
      wall.position.set(0, 12, -9);
      scene.add(table, wall);
      // 奥の壁の窓（昼は明るく、夜は暗い夜空）
      windowG = new T.Group();
      const frameM = phys('#F4EFE4', { roughness: 0.6 });
      windowGlass = new T.Mesh(new T.PlaneGeometry(7, 5), new T.MeshBasicMaterial({ color: '#CFE6F5' }));
      windowGlass.position.z = 0.01;
      windowG.add(windowGlass);
      for (const [x, y, w, h] of [[0, 2.6, 7.4, 0.3], [0, -2.6, 7.4, 0.3], [-3.6, 0, 0.3, 5.5], [3.6, 0, 0.3, 5.5], [0, 0, 0.18, 5], [0, 0, 7, 0.18]]) {
        const f = new T.Mesh(new T.BoxGeometry(w, h, 0.2), frameM);
        f.position.set(x, y, 0.1);
        windowG.add(f);
      }
      windowG.position.set(-4.5, 2.5, -8.95);
      windowG.scale.setScalar(0.6);
      scene.add(windowG);
      // テーブルに落ちる日だまり
      sunPatch = new T.Mesh(new T.PlaneGeometry(9, 5), new T.MeshBasicMaterial({ map: gradientCanvasTexture([[0, 'rgba(255,236,190,.55)'], [0.7, 'rgba(255,236,190,.25)'], [1, 'rgba(255,236,190,0)']]), transparent: true, depthWrite: false }));
      sunPatch.rotation.x = -Math.PI / 2;
      sunPatch.position.set(-4, 0.005, -6.6);
      scene.add(sunPatch);
      // テーブルの小物：鉢植えと本
      const pot = new T.Group();
      const potM = new T.Mesh(new T.CylinderGeometry(0.8, 0.6, 1.3, 28), phys('#C9825A', { roughness: 0.8 }));
      potM.position.y = 0.65;
      const soil = new T.Mesh(new T.CircleGeometry(0.75, 24), phys('#4A3526', { roughness: 1 }));
      soil.rotation.x = -Math.PI / 2; soil.position.y = 1.25;
      pot.add(potM, soil);
      const leafM = phys('#5E8C5A', { roughness: 0.6, side: T.DoubleSide });
      for (let i = 0; i < 9; i++) {
        const leaf = new T.Mesh(new T.SphereGeometry(1, 12, 8), leafM);
        leaf.scale.set(0.22, 0.05, 1.1);
        const a = i / 9 * Math.PI * 2;
        leaf.position.set(Math.sin(a) * 0.5, 1.9 + (i % 3) * 0.25, Math.cos(a) * 0.5);
        leaf.rotation.set(-0.9 + (i % 2) * 0.2, a, 0);
        pot.add(leaf);
      }
      pot.position.set(7.6, 0, -6.2);
      pot.traverse(o => { if (o.isMesh) o.castShadow = true; });
      const books = new T.Group();
      [['#6B8FA3', 0.35], ['#C7A56A', 0.3], ['#8E6B8F', 0.28]].forEach(([c, h], i) => {
        const b = new T.Mesh(new T.BoxGeometry(2.4 - i * 0.2, h, 1.7 - i * 0.1), phys(c, { roughness: 0.8 }));
        b.position.y = [0, 0.35, 0.65][i] + h / 2;
        b.rotation.y = (i - 1) * 0.12;
        b.castShadow = true;
        books.add(b);
      });
      books.position.set(-7.6, 0, 5.4);
      books.rotation.y = 0.4;
      scene.add(pot, books);
    }

    // 床（ホット側がほんのり暖色）
    const sand = canvasTexture(sandCanvas(), { srgb: true });
    sand.flipY = true;
    const floor = new T.Mesh(new T.PlaneGeometry(TANK.hw * 2, TANK.hd * 2), phys('#ffffff', { map: sand, bumpMap: sand, bumpScale: 0.012, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    // ガラスと枠（手前は低くして中が見えるように）
    const glass = phys('#D5E4DD', { transparent: true, opacity: 0.28, roughness: 0.05, clearcoat: 1 });
    const frame = phys('#2F3431', { roughness: 0.4 });
    const frontGlass = [];
    for (const [x, z, w, d, h] of [[0, -TANK.hd - 0.1, TANK.hw * 2 + 0.3, 0.1, 2.2], [-TANK.hw - 0.1, 0, 0.1, TANK.hd * 2 + 0.2, 2.2], [TANK.hw + 0.1, 0, 0.1, TANK.hd * 2 + 0.2, 2.2], [0, TANK.hd + 0.1, TANK.hw * 2 + 0.3, 0.1, 0.5]]) {
      const m = new T.Mesh(new T.BoxGeometry(w, h, d), glass);
      m.position.set(x, h / 2, z);
      scene.add(m);
      const f = new T.Mesh(new T.BoxGeometry(w + 0.12, 0.1, d + 0.12), frame);
      f.position.set(x, h, z);
      scene.add(f);
      if (z > 0) frontGlass.push(m, f);
    }
    // 家具（ケースごとに差しかえる）
    const decorG = new T.Group();
    scene.add(decorG);
    // 汚れ
    const dirt = new T.Group();
    const dirtMat = new T.MeshBasicMaterial({ color: '#6E5434', transparent: true, opacity: 0.3, depthWrite: false });
    for (const [x, z, r] of [[-1.5, 1.6, 0.35], [1.8, -0.8, 0.25], [0.4, 2.6, 0.3], [2.9, 1.9, 0.22]]) {
      const d = new T.Mesh(new T.CircleGeometry(r, 20), dirtMat);
      d.rotation.x = -Math.PI / 2;
      d.position.set(x, 0.01, z);
      dirt.add(d);
    }
    dirt.visible = false;
    scene.add(dirt);
    // 足もとのやわらかい影
    const blob = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({
      map: gradientCanvasTexture([[0, 'rgba(40,25,10,.5)'], [1, 'rgba(40,25,10,0)']]), transparent: true, depthWrite: false,
    }));
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.012;
    scene.add(blob);

    const BOUNDS = { x: TANK.hw - 0.7, zMin: -TANK.hd + 0.6, zMax: TANK.hd - 0.5 };
    let HIDE = null;
    let obstacles = [];
    let decorKey = '';
    let edit = null; // もようがえ中なら { sel }
    const ring = new T.Mesh(new T.RingGeometry(0.9, 1, 48), new T.MeshBasicMaterial({ color: '#FFC94A', transparent: true, opacity: 0.9, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    ring.visible = false;
    scene.add(ring);
    const contactMat = new T.MeshBasicMaterial({ map: gradientCanvasTexture([[0, 'rgba(40,25,10,.35)'], [0.6, 'rgba(40,25,10,.12)'], [1, 'rgba(40,25,10,0)']]), transparent: true, depthWrite: false });
    function setDecor(list) {
      const key = JSON.stringify(list || []);
      if (key === decorKey) return;
      decorKey = key;
      while (decorG.children.length) { const c = decorG.children.pop(); disposeTree(c); }
      obstacles = [];
      HIDE = null;
      (list || []).forEach((d, i) => {
        const def = DECOR[d.t];
        if (!def) return;
        const o = def.build();
        o.position.set(d.x, 0, d.z);
        o.rotation.y = d.rot || 0;
        o.userData.index = i;
        o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.userData.index = i; } });
        decorG.add(o);
        const sh = new T.Mesh(new T.PlaneGeometry(1, 1), contactMat);
        sh.rotation.x = -Math.PI / 2;
        sh.position.set(d.x, 0.006, d.z);
        sh.scale.setScalar(def.r * 2.6);
        decorG.add(sh);
        const ob = { x: d.x, z: d.z, r: def.r, i, t: d.t };
        if (def.shelter && !HIDE) {
          const c = Math.cos(d.rot || 0), s2 = Math.sin(d.rot || 0);
          const sx = d.x + def.shelter.x * c + def.shelter.z * s2, sz = d.z - def.shelter.x * s2 + def.shelter.z * c;
          HIDE = { x: sx, z: sz, face: (d.rot || 0) + Math.PI, ob };
        }
        obstacles.push(ob);
      });
      showSel();
    }
    function showSel() {
      const d = edit && edit.sel != null ? obstacles.find(o => o.i === edit.sel) : null;
      ring.visible = !!d;
      if (d) { ring.position.x = d.x; ring.position.z = d.z; ring.scale.setScalar(d.r + 0.15); }
    }
    function setEdit(e) { edit = e; if (e) setClose(false); showSel(); }
    // 家具にめりこまないように、体にそって押し出す
    function resolveObstacles() {
      const S = 0.95 * st.size;
      for (let it = 0; it < 3; it++) {
        for (const o of obstacles) {
          if (HIDE && o === HIDE.ob && (st.sleeping || st.mode === 'toHide')) continue;
          for (const k of [1.25, 0.45, -0.4, -1.3]) {
            const px = st.x + Math.sin(st.yaw) * k * S, pz = st.z + Math.cos(st.yaw) * k * S;
            const dx = px - o.x, dz = pz - o.z, d = Math.hypot(dx, dz) || 0.001;
            const min = o.r + 0.32 * S * (k < -1 ? 0.6 : 1);
            if (d < min) { st.x += dx / d * (min - d); st.z += dz / d * (min - d); }
          }
        }
      }
    }
    const freeAt = (x, z, pad) => obstacles.every(o => Math.hypot(x - o.x, z - o.z) > o.r + pad);
    function freePoint(pad, xa, xb, za, zb) {
      for (let k = 0; k < 40; k++) { const x = rand(xa, xb), z = rand(za, zb); if (freeAt(x, z, pad)) return { x, z }; }
      return { x: rand(xa, xb), z: rand(za, zb) };
    }
    const POOP_SPOTS = [[5.4, -3.8], [4.95, -4.0], [5.55, -3.35]];

    const st = {
      gk: null, id: null, key: '', size: 1, x: 0.5, z: 0.8, yaw: 0.4,
      mode: 'idle', wait: 1, target: null, sleeping: false, zzz: 0,
      foods: [], poops: [], t: 0, phase: 0, walkW: 0, blinkT: 2, blinkV: 0,
      lick: 0, happy: 0, chomp: 0, stalk: 0, look: 0, tiltT: 0, active: true, night: false,
      drop: 0.04, curl: 0, pitch: 0,
      heatGlow: 1, heatPref: 0,
      close: false, orbit: 0.55, elev: 0.3, zoom: 1,
    };
    const P = restPose();

    function resize() {
      const w = container.clientWidth, h = container.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    if (root.ResizeObserver) new ResizeObserver(resize).observe(container);
    resize();

    function setClose(on) {
      st.close = on;
      camBtn.textContent = on ? 'ぜんたい' : 'アップで見る';
      camBtn.setAttribute('aria-pressed', String(on));
      container.classList.toggle('closeup', on);
    }
    camBtn.addEventListener('click', e => { e.stopPropagation(); setClose(!st.close); });
    setClose(false);

    function setGecko(look) {
      if (!look) {
        if (st.gk) { scene.remove(st.gk.root); disposeGecko(st.gk); }
        st.gk = null; st.id = null; st.key = '';
        blob.visible = false;
        return;
      }
      const key = lookKey(look);
      if (look.id !== st.id) {
        Object.assign(st, { x: rand(-1.5, 2), z: rand(-0.5, 1.5), yaw: rand(-1, 1), mode: 'idle', wait: 1, sleeping: false, stalk: 0 });
      }
      st.size = look.size;
      if (key !== st.key || look.id !== st.id) {
        if (st.gk) { scene.remove(st.gk.root); disposeGecko(st.gk); }
        st.gk = buildGecko(look, 'high');
        setPupil(st.gk, st.night);
        scene.add(st.gk.root);
        st.key = key;
      }
      st.id = look.id;
      st.gk.root.scale.setScalar(0.95 * st.size);
      blob.visible = true;
    }

    function spawnFood(kind) {
      const obj = buildFood(kind);
      let x, z;
      let tries = 0;
      do { x = rand(-TANK.hw + 2, TANK.hw - 1.5); z = rand(-TANK.hd + 1.4, TANK.hd - 1); tries++; } while ((Math.hypot(x - st.x, z - st.z) < 3 || !freeAt(x, z, 0.4)) && tries < 60);
      obj.position.set(x, 0, z);
      obj.rotation.y = rand(0, 6.28);
      scene.add(obj);
      st.foods.push({ kind, obj, t: rand(0.4, 1), hop: null });
      if (st.sleeping) wake();
    }
    function takeFoods() {
      const kinds = st.foods.map(f => f.kind);
      st.foods.forEach(f => { scene.remove(f.obj); disposeTree(f.obj); });
      st.foods = [];
      return kinds;
    }
    function setPoops(n) {
      while (st.poops.length > n) { const p = st.poops.pop(); scene.remove(p); disposeTree(p); }
      while (st.poops.length < n) {
        const p = buildPoop();
        const [x, z] = POOP_SPOTS[st.poops.length % POOP_SPOTS.length];
        p.position.set(x, 0, z);
        p.rotation.y = rand(0, 6.28);
        scene.add(p);
        st.poops.push(p);
      }
    }
    // 部屋の明かり：時刻（朝・昼・夕方・夜）と季節で、光の色と強さが変わる
    const C = h => new T.Color(h);
    const SEASON_SKY = { spring: '#FFEFF1', summer: '#FFFBE6', autumn: '#FFE6C4', winter: '#E6EEFF' };
    let clockKey = '';
    function setClock(hour, season) {
      const key = hour.toFixed(2) + season;
      if (key === clockKey) return;
      clockKey = key;
      const ramp = (a, b, x) => clamp((x - a) / (b - a), 0, 1);
      const day = ramp(5, 7.5, hour) * (1 - ramp(17, 19.5, hour));       // 昼の明るさ
      const dusk = Math.exp(-Math.pow((hour - 17.6) / 1.2, 2));          // 夕焼け
      const dawn = Math.exp(-Math.pow((hour - 6.2) / 0.9, 2));           // 朝焼け
      const night = 1 - day;
      const night2 = night > 0.5;
      if (st.gk) setPupil(st.gk, night2);
      st.night = night2;
      const sunCol = C('#AFC0FF').lerp(C('#FFF4E6'), day).lerp(C('#FF9450'), dusk * 0.85).lerp(C('#FFB8A0'), dawn * 0.5);
      sun.color.copy(sunCol);
      sun.intensity = 0.3 + 0.75 * day;
      // 夕方は日ざしが横から入る
      sun.position.set(-3 - 6 * dusk + 4 * dawn, 10 - 5 * (dusk + dawn), 5);
      hemi.color.copy(C('#A9B8FF').lerp(C(SEASON_SKY[season] || '#FFF6E4'), day));
      hemi.intensity = 0.12 + 0.2 * day;
      lamp.intensity = night * 0.95;
      heat.intensity = (0.8 + 0.2 * night) * st.heatGlow;
      renderer.toneMappingExposure = 0.78 + 0.18 * day;
      const bg = C('#1B2130').lerp(C('#DCE6DE'), day).lerp(C('#F2C9A0'), dusk * 0.45);
      scene.background = bg;
      if (windowGlass) windowGlass.material.color.copy(C('#1E2640').lerp(C('#CFE6F5'), day).lerp(C('#F7B98A'), dusk * 0.7).lerp(C('#F4C7C0'), dawn * 0.4));
      if (sunPatch) { sunPatch.visible = day > 0.05; sunPatch.material.opacity = day; sunPatch.position.x = -4 - 3 * dusk + 3 * dawn; }
      if (wall) wall.material.color.copy(C('#5A5470').lerp(C('#E9E4D8'), day).lerp(C('#F2B48A'), dusk * 0.65));
    }
    function setNight(on) { setClock(on ? 22 : 13, 'summer'); }
    // 今のケースを写真に撮る（アルバム用。小さめの JPEG）
    function snapshot() {
      renderer.render(scene, camera);
      const src = renderer.domElement;
      const w = 480, h = Math.round(w * src.height / src.width);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(src, 0, 0, w, h);
      return c.toDataURL('image/jpeg', 0.72);
    }
    function setDirty(on) { dirt.visible = on; }
    function wake() {
      if (!st.sleeping) return;
      st.sleeping = false;
      st.mode = 'idle';
      st.wait = 0.8;
    }

    function screenPos(obj) {
      const p = new T.Vector3();
      obj.getWorldPosition(p);
      p.y += 0.5;
      p.project(camera);
      return { x: (p.x + 1) / 2 * 100, y: (1 - p.y) / 2 * 100 };
    }
    function fx(text, cls) {
      if (!st.gk) return;
      const pos = screenPos(st.gk.bones.head);
      const s = document.createElement('span');
      s.className = 'fx-item ' + (cls || '');
      s.textContent = text;
      s.style.left = (pos.x + rand(-4, 4)) + '%';
      s.style.top = pos.y + '%';
      fxBox.appendChild(s);
      setTimeout(() => s.remove(), 1400);
    }
    function hearts(n) { for (let i = 0; i < n; i++) setTimeout(() => fx('♥', 'heart'), i * 220); }

    // タップとドラッグ（アップのときは指で回して見られる）
    const ray = new T.Raycaster();
    let down = null;
    const el = renderer.domElement;
    const touches = new Map();
    let pinch = 0;
    el.addEventListener('wheel', e => {
      if (!st.close) return;
      e.preventDefault();
      st.zoom = clamp(st.zoom * Math.exp(e.deltaY * 0.0015), 0.45, 1.6);
    }, { passive: false });
    el.addEventListener('pointerdown', e => {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) { const [a, b] = [...touches.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); }
      down = { lx: e.clientX, ly: e.clientY, moved: 0 };
      if (st.close) { try { el.setPointerCapture(e.pointerId); } catch (err) { /* noop */ } }
    });
    el.addEventListener('pointermove', e => {
      if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2 && st.close) {
        const [a, b] = [...touches.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch > 0) st.zoom = clamp(st.zoom * pinch / d, 0.45, 1.6);
        pinch = d;
        if (down) down.moved = 99;
        return;
      }
      if (!down) return;
      const dx = e.clientX - down.lx, dy = e.clientY - down.ly;
      down.lx = e.clientX; down.ly = e.clientY;
      down.moved += Math.abs(dx) + Math.abs(dy);
      if (st.close) {
        st.orbit -= dx * 0.012;
        st.elev = clamp(st.elev + dy * 0.006, 0.12, 1.25);
      }
    });
    el.addEventListener('pointerup', e => {
      touches.delete(e.pointerId);
      if (touches.size < 2) pinch = 0;
      if (!down) return;
      const moved = down.moved;
      down = null;
      if (moved > 12) return;
      const r = el.getBoundingClientRect();
      ray.setFromCamera({ x: (e.clientX - r.left) / r.width * 2 - 1, y: -(e.clientY - r.top) / r.height * 2 + 1 }, camera);
      if (edit) {
        const hit = ray.intersectObjects(decorG.children, true)[0];
        if (hit && hit.object.userData.index != null) { handlers.onDecorTap && handlers.onDecorTap(hit.object.userData.index); return; }
        const f = ray.intersectObject(floor)[0];
        if (f) handlers.onFloorTap && handlers.onFloorTap(f.point.x, f.point.z);
        return;
      }
      for (let i = st.poops.length - 1; i >= 0; i--) {
        if (ray.intersectObject(st.poops[i], true).length || ray.ray.distanceToPoint(st.poops[i].position) < 0.45) {
          handlers.onTapPoop && handlers.onTapPoop();
          return;
        }
      }
      if (st.gk) {
        const a = new T.Vector3(), b = new T.Vector3();
        st.gk.bones.mid.getWorldPosition(a);
        st.gk.bones.head.getWorldPosition(b);
        if (ray.ray.distanceToPoint(a) < 1.1 * st.size || ray.ray.distanceToPoint(b) < 0.9 * st.size) {
          if (st.sleeping) wake();
          st.lick = 0.9;
          st.tiltT = 1.2;
          handlers.onTapGecko && handlers.onTapGecko();
        }
      }
    });
    el.addEventListener('pointercancel', e => { touches.delete(e.pointerId); pinch = 0; down = null; });

    // ---------- 動き
    const _m = new T.Vector3();
    function mouthWorld() { st.gk.mouth.getWorldPosition(_m); return _m; }
    function moveToward(tx, tz, speed, dt) {
      const dx = tx - st.x, dz = tz - st.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.05) return 0;
      const diff = angleTo(st.yaw, Math.atan2(dx, dz));
      st.yaw += diff * Math.min(1, dt * 3.5);
      const step = Math.min(d, speed * dt * (Math.abs(diff) > 1.1 ? 0.3 : 1));
      st.x += Math.sin(st.yaw) * step;
      st.z += Math.cos(st.yaw) * step;
      return step;
    }
    function clampPos() {
      resolveObstacles();
      // 家具にはばまれて進めないときは、行き先を変える
      if (st.mode === 'walk' || st.mode === 'toHide' || st.mode === 'toDrink' || st.mode === 'toBask') {
        st.walkTime = (st.walkTime || 0) + 1 / 60;
        if (st.walkTime > 9) { st.mode = 'idle'; st.wait = 0.5; st.walkTime = 0; }
      }
      const m = 1.4 * st.size;
      st.x = clamp(st.x, -BOUNDS.x + m, BOUNDS.x - m);
      st.z = clamp(st.z, BOUNDS.zMin + m, BOUNDS.zMax - m * 0.6);
    }

    function stepFoods(dt) {
      for (const f of st.foods) {
        if (f.hop) {
          f.hop.k += dt / f.hop.dur;
          const k = Math.min(1, f.hop.k);
          f.obj.position.x = lerp(f.hop.x0, f.hop.x1, k);
          f.obj.position.z = lerp(f.hop.z0, f.hop.z1, k);
          f.obj.position.y = f.kind === 'cricket' ? Math.sin(Math.PI * k) * 0.55 : 0;
          if (k >= 1) f.hop = null;
          continue;
        }
        if (f.kind === 'worm') f.obj.rotation.y += Math.sin(st.t * 6) * dt * 1.5;
        f.t -= dt;
        if (f.t <= 0) {
          const reach = f.kind === 'cricket' ? 1.4 : f.kind === 'dubia' ? 0.6 : 0.2;
          const x1 = clamp(f.obj.position.x + rand(-reach, reach), -BOUNDS.x, BOUNDS.x);
          const z1 = clamp(f.obj.position.z + rand(-reach, reach), BOUNDS.zMin, BOUNDS.zMax);
          f.obj.rotation.y = Math.atan2(x1 - f.obj.position.x, z1 - f.obj.position.z);
          f.hop = { x0: f.obj.position.x, z0: f.obj.position.z, x1, z1, k: 0, dur: f.kind === 'cricket' ? 0.35 : 1.2 };
          f.t = rand(0.9, 2.2);
        }
      }
    }

    function stepGecko(dt) {
      const gk = st.gk;
      if (!gk) return;
      let step = 0;
      const food = st.foods[0];
      const nf = st.night ? 1.35 : 1;
      const S = 0.95 * st.size;

      if (st.chomp > 0) {
        st.chomp -= dt;
      } else if (food) {
        if (st.sleeping) wake();
        const fp = food.obj.position;
        const mp = mouthWorld();
        const dMouth = Math.hypot(fp.x - mp.x, fp.z - mp.z);
        if (dMouth < 0.3 * S + 0.12 && !food.hop) {
          st.foods.shift();
          scene.remove(food.obj);
          disposeTree(food.obj);
          st.chomp = 0.7;
          st.lick = 0.9;
          handlers.onEat && handlers.onEat(food.kind);
        } else if (dMouth < 1.5 * S && st.stalk < 1) {
          // 狩りの前にしっぽの先をぷるぷる
          st.stalk += dt;
          st.yaw += angleTo(st.yaw, Math.atan2(fp.x - st.x, fp.z - st.z)) * Math.min(1, dt * 5);
        } else {
          const reach = 2.2 * S;
          step = moveToward(fp.x - Math.sin(st.yaw) * reach, fp.z - Math.cos(st.yaw) * reach, (st.stalk >= 1 ? 3.4 : 1.6) * nf, dt);
          if (!step) st.stalk = 0;
        }
      } else {
        st.stalk = 0;
        if (st.sleeping) {
          st.wait -= dt;
          st.zzz -= dt;
          if (st.zzz <= 0) { fx('z', 'zzz'); st.zzz = 1.8; }
          if (st.wait <= 0) wake();
          if (HIDE) st.yaw += angleTo(st.yaw, HIDE.face) * Math.min(1, dt * 2);
        } else if (st.mode === 'drink' || st.mode === 'bask') {
          // 水をぺろぺろ飲む／石の横でじっとひなたぼっこ
          st.wait -= dt;
          if (st.target && st.target.face != null) st.yaw += angleTo(st.yaw, st.target.face) * Math.min(1, dt * 3);
          if (st.mode === 'drink') { st.lickT -= dt; if (st.lickT <= 0) { st.lick = 0.9; st.lickT = rand(0.9, 1.4); } }
          if (st.wait <= 0) { st.mode = 'idle'; st.wait = rand(1.5, 4); }
        } else if (st.mode === 'walk' || st.mode === 'toHide' || st.mode === 'toDrink' || st.mode === 'toBask') {
          step = moveToward(st.target.x, st.target.z, 0.85 * nf, dt);
          if (Math.hypot(st.target.x - st.x, st.target.z - st.z) < 0.15) {
            if (st.mode === 'toHide') { st.sleeping = true; st.wait = rand(18, 35); st.zzz = 0.8; }
            if (st.mode === 'toDrink') { st.mode = 'drink'; st.wait = rand(3, 5); st.lickT = 0.2; }
            else if (st.mode === 'toBask') { st.mode = 'bask'; st.wait = rand(8, 16); }
            else { st.mode = 'idle'; st.wait = st.night ? rand(0.8, 2.5) : rand(2.5, 6); }
          }
        } else {
          st.wait -= dt;
          if (st.wait <= 0) {
            st.walkTime = 0;
            const dish = obstacles.find(o => o.t === 'dish'), stone = obstacles.find(o => o.t === 'stone');
            const nextTo = (o, gap) => {
              // 家具の手前（ケースの中心に近い側）に、鼻先を向けて止まる
              const a = Math.atan2(-o.x * 0.6 - o.x * 0.4 + rand(-1.2, 1.2), -o.z + rand(-1, 1));
              const d = o.r + gap;
              const x = clamp(o.x + Math.sin(a) * d, -BOUNDS.x + 1.4, BOUNDS.x - 1.4), z = clamp(o.z + Math.cos(a) * d, BOUNDS.zMin + 1.4, BOUNDS.zMax - 1);
              return { x, z, face: Math.atan2(o.x - x, o.z - z) };
            };
            const r0 = Math.random();
            if (dish && r0 < 0.14) { st.mode = 'toDrink'; st.target = nextTo(dish, 1.25 * st.size); }
            else if (stone && !st.night && r0 < 0.28) { st.mode = 'toBask'; st.target = nextTo(stone, 1.2 * st.size); }
            else if ((!st.night || st.heatPref < 0) && Math.random() < (st.heatPref < 0 ? 0.5 : 0.3) && HIDE) { st.mode = 'toHide'; st.target = { x: HIDE.x, z: HIDE.z }; }
            else if (!st.night && Math.random() < 0.12) { st.sleeping = true; st.wait = rand(12, 25); st.zzz = 0.8; }
            else {
              // 寒いと暖かい側（右）へ、暑いと涼しい側（左）へ寄りがち
              let xa = -TANK.hw + 2, xb = TANK.hw - 1.8;
              if (st.heatPref > 0 && Math.random() < 0.75) xa = 0.5;
              if (st.heatPref < 0 && Math.random() < 0.75) xb = -0.5;
              st.mode = 'walk'; st.target = freePoint(1.4 * st.size, xa, xb, -TANK.hd + 1.9, TANK.hd - 1.3);
            }
          }
        }
      }
      clampPos();

      // 歩いた距離で足を動かす（足がすべらないように）
      const moving = step > 0;
      st.walkW = lerp(st.walkW, moving ? 1 : 0, Math.min(1, dt * 6));
      st.phase += step / (0.95 * S) * Math.PI;

      // まばたき
      st.blinkT -= dt;
      if (st.blinkT <= 0) st.blinkT = rand(2.5, 6);
      const closing = st.sleeping || st.blinkT < 0.13;
      st.blinkV = lerp(st.blinkV, closing ? 1 : 0, Math.min(1, dt * (closing ? 28 : 16)));

      // こっちを見る・えさを見る
      let wantLook = 0;
      // じっとしているときは、ときどき舌をぺろっと出したり、きょろきょろ見回したりする
      if (!moving && !st.sleeping && !food && st.mode === 'idle') {
        st.idleT = (st.idleT == null ? rand(3, 7) : st.idleT) - dt;
        if (st.idleT <= 0) {
          const r0 = Math.random();
          if (r0 < 0.45) st.lick = 0.9;
          else if (r0 < 0.85) { st.peek = rand(-0.7, 0.7); st.peekT = rand(1.2, 2.4); }
          else st.tiltT = 1.2;
          st.idleT = rand(4, 9);
        }
      }
      if (st.peekT > 0) st.peekT -= dt;
      if (!moving && !st.sleeping && !food && st.peekT > 0) {
        wantLook = st.peek;
      } else if (!moving && !st.sleeping && !food) {
        wantLook = clamp(angleTo(st.yaw, Math.atan2(camera.position.x - st.x, camera.position.z - st.z)), -0.75, 0.75);
      } else if (food && !st.sleeping) {
        wantLook = clamp(angleTo(st.yaw, Math.atan2(food.obj.position.x - st.x, food.obj.position.z - st.z)), -0.6, 0.6);
      }
      st.look = lerp(st.look, wantLook, Math.min(1, dt * 2.5));
      st.drop = lerp(st.drop, st.sleeping || st.mode === 'bask' ? 0.13 : moving ? 0 : 0.06, Math.min(1, dt * 2));
      st.curl = lerp(st.curl, st.sleeping ? 1 : 0, Math.min(1, dt * 1.5));
      st.pitch = lerp(st.pitch, st.sleeping ? 0.22 : (st.stalk > 0 ? -0.08 : 0), Math.min(1, dt * 3));
      if (st.lick > 0) st.lick -= dt;
      if (st.happy > 0) st.happy -= dt;
      if (st.tiltT > 0) st.tiltT -= dt;

      P.t = st.t;
      P.phase = st.phase;
      P.walk = st.walkW;
      P.look = st.look;
      // 歩くときは一歩ごとに頭が小さく上下する
      P.pitch = st.pitch + (st.chomp > 0.35 ? -0.15 : 0) + Math.sin(st.phase * 2) * 0.035 * st.walkW;
      P.tilt = (st.tiltT > 0 ? Math.sin(Math.min(1, st.tiltT) * Math.PI) * 0.22 : 0) + (st.happy > 0 ? Math.sin(st.t * 7) * 0.12 : 0);
      P.curl = st.curl;
      P.stalk = st.stalk > 0 ? 1 : 0;
      P.happy = st.happy > 0 ? 1 : 0;
      P.drop = st.drop;
      P.blink = st.mode === 'bask' ? Math.max(st.blinkV, 0.55) : st.blinkV;
      P.tongue = st.lick > 0 ? Math.sin((0.9 - st.lick) / 0.9 * Math.PI) : 0;
      P.breathe = Math.sin(st.t * (st.sleeping ? 1.4 : 2.4));
      P.sway = 1;
      gk.root.position.set(st.x, 0, st.z);
      gk.root.rotation.y = st.yaw;
      pose(gk, P);
      blob.position.x = st.x;
      blob.position.z = st.z;
      blob.scale.set(2.2 * S, 4.2 * S, 1);
      blob.rotation.z = st.yaw;
    }

    const _t = new T.Vector3(), _c = new T.Vector3();
    function stepCamera(dt) {
      // アップのときは、手前のガラスが視界をさえぎらないように隠す
      for (const o of frontGlass) o.visible = !st.close;
      if (st.close && st.gk) {
        st.gk.bones.neck.getWorldPosition(_t);
        const D = (3.4 * 0.95 * st.size + 1.4) * st.zoom;
        const az = st.yaw + st.orbit;
        _c.set(_t.x + Math.sin(az) * Math.cos(st.elev) * D, _t.y + Math.sin(st.elev) * D, _t.z + Math.cos(az) * Math.cos(st.elev) * D);
        camera.position.lerp(_c, Math.min(1, dt * 3));
        camLook.lerp(_t, Math.min(1, dt * 4));
      } else {
        camera.position.lerp(HOME.pos, Math.min(1, dt * 3));
        camLook.lerp(st.gk ? _t.set(st.x * 0.18, 0, st.z * 0.12 + 0.2) : HOME.look, Math.min(1, dt * 2));
      }
      camera.lookAt(camLook);
    }

    let last = performance.now();
    const perf = { t: 0, n: 0, level: 0 };
    function adapt(rawDt) {
      perf.t += rawDt; perf.n++;
      if (perf.t < 2) return;
      const fps = perf.n / perf.t;
      perf.t = 0; perf.n = 0;
      if (fps < 38 && perf.level < 2) {
        perf.level++;
        renderer.setPixelRatio(perf.level === 1 ? Math.min(1.5, root.devicePixelRatio || 1) : 1);
        if (perf.level === 2) { sun.shadow.mapSize.set(1024, 1024); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
        resize();
      }
    }
    function loop(now) {
      const raw = (now - last) / 1000;
      const dt = Math.min(0.1, raw);
      last = now;
      if (st.active && raw < 0.5) adapt(raw);
      if (st.active) {
        st.t += dt;
        stepFoods(dt);
        stepGecko(dt);
        stepCamera(dt);
        renderer.render(scene, camera);
      }
      requestAnimationFrame(loop);
    }
    setNight(false);
    requestAnimationFrame(loop);

    return {
      // ヒーターの温度：光の強さと、レオパがどちら側に寄りがちかを変える
      setHeat(temp) {
        st.heatGlow = clamp(0.35 + (temp - 28) * 0.14, 0.35, 1.5);
        st.heatPref = temp <= 30 ? 1 : temp >= 34 ? -1 : 0;
        heat.intensity = 0.8 * st.heatGlow;
      },
      setGecko, spawnFood, takeFoods, setPoops, setNight, setClock, snapshot, setDirty, wake, hearts, setClose, setDecor, setEdit,
      pendingFoods: () => st.foods.map(f => f.kind),
      lick() { st.lick = 0.9; },
      happy() { st.happy = 1.4; if (st.sleeping) wake(); },
      setActive(v) { st.active = v; if (v) { last = performance.now(); resize(); } },
    };
  }

  // ======================================================
  // 図鑑やショップ用の写真
  // ======================================================
  let pr = null;
  const photoCache = new Map();
  function photo(look, opts) {
    if (!supported) return null;
    const face = !!(opts && (opts.face || opts.front)), side = !!(opts && opts.side), front = !!(opts && opts.front);
    const key = lookKey(look) + (face ? '|face' : '') + (side ? '|side' : '') + (front ? '|front' : '');
    if (photoCache.has(key)) return photoCache.get(key);
    if (!pr) {
      const renderer = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setSize(360, 360);
      renderer.setPixelRatio(1);
      renderer.outputEncoding = T.sRGBEncoding;
      renderer.toneMapping = T.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = T.PCFSoftShadowMap;
      const scene = new T.Scene();
      scene.environment = makeEnvironment(renderer);
      const key1 = new T.DirectionalLight('#FFF4E6', 1.1);
      key1.position.set(-2, 8, 5);
      key1.castShadow = true;
      key1.shadow.mapSize.set(1024, 1024);
      Object.assign(key1.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 20 });
      key1.shadow.radius = 6;
      key1.shadow.normalBias = 0.02;
      const rimL = new T.DirectionalLight('#DDE8FF', 0.4);
      rimL.position.set(3, 3, -6);
      const ground = new T.Mesh(new T.PlaneGeometry(20, 20), new T.ShadowMaterial({ opacity: 0.18 }));
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      scene.add(new T.HemisphereLight('#FFF6E4', '#B9A57E', 0.35), key1, rimL, ground);
      const camera = new T.PerspectiveCamera(28, 1, 0.1, 60);
      pr = { renderer, scene, camera };
    }
    const gk = buildGecko(look, 'photo');
    // しっぽをくるんと巻いて、こっちを向いたポーズ
    const P = restPose();
    P.curl = side ? 0 : 1.8;
    P.look = face || side ? 0 : -0.2;
    if (side) gk.root.rotation.y = -Math.PI / 2 + 0.25;
    P.tilt = 0.12;
    P.drop = 0.05;
    if (!side) gk.root.rotation.y = gk.glb ? -1.05 : 0.45;
    pr.scene.add(gk.root);
    pose(gk, P);
    gk.root.updateMatrixWorld(true);
    const box = new T.Box3();
    const q = new T.Vector3();
    Object.values(gk.bones).forEach(b => box.expandByPoint(b.getWorldPosition(q)));
    box.expandByPoint(gk.mouth.getWorldPosition(q));
    gk.legs.forEach(l => box.expandByPoint(l.wrist.getWorldPosition(q)));
    box.expandByScalar(0.45);
    const c = box.getCenter(new T.Vector3());
    const size = box.getSize(new T.Vector3());
    if (side) {
      // 参考写真と同じ、ななめ前の低い位置から全身
      pr.camera.position.set(c.x + 3.4, 2.3, c.z + 9.8);
      pr.camera.lookAt(c.x, 0.35, c.z);
    } else if (face) {
      // 顔のアップ：ななめ前から
      const h = gk.bones.head.getWorldPosition(new T.Vector3());
      const m = gk.mouth.getWorldPosition(new T.Vector3());
      const tgt = h.clone().lerp(m, 0.35);
      const fwd = m.clone().sub(h).setY(0).normalize();
      const right = new T.Vector3(fwd.z, 0, -fwd.x);
      pr.camera.position.copy(tgt).addScaledVector(fwd, 3.3).addScaledVector(right, front ? 0 : -1.6).add(new T.Vector3(0, front ? 0.35 : 0.9, 0));
      pr.camera.lookAt(tgt.x, tgt.y + 0.22, tgt.z);
    } else {
      const dist = Math.max(size.x, size.z) * (gk.glb ? 2.15 : 2.25);
      pr.camera.position.set(c.x + dist * (gk.glb ? -0.05 : 0.05), dist * (gk.glb ? 0.38 : 0.5), c.z + dist * 0.85);
      pr.camera.lookAt(c.x + 0.15, 0.3, c.z);
    }
    pr.renderer.render(pr.scene, pr.camera);
    const url = pr.renderer.domElement.toDataURL('image/png');
    pr.scene.remove(gk.root);
    disposeGecko(gk);
    photoCache.set(key, url);
    return url;
  }

  function photoKey(look, opts) {
    return lookKey(look) + (opts && opts.face ? '|face' : '') + (opts && opts.side ? '|side' : '');
  }
  function photoReady(look, opts) { return photoCache.get(photoKey(look, opts)) || null; }

  root.Leopa3D = { supported, createTank, photo, photoReady, photoKey, loadModel, DECOR, DEFAULT_DECOR, TANK };
})(typeof window !== 'undefined' ? window : globalThis);
