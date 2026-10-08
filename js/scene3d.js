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
  const DEFAULT_POLY = { spots: 60, blotch: 45, head: 60, carrot: 5, lav: 20, aberrant: 18, mel: 6 };
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
    const melK = Math.min(1, Math.max(0, ((look.poly && look.poly.mel) || 0) - 30) / 60);
    const belly = A.mix(pal.base, '#FFF9EF', 0.74 * (1 - melK * 0.7));
    const lavCol = '#9C86B8';
    // 3D モデルでは、モデルの実際のまわりの長さで丸の横幅を決める（丸が丸く見えるように）
    const circ = look.model && MODEL.perimAt ? MODEL.perimAt : circumference;

    const around = (cols) => {
      const g = ctx.createLinearGradient(0, 0, W, 0);
      [[0, cols[0]], [0.12, cols[0]], [0.27, cols[1]], [0.5, cols[2]], [0.73, cols[1]], [0.88, cols[0]], [1, cols[0]]].forEach(([p, col]) => g.addColorStop(p, col));
      return g;
    };
    const X = u => u * W, Y = z => zToV(z) * H;
    // 世界の長さ rw の丸を、その位置の太さに合わせて描く
    const blob = (u, z, rw, col, alpha, rot, stretch) => {
      const C = Math.max(0.35, circ(z));
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

    // ギャラクシー（本物の写真にあわせて）：ピンク・ラベンダーがかった地に、小さな黒い点がびっしり。手足と鼻先は白っぽいピンクに抜ける
    const galaxy = !!pal.galaxy && st !== 'baby';
    // ---- 地の色（背中は少し濃く、横は明るく、おなかは白）
    const ssnow = look.genes && look.genes.snow === 2 && !galaxy;
    ctx.fillStyle = around([belly, pal.base, A.mix(pal.base, galaxy || ssnow ? '#6E5A68' : '#7A4A08', ssnow ? 0.22 : 0.1)]);
    ctx.fillRect(0, 0, W, H);
    const tailCol = galaxy ? pal.tail : A.mix(st === 'baby' ? A.mix(pal.tail, '#FFFFFF', 0.35) : pal.tail, lavCol, poly.lav / 100 * 0.45);
    const tailC = A.mix(tailCol, '#100E0D', melK);
    vertFade(-0.8, -1.25, around([A.mix(tailC, '#FFFFFF', 0.6 * (1 - melK * 0.7)), tailC, A.mix(tailC, '#6E6070', 0.08)]));
    // キャロットテール：しっぽの付け根からオレンジ
    if (poly.carrot > 8) {
      const len = 0.25 + poly.carrot / 100 * 1.7;
      const a = Math.min(1, poly.carrot / 45);
      const cg = ctx.createLinearGradient(0, Y(Z_TAILBASE + 0.1), 0, Y(Z_TAILBASE - len));
      const orange = A.mix('#EC5512', pal.base, 0.12);
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
    const superSnow = look.genes && look.genes.snow === 2 && !galaxy;
    const jungle = poly.aberrant >= 60 && !galaxy, stripe = poly.aberrant >= 82 && !galaxy;
    if (pal.pattern) {
      const bandA = st === 'baby' ? 0.95 : st === 'young' && !galaxy ? 0.42 : 0;
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
      if (st !== 'baby' && !galaxy) {
        // ラベンダーが強いほど、帯がはっきり紫に残る。黒い子（ブラックナイト）では見えない
        const la = (0.12 + Math.pow(poly.lav / 100, 1.5) * 0.75) * (1 - melK);
        const albB = look.genes && (look.genes.alb === 2 || look.genes.bell === 2);
        for (const [z0, z1] of bandZ) band(z0 + 0.03 - poly.lav / 1500, z1 - 0.03 + poly.lav / 1500, A.mix(pal.base, albB ? '#C8928E' : lavCol, albB ? 0.6 : 0.85), (albB ? Math.max(la, 0.4) : la) * (z1 > Z_TAILBASE ? 1 : 0.8), jungle || poly.lav > 60);
      }
    } else if (poly.lav > 30) {
      ctx.globalAlpha = poly.lav / 100 * 0.35;
      ctx.fillStyle = around([rgba(lavCol, 0), rgba(lavCol, 0.7), rgba(lavCol, 0.4)]);
      ctx.fillRect(0, Y(1.1), W, H - Y(1.1));
    }

    // ---- ヒョウ柄
    // 本物のレオパの斑点：ふちのはっきりした黒い丸っこい点が、重ならずに散らばる。
    // 背中は大きめ・わき腹は小さくまばら・頭は細かい点。ジャングル／ストライプだけはつながる。
    const spotA = !pal.pattern ? 0 : st === 'baby' ? 0 : st === 'young' ? 0.72 : 1;
    if (spotA > 0) {
      const albSpot = look.genes && (look.genes.alb === 2 || look.genes.bell === 2);
      const sizeMul = (0.6 + poly.blotch / 100 * 0.9) * (albSpot ? 1.3 : 1);
      const alpha = spotA * (pal.spot === '#A0704A' ? 0.85 : 0.96);
      const placed = [];
      const fits = (u, z, rw, gap) => {
        const C = Math.max(0.35, circ(z));
        for (const q of placed) {
          if (Math.abs(q.z - z) > 0.4) continue;
          let du = Math.abs(q.u - u); du = Math.min(du, 1 - du);
          if (Math.hypot(du * C, q.z - z) < (q.rw + rw) * gap) return false;
        }
        return true;
      };
      // ふちが少しだけゆらいだ、丸っこい点
      const spot = (u, z, rw, stretch) => {
        const C = Math.max(0.35, circ(z));
        const n = 9, ph = r() * 6.28, pts = [];
        for (let i = 0; i < n; i++) {
          const a = i / n * Math.PI * 2;
          const rr = rw * (0.84 + 0.16 * Math.sin(a * 2 + ph) + 0.08 * Math.sin(a * 3 + ph * 2) + (r() - 0.5) * 0.3);
          pts.push([X(u) + Math.cos(a) * rr / C * W * (stretch || 1), Y(z) + Math.sin(a) * rr / LEN * H]);
        }
        ctx.globalAlpha = alpha;
        ctx.fillStyle = pal.spot;
        ctx.beginPath();
        const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
        let m0 = mid(pts[n - 1], pts[0]);
        ctx.moveTo(m0[0], m0[1]);
        for (let i = 0; i < n; i++) { const m = mid(pts[i], pts[(i + 1) % n]); ctx.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]); }
        ctx.fill();
        placed.push({ u, z, rw });
      };
      // 決めた範囲に、重ならないように n 個までまく
      const scatter = (n, zTop, zBot, spread, size, gap, edgeThin) => {
        for (let tries = 0, k = 0; k < n && tries < n * 25; tries++) {
          let z = zTop - r() * (zTop - zBot);
          // 子どものころの帯のあたりに、少しだけ集まる
          if (bandZ.length && r() < 0.3) { const b = bandZ[Math.floor(r() * bandZ.length)]; const zz = (b[0] + b[1]) / 2 + (r() - 0.5) * 0.25; if (zz <= zTop && zz >= zBot) z = zz; }
          const side = (r() * 2 - 1);
          const u = 0.5 + side * spread;
          const edge = Math.abs(side);
          if (edgeThin && r() < edge * edge * 0.55) continue;
          const rw = size(z) * (0.6 + Math.pow(r(), 1.6) * 0.95) * (edgeThin ? 1 - edge * 0.4 : 1);
          if (!fits(u, z, rw, gap)) continue;
          spot(u, z, rw, 1 + (r() - 0.5) * 0.45);
          k++;
        }
      };
      if (jungle || stripe) {
        // ジャングル・ストライプ（本物の写真にあわせて）：模様は真っ黒ではなく、こげ茶〜紫がかった色。
        // ジャングルは帯がくずれて不規則にうねり、ストライプは背中の両わきに太いすじが通って、まん中が明るく抜ける。
        const jc = A.mix(pal.spot, '#6B4A5C', 0.38), ja = alpha * 0.92;
        const wav = (u0, z0, z1, w, col, a, wob) => {
          // 縦方向（鼻→尾）に流れる、ふちのゆらいだすじ
          const pts = [], step = 0.04;
          let du = 0, dw = 0;
          for (let z = z0; z > z1; z -= step) { du += (r() - 0.5) * wob; du *= 0.9; dw += (r() - 0.5) * 0.25; dw *= 0.85; pts.push([z, u0 + du, w * (1 + dw)]); }
          ctx.globalAlpha = a; ctx.fillStyle = col; ctx.beginPath();
          pts.forEach(([z, u, ww], i) => { const C = Math.max(0.35, circ(z)); const x = X(u - ww / C); i ? ctx.lineTo(x, Y(z)) : ctx.moveTo(x, Y(z)); });
          for (let i = pts.length - 1; i >= 0; i--) { const [z, u, ww] = pts[i]; const C = Math.max(0.35, circ(z)); ctx.lineTo(X(u + ww / C), Y(z)); }
          ctx.closePath(); ctx.fill();
        };
        if (stripe) {
          // まん中の明るいすじ
          wav(0.5, 1.15, -2.9, 0.07, A.mix(pal.base, '#FFF6DC', 0.45), 0.7, 0.004);
          // 両わきの太いすじ（尾ではとぎれとぎれ）
          for (const sd of [-1, 1]) {
            wav(0.5 + sd * 0.075, 1.2, Z_TAILBASE - 0.1, 0.085 * sizeMul, jc, ja, 0.012);
            for (let z = Z_TAILBASE - 0.2; z > -3.0; z -= 0.35 + r() * 0.2) wav(0.5 + sd * 0.07, z, z - 0.18 - r() * 0.15, 0.06, jc, ja, 0.01);
          }
          // 頭のうしろは帯がつながる
          band(1.32, 1.15, jc, ja * 0.8, true);
        } else {
          // ジャングル：くずれた帯が不規則につながり、ところどころで縦にうねる
          for (const [z0, z1] of bandZ) {
            const segs = 2 + Math.floor(r() * 3);
            for (let k = 0; k < segs; k++) {
              const u = 0.5 + (r() - 0.5) * 0.7, zc = (z0 + z1) / 2 + (r() - 0.5) * 0.25;
              blob(u, zc, (0.07 + r() * 0.08) * sizeMul, jc, ja, (r() - 0.5) * 0.9, 1.6 + r() * 2.2);
            }
            if (r() < 0.6) wav(0.5 + (r() - 0.5) * 0.4, z0 + 0.1, z1 - 0.25 - r() * 0.3, 0.05 + r() * 0.04, jc, ja, 0.03);
          }
          const nB = poly.spots < 8 ? 0 : Math.round(40 * Math.pow(poly.spots / 60, 1.2));
          for (let i = 0; i < nB; i++) blob(0.5 + (r() + r() - 1) * 0.36, 1.2 - r() * (1.2 - Z_TAILBASE), (0.025 + r() * 0.03) * sizeMul, jc, ja, (r() - 0.5) * 0.8, 1 + r() * 1.5);
        }
      } else if (galaxy || superSnow) {
        // ギャラクシー：小さな丸い点が、背中からわき腹・しっぽの先まで、すきまなく並ぶ（ゴマ模様）
        const ds = superSnow ? 0.048 : 0.03, gp = superSnow ? 1.04 : 1.12;
        scatter(950, 1.24, Z_TAILBASE, 0.44, () => ds, gp, false);
        scatter(650, Z_TAILBASE - 0.05, -3.1, 0.46, z => ds * clamp(circ(z) / 2.4, 0.45, 1.1), gp, false);
      } else {
        // 胴：背中を中心に
        // タンジェリンの血統は、胴の斑点が少なく小さくなる（頭としっぽには残る）
        const tangK = clamp(((look.tang || 0) - 55) / 35, 0, 1);
        const bodyN = poly.spots < 8 ? 0 : Math.round(300 * Math.pow(poly.spots / 60, 2.2) * (1 - 0.6 * tangK));
        scatter(bodyN, 1.22, Z_TAILBASE, 0.4, () => 0.046 * sizeMul * (1 - 0.3 * tangK), 1.22, true);
        // しっぽ：太さに合わせて小さくなる。ハイポでも少し残る
        const tailN = Math.round(240 * (0.12 + 0.88 * poly.spots / 100));
        scatter(tailN, Z_TAILBASE - 0.05, Z_TAILBASE - 2.35, 0.46, z => 0.09 * sizeMul * clamp(circ(z) / 2.2, 0.55, 1.1), 1.15, true);
      }
      // 頭：細かい点（少ないとボールディ）。ギャラクシーは鼻先をあけて、細かい点をびっしり
      if (galaxy) scatter(240, 1.95, 1.3, 0.35, z => 0.014 + (1.95 - z) * 0.011, 1.2, false);
      else if (superSnow) scatter(320, 2.1, 1.3, 0.38, z => 0.018 + (2.1 - z) * 0.012, 1.1, false);
      else {
        // 胴の斑点が少ない子（ハイポ）は、頭の点も少なめ
        const headN = poly.head < 10 ? 0 : Math.round(160 * Math.pow(poly.head / 60, 1.2) * (0.5 + 0.5 * Math.min(1, poly.spots / 40)));
        scatter(headN, 2.1, 1.3, 0.36, z => (0.016 + (2.1 - z) * 0.014) * (0.75 + poly.blotch / 220), 1.35, false);
      }
    }
    // エクリプスの鼻先は白っぽく抜ける
    if (look.genes && look.genes.ecl === 2 && !galaxy && st !== 'baby' && pal.pattern) {
      const ng = ctx.createLinearGradient(0, Y(2.3), 0, Y(1.98));
      ng.addColorStop(0, rgba('#F3E0DA', 1)); ng.addColorStop(0.5, rgba('#F3E0DA', 0.75)); ng.addColorStop(1, rgba('#F3E0DA', 0));
      ctx.globalAlpha = 1; ctx.fillStyle = ng;
      ctx.fillRect(0, 0, W, Y(1.98));
    }
    // ギャラクシーの鼻先は、ピンクがかった白に抜ける
    if (galaxy) {
      const ng = ctx.createLinearGradient(0, Y(2.3), 0, Y(1.9));
      ng.addColorStop(0, rgba('#EBC2CB', 1)); ng.addColorStop(0.55, rgba('#EBC2CB', 0.85)); ng.addColorStop(1, rgba('#EBC2CB', 0));
      ctx.globalAlpha = 1; ctx.fillStyle = ng;
      ctx.fillRect(0, 0, W, Y(1.9));
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
    // ギャラクシーの手足は、点のない白（ハイソックス）
    if (pal.pattern && look.stage !== 'baby' && poly.spots >= 8 && !pal.galaxy) {
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
    const pal = A.colors(look.genes, look.tang, look.stage, look.poly);
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
    const limbCol = pal.galaxy && look.stage !== 'baby' ? '#E6B9C3' : A.mix(pal.base, '#FFF9EF', 0.06);
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

  // 4本の足の接地を保ち、持ち上げた足だけを次の位置へ運ぶ。
  // レオパの水平歩行の計測では、周期の約70〜78%を接地に使う。
  // Jagnandan & Higham (2017), doi:10.1038/s41598-017-11484-7, Table 1。
  // 数値をそのまま飼育中の速さに固定せず、ゆっくりした移動にも距離で同期させる。
  const FOOT_TIMING = [{ off: 0, duty: 0.72 }, { off: 0.5, duty: 0.72 }, { off: 0.58, duty: 0.78 }, { off: 0.08, duty: 0.78 }];
  function footSurface(floorAt, x, z, scale) {
    let y = floorAt(x, z);
    // 足の中心だけでなく、指が広がる範囲の段差も避ける。
    for (const radius of [0.16, 0.32]) for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, r = radius * scale;
      y = Math.max(y, floorAt(x + Math.cos(a) * r, z + Math.sin(a) * r));
    }
    return y;
  }
  function stepFeet(g, dt, motion, floorAt, poseDrop) {
    const gk = g.gk;
    if (!gk || !gk.glb) return;
    const scale = gk.root.scale.x, distance = Math.hypot(motion.dx, motion.dz);
    const travel = distance + Math.abs(motion.dyaw) * 0.55 * scale;
    const moving = travel > 0.00001;
    const reset = !g.gait || g.gait.model !== gk || distance > scale * 0.9;
    gk.root.updateMatrixWorld(true);
    if (reset) {
      g.phase = 0.28 * Math.PI * 2;
      g.gait = { model: gk, rate: 0, feet: MODEL.feet.map(home => {
        const at = gk.root.localToWorld(home.clone());
        at.y = footSurface(floorAt, at.x, at.z, scale) + home.y * scale;
        return { at, from: at.clone(), to: at.clone(), air: false, progress: 0 };
      }) };
    }
    const gait = g.gait;
    const rate = travel / Math.max(dt, 0.001) / (0.45 * scale) * Math.PI * 2;
    if (moving && !reset) gait.rate = Math.min(16, rate);
    const settling = gait.feet.some(f => f.air);
    g.phase += moving && !reset ? rate * dt : settling ? Math.max(3, gait.rate) * dt : 0;
    g.walkW = lerp(g.walkW || 0, moving && !reset ? clamp(travel / dt / scale / 0.85, 0, 1) : 0, 1 - Math.exp(-dt * 9));
    const direction = V(motion.dx, 0, motion.dz).normalize();
    const forwardShare = travel > 0 ? distance / travel : 0;
    const yawRate = clamp(motion.dyaw / dt, -2.5, 2.5);
    const U = gk.U;
    U.uPlant.value = 1;
    for (let i = 0; i < 4; i++) {
      const home = MODEL.feet[i], f = gait.feet[i], timing = FOOT_TIMING[i];
      const q = ((g.phase / (Math.PI * 2) + timing.off) % 1 + 1) % 1;
      const swing = q >= timing.duty;
      const local = gk.root.worldToLocal(f.at.clone());
      f.replanted = false;
      const overreach = Math.hypot(local.x - home.x, local.z - home.z) > (i < 2 ? 0.16 : 0.22);
      if (!f.air && (swing || overreach) && moving && !reset && gait.feet.filter(f => f.air).length < 2) {
        f.air = true; f.progress = 0; f.start = g.phase;
        f.duration = (swing ? 1 - q : 0.20) * Math.PI * 2;
        f.from.copy(f.at);
        // 行き先には移動と旋回の両方を使う。後ずさりでも足が逆へ運ばれる。
        f.to.copy(home).applyAxisAngle(V(0, 1, 0), yawRate * 0.08);
        gk.root.localToWorld(f.to);
        // 速さではなく残りの歩幅から予測する。ゆっくり歩く時にも足を後ろに置きすぎない。
        const lead = direction.clone().multiplyScalar(0.45 * scale * ((swing ? 1 - q : 0.20) + timing.duty / 2) * forwardShare);
        f.to.add(lead);
        f.to.y = footSurface(floorAt, f.to.x, f.to.z, scale) + home.y * scale;
      }
      if (f.air) {
        f.progress = clamp((g.phase - f.start) / Math.max(0.06, f.duration), 0, 1);
        f.at.copy(f.from).lerp(f.to, smooth(f.progress));
        f.at.y += Math.sin(f.progress * Math.PI) * (i < 2 ? 0.10 : 0.12) * scale;
        if (f.progress >= 1) { f.at.copy(f.to); f.air = false; }
      }
      // 静止中は接地点を更新しない。家具や手の高さだけは追従する。
      if (!f.air) f.at.y = footSurface(floorAt, f.at.x, f.at.z, scale) + home.y * scale;
      const target = gk.root.worldToLocal(f.at.clone());
      // ほるときは前足だけを交互に引く。後ろ足は体を支える。
      const dig = g.ap && g.ap.churn || 0;
      if (i < 2 && dig > 0.001) {
        const ph = g.t * 8 + i * Math.PI;
        const digging = home.clone();
        digging.z += 0.15 * Math.cos(ph); digging.y += Math.max(0, Math.sin(ph)) * 0.09;
        target.lerp(digging, dig);
      }
      // 急旋回や段差で届かない位置に足を固定し続けない。足を置き直し、脚を引き伸ばさない。
      const offset = target.clone().sub(home), reach = i < 2 ? 0.20 : 0.28;
      let corrected = offset.length() > reach;
      if (corrected) target.copy(home).add(offset.setLength(reach));
      const hip = MODEL.pivots[i].clone();
      hip.y -= (poseDrop == null ? g.drop || 0.04 : poseDrop) - 0.04;
      const body = 1 - smooth(clamp((hip.z - 0.8) / 0.55, 0, 1));
      hip.x += (g.walkW || 0) * 0.095 * Math.sin(g.phase) * clamp(-hip.z * 0.8, -1, 1) * body;
      const bz = hip.z - 0.3;
      hip.x += (g.bend || 0) * bz * bz * (bz > 0 ? 0.07 : 0.04);
      const limb = target.clone().sub(hip), maxLength = home.distanceTo(MODEL.pivots[i]) * 1.10;
      if (limb.length() > maxLength) { target.copy(hip).add(limb.setLength(maxLength)); corrected = true; }
      if (corrected) {
        f.at.copy(gk.root.localToWorld(target.clone()));
        if (!f.air) { f.from.copy(f.at); f.to.copy(f.at); }
        f.replanted = true;
      }
      U.uFootTarget.value[i].copy(target);
      // 坂や手の上でも、足の裏の面をワールド座標で計算する。
      const up = V(0, 1, 0).applyQuaternion(gk.root.quaternion.clone().invert());
      const floor = gk.root.worldToLocal(V(f.at.x, footSurface(floorAt, f.at.x, f.at.z, scale), f.at.z));
      U.uFootPlane.value[i].set(up.x, up.y, up.z, up.dot(floor) + 0.002);
    }
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
      if (o.geometry && o.geometry !== MODEL.geo && o.geometry !== MODEL.claws) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    gk.owned.forEach(t => t.dispose());
  }
  function disposeTree(obj) {
    obj.traverse(o => {
      if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (!m.userData.shared) m.dispose(); });
    });
  }
  function lookKey(look) {
    const p = look.poly || {};
    return [MODEL.geo ? 'm' : 'p', look.genes.snow, look.genes.alb, look.genes.ecl, look.genes.bliz, look.genes.bell, look.genes.giant, look.tang, p.spots, p.blotch, p.head, p.carrot, p.lav, p.aberrant, p.mel, look.seed, look.stage, !!look.gravid, !!look.shed].join('|');
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

  // 模様の座標は変えず、鼻先の丸みと閉じた口の細い溝を形で表す。
  function muzzleOutline(p) {
    const front = smooth(clamp((p.z - 1.94) / 0.24, 0, 1));
    p.x *= 1 + 0.18 * front;
    p.z -= 0.075 * front;
    p.y -= 0.012 * front * smooth(clamp((p.y - 0.45) / 0.11, 0, 1));
    return p;
  }
  function sculptMuzzle(p, normal, nostrils) {
    const original = p.clone();
    const z = p.z;
    muzzleOutline(p);
    if (z < 1.63) return p;
    const fade = smooth(clamp((z - 1.63) / 0.09, 0, 1));
    const mouthY = 0.335 + 0.06 * smooth(clamp((2.1 - z) / 0.4, 0, 1));
    const d = p.y - mouthY;
    // 口の線を描き足さず、くぼみと控えめなくちびるの厚みで境界を作る。
    let offset = fade * (-0.014 * Math.exp(-Math.pow(d / 0.011, 2))
      + 0.004 * Math.exp(-Math.pow((d - 0.02) / 0.013, 2))
      + 0.003 * Math.exp(-Math.pow((d + 0.018) / 0.013, 2)));
    for (const n of nostrils) {
      const r = original.distanceTo(n);
      offset -= 0.019 * Math.exp(-Math.pow(r / 0.015, 2));
      offset += 0.003 * Math.exp(-Math.pow((r - 0.023) / 0.008, 2));
    }
    return p.addScaledVector(normal, offset);
  }

  // 同じモデルの5本の指を使い、短い内側の指と長い中央の指を区別する。
  const FOOT_SHAPE = {
    front: { palm: [0.216, -0.123, 0.438], tips: [[0.146, 0.387, 0.72], [0.171, 0.499, 0.92], [0.245, 0.503, 1.14], [0.303, 0.449, 1.02], [0.241, 0.370, 0.80]] },
    rear: { palm: [0.330, -0.133, -0.193], tips: [[0.305, -0.124, 0.80], [0.380, -0.130, 0.96], [0.417, -0.190, 1.03], [0.388, -0.259, 1.08], [0.311, -0.267, 0.86]] },
  };
  function prepareFeet(pos, legOf) {
    const feet = {};
    for (const leg of [1, 2, 3, 4]) {
      const front = leg < 3, side = leg === 1 || leg === 3 ? -1 : 1;
      const cfg = FOOT_SHAPE[front ? 'front' : 'rear'];
      const points = [];
      let minY = Infinity;
      for (let i = 0; i < pos.length; i += 3) {
        const x = pos[i], y = pos[i + 1], z = pos[i + 2];
        if (legOf(x, y, z) !== leg || y > -0.10) continue;
        points.push([x, y, z]); minY = Math.min(minY, y);
      }
      const palm = toGame(side * cfg.palm[0], cfg.palm[1], cfg.palm[2]);
      const digits = cfg.tips.map(([x, z, length], i) => {
        // モデルの左右差に合わせ、各指の先端位置を表面から求める。
        const near = points.slice().sort((a, b) => Math.hypot(a[0] - side * x, a[2] - z) - Math.hypot(b[0] - side * x, b[2] - z)).slice(0, 8);
        const center = near.reduce((sum, p) => sum.add(toGame(...p)), V(0, 0, 0)).multiplyScalar(1 / near.length);
        const tip = center, dir = tip.clone().sub(palm).setY(0);
        const span = dir.length(); dir.normalize();
        return { tip, dir, span, length, bend: (i % 2 ? 1 : -1) * side * 0.012 };
      });
      feet[leg] = { front, side, palm, digits, floorShift: (minY + MY) * MS - 0.002 };
    }
    return feet;
  }
  function sculptLeg(p, normal, rawY, foot) {
    // 前腕・足首を細くし、太ももや付け根の厚みは残す。
    const ankle = Math.exp(-Math.pow((p.y - 0.21) / 0.13, 2));
    p.addScaledVector(normal, -(foot.front ? 0.018 : 0.014) * ankle);
    const grounded = smooth(clamp((-0.08 - rawY) / 0.04, 0, 1));
    p.y -= foot.floorShift * grounded;
    if (rawY < -0.105) {
      const q = p.clone().sub(foot.palm).setY(0);
      let nearest = null, best = Infinity, progress = 0;
      for (const d of foot.digits) {
        const t = q.dot(d.dir) / d.span;
        if (t < 0.18 || t > 1.16) continue;
        const distance = q.clone().addScaledVector(d.dir, -t * d.span).length();
        if (distance < best) { best = distance; nearest = d; progress = t; }
      }
      if (nearest && best < 0.048) {
        const d = nearest, t = clamp(progress, 0, 1);
        const weight = (1 - smooth(clamp((best - 0.025) / 0.023, 0, 1))) * smooth(clamp((t - 0.18) / 0.82, 0, 1));
        p.addScaledVector(d.dir, d.span * (d.length - 1) * weight);
        const bend = d.bend * Math.sin(t * Math.PI) * weight;
        p.x += d.dir.z * bend; p.z -= d.dir.x * bend;
        // 指の腹は床に沿わせ、関節には控えめな丸みを付ける。
        p.y += 0.006 * Math.pow(Math.sin(t * Math.PI * 2), 2) * weight;
        const across = q.x * d.dir.z - q.z * d.dir.x;
        p.x -= d.dir.z * across * 0.18 * weight;
        p.z += d.dir.x * across * 0.18 * weight;
      }
    }
    p.y = Math.max(0.002, p.y);
    return p;
  }
  function makeClaws(feet, pivots) {
    const positions = [], legs = [], pivotData = [], centers = [], indices = [];
    for (const [key, foot] of Object.entries(feet)) {
      const leg = Number(key), pv = toGame(...pivots[leg]);
      for (const d of foot.digits) {
        const rawY = d.tip.y / MS - MY;
        const start = sculptLeg(d.tip.clone(), V(0, 0, 0), rawY, foot);
        start.addScaledVector(d.dir, -0.006);
        start.y += 0.006;
        const length = foot.front ? 0.026 : 0.032, base = positions.length / 3;
        for (let k = 0; k <= 5; k++) {
          const t = k / 5, radius = 0.006 * Math.pow(1 - t, 0.8) + 0.0004;
          const c = start.clone().addScaledVector(d.dir, length * t);
          c.y = Math.max(0.003, start.y - 0.012 * t * t);
          for (let j = 0; j <= 8; j++) {
            const a = j / 8 * Math.PI * 2;
            positions.push(c.x + d.dir.z * radius * Math.cos(a), c.y + radius * Math.sin(a), c.z - d.dir.x * radius * Math.cos(a));
            legs.push(leg); pivotData.push(pv.x, pv.y, pv.z); centers.push(foot.palm.y);
            if (k < 5 && j < 8) {
              const at = base + k * 9 + j;
              indices.push(at, at + 1, at + 9, at + 1, at + 10, at + 9);
            }
          }
        }
      }
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    geo.setAttribute('aLeg', new T.Float32BufferAttribute(legs, 1));
    geo.setAttribute('aLimb', new T.Float32BufferAttribute(legs.map(() => 1), 1));
    geo.setAttribute('aPivot', new T.Float32BufferAttribute(pivotData, 3));
    geo.setAttribute('aCy', new T.Float32BufferAttribute(centers, 1));
    geo.setIndex(indices); geo.computeVertexNormals();
    return geo;
  }

  function prepareModel(buf) {
    const { pos, idx } = parseGLB(buf);
    const n = pos.length / 3;
    const base = new T.BufferGeometry();
    base.setAttribute('position', new T.BufferAttribute(pos, 3));
    base.setIndex(new T.BufferAttribute(idx, 1));
    base.computeVertexNormals();
    const normals = base.attributes.normal;
    // 左右の鼻孔は、元のモデルの鼻先の表面に沿って位置を合わせる。
    const nostrilPoints = [1, -1].map(side => {
      const goal = toGame(side * 0.04, 0.018, 0.906);
      let best = Infinity, nearest = goal;
      for (let i = 0; i < n; i++) {
        const q = toGame(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
        const d = q.distanceToSquared(goal);
        if (d < best) { best = d; nearest = q; }
      }
      return nearest;
    });
    // 脚の見分け：前脚・後ろ脚のあたりで、体の外や下に出ている部分
    const legOf = (x, y, z) => {
      const out = Math.abs(x) > 0.135 || y < -0.085;
      if (z > 0.3 && z < 0.56 && out) return x < 0 ? 1 : 2;
      if (z > -0.33 && z < -0.04 && out) return x > 0 ? 4 : 3;
      return 0;
    };
    const PIV = { 1: [-0.12, 0, 0.43], 2: [0.12, 0, 0.43], 3: [-0.13, -0.01, -0.18], 4: [0.13, -0.01, -0.18] };
    const feet = prepareFeet(pos, legOf);
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
    // 輪切りごとに、体のまわりの長さにそって u を決める（平たい体でも模様がのびたり縮んだりしないように）
    const NB = 48, ring = {};
    for (let i = 0; i < n; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      if (legOf(x, y, z)) continue;
      const k = Math.round(z / BIN), dy = y - centerY(z);
      const th = Math.atan2(dy, x), b = Math.floor(((th + Math.PI / 2 + 4 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI) * NB) % NB;
      const R0 = ring[k] || (ring[k] = new Float32Array(NB));
      R0[b] = Math.max(R0[b], Math.hypot(x, dy));
    }
    const arc = {};
    for (const k in ring) {
      const R0 = ring[k];
      // 空いた区画は、となりの値でうめる
      for (let pass = 0; pass < NB; pass++) {
        let left = false;
        for (let b = 0; b < NB; b++) if (!R0[b]) { const a = R0[(b + NB - 1) % NB], c = R0[(b + 1) % NB]; if (a || c) R0[b] = a && c ? (a + c) / 2 : a || c; else left = true; }
        if (!left) break;
      }
      const cum = new Float32Array(NB + 1);
      for (let b = 0; b < NB; b++) {
        const t0 = -Math.PI / 2 + b / NB * 2 * Math.PI, t1 = t0 + 2 * Math.PI / NB;
        const r0 = R0[b], r1 = R0[(b + 1) % NB];
        cum[b + 1] = cum[b] + Math.hypot(r1 * Math.cos(t1) - r0 * Math.cos(t0), r1 * Math.sin(t1) - r0 * Math.sin(t0));
      }
      arc[k] = cum;
    }
    const arcAt = k => { for (let d = 0; d < 8; d++) for (const kk of [k - d, k + d]) if (arc[kk]) return arc[kk]; return null; };
    const uOf = (th, z) => {
      const cum = arcAt(Math.round(z / BIN));
      if (!cum) return thToU(th);
      const f = (((th + Math.PI / 2) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / (2 * Math.PI) * NB;
      const b = Math.min(NB - 1, Math.floor(f));
      return (cum[b] + (cum[b + 1] - cum[b]) * (f - b)) / cum[NB];
    };
    // 模様を描くときに使う、まわりの長さ（模様の z の単位で）
    const perim = [];
    for (const k in arc) {
      const gz = Number(k) * BIN * MS + MZ, zc = canonZ(gz);
      const sl = (canonZ(gz + 0.02) - canonZ(gz - 0.02)) / 0.04;
      perim.push([zc, arc[k][NB] * MS * sl]);
    }
    perim.sort((a, b) => a[0] - b[0]);
    const sm = perim.map((p, i) => { let s = 0, w = 0; for (let j = Math.max(0, i - 2); j <= Math.min(perim.length - 1, i + 2); j++) { s += perim[j][1]; w++; } return [p[0], s / w]; });
    MODEL.perimAt = zc => {
      if (zc <= sm[0][0]) return Math.max(0.2, sm[0][1]);
      for (let i = 1; i < sm.length; i++) if (sm[i][0] >= zc) return Math.max(0.2, lerp(sm[i - 1][1], sm[i][1], (zc - sm[i - 1][0]) / (sm[i][0] - sm[i - 1][0])));
      return Math.max(0.2, sm[sm.length - 1][1]);
    };
    const g = new T.BufferGeometry();
    const P = new Float32Array(n * 3), UV = new Float32Array(n * 2), LEG = new Float32Array(n), PV = new Float32Array(n * 3), CY = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      const q = toGame(x, y, z);
      const shaped = sculptMuzzle(q.clone(), V(normals.getX(i), normals.getY(i), normals.getZ(i)), nostrilPoints);
      const leg = legOf(x, y, z);
      if (leg) sculptLeg(shaped, V(normals.getX(i), normals.getY(i), normals.getZ(i)), y, feet[leg]);
      P.set([shaped.x, shaped.y, shaped.z], i * 3);
      // 脚は体の横と同じ色・模様にする（おなかの白にならないように）
      const th = leg ? (x > 0 ? 0.35 : Math.PI - 0.35) + (y + 0.05) * 3 * (x > 0 ? 1 : -1) : Math.atan2(y - centerY(z), x);
      UV[i * 2] = leg ? thToU(th) : uOf(th, z);
      UV[i * 2 + 1] = zToV(canonZ(q.z));
      LEG[i] = leg;
      CY[i] = toGame(0, centerY(z), z).y;
      if (leg) { const pv = toGame(...PIV[leg]); PV.set([pv.x, pv.y, pv.z], i * 3); }
    }
    base.dispose();
    g.setAttribute('position', new T.BufferAttribute(P, 3));
    g.setAttribute('uv', new T.BufferAttribute(UV, 2));
    g.setAttribute('aLeg', new T.BufferAttribute(LEG, 1));
    g.setAttribute('aPivot', new T.BufferAttribute(PV, 3));
    g.setAttribute('aCy', new T.BufferAttribute(CY, 1));
    // 脚と胴の境界に接する頂点は動かさず、メッシュに沿った距離で滑らかに曲げる。
    // x/z の分類だけで脚を回すと、胴やしっぽに細長い三角形ができてしまう。
    const neighbors = Array.from({ length: n }, () => new Set());
    const seam = new Set();
    for (let t = 0; t < idx.length; t += 3) {
      const tri = [idx[t], idx[t + 1], idx[t + 2]];
      for (const a of tri) for (const b of tri) if (a !== b) {
        neighbors[a].add(b);
        if (LEG[a] > 0 && LEG[a] !== LEG[b]) seam.add(a);
      }
    }
    const dist = new Float32Array(n); dist.fill(Infinity);
    const queue = [...seam]; queue.forEach(i => { dist[i] = 0; });
    for (let at = 0; at < queue.length; at++) {
      const a = queue[at];
      for (const b of neighbors[a]) if (LEG[b] === LEG[a]) {
        const d = dist[a] + Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2]);
        if (d < 0.30 && d + 0.00001 < dist[b]) { dist[b] = d; queue.push(b); }
      }
    }
    const limb = new Float32Array(n);
    for (let i = 0; i < n; i++) if (LEG[i] > 0) {
      const outer = smooth(clamp((Math.abs(P[i * 3]) - Math.abs(PV[i * 3]) + 0.025) / 0.19, 0, 1));
      limb[i] = Math.min(smooth(clamp(dist[i] / 0.30, 0, 1)), outer);
    }
    g.setAttribute('aLimb', new T.BufferAttribute(limb, 1));
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
    MODEL.claws = makeClaws(feet, PIV);
    // 手のひら・足のひらの中心。造形は変えず、接地位置の計算に使う。
    MODEL.feet = [1, 2, 3, 4].map(leg => V(feet[leg].palm.x, 0.035, feet[leg].palm.z));
    MODEL.pivots = [1, 2, 3, 4].map(leg => toGame(...PIV[leg]));
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
    MODEL.mouth = muzzleOutline(toGame(0, -0.03, 0.93));
    MODEL.head = toGame(0, 0.03, 0.78);
    MODEL.neck = toGame(0, 0.03, 0.58);
    MODEL.mid = toGame(0, 0.03, 0.1);
    MODEL.tailTip = toGame(0, -0.13, -0.93);
  }

  // 形の曲げ方（描画側 GLSL と、眼球などの位置合わせ用 JS で同じ式を使う）
  const DEFORM_GLSL = `
    uniform float uT, uPhase, uWalk, uLook, uPitch, uTilt, uCurl, uStalk, uHappy, uBreathe, uDrop, uTailFat, uTailLift, uBend, uJaw, uWag, uWhiteFeet, uFeetFrom;
    uniform float uPlant;
    uniform vec3 uFootHome[4], uFootTarget[4];
    uniform vec4 uFootPlane[4];
    // 実物のレオパにあわせたしっぽ：長さは頭からお尻までの約0.8倍、いちばん太いところは首くらいの太さ
    #define TAIL_V -1.55
    #define TAIL_STRETCH 1.6
    #define TAIL_BASE 0.7
    varying float vLeoZ;
    varying float vLeoFeet;
    attribute float aLeg;
    attribute float aLimb;
    attribute vec3 aPivot;
    attribute float aCy;
    vec3 rotY(vec3 q, float a) { float c = cos(a), s = sin(a); return vec3(c * q.x + s * q.z, q.y, -s * q.x + c * q.z); }
    vec3 rotX(vec3 q, float a) { float c = cos(a), s = sin(a); return vec3(q.x, c * q.y - s * q.z, s * q.y + c * q.z); }
    vec3 rotZ(vec3 q, float a) { float c = cos(a), s = sin(a); return vec3(c * q.x - s * q.y, s * q.x + c * q.y, q.z); }
    vec3 rotAxis(vec3 q, vec3 axis, float angle) {
      float c = cos(angle), s = sin(angle);
      return q * c + cross(axis, q) * s + axis * dot(axis, q) * (1.0 - c);
    }
    vec3 alignAxis(vec3 q, vec3 from, vec3 to) {
      vec3 axis = cross(from, to);
      float len = length(axis);
      return len < 0.00001 ? q : rotAxis(q, axis / len, atan(len, dot(from, to)));
    }
    vec3 leoWarp(vec3 p, float leg, float cy) {
      if (p.z < TAIL_V) p.z = TAIL_V + (p.z - TAIL_V) * TAIL_STRETCH;
      // 坂をのぼるときは、しっぽが床にめりこまないように持ちあげる
      if (p.z < TAIL_V) p.y += (TAIL_V - p.z) / 2.93 * uTailLift;
      // あくび：下あごを下へひらく
      if (uJaw > 0.001 && leg < 0.5) {
        float jy = 0.335 + (2.15 - p.z) * 0.06;
        float jw = smoothstep(1.5, 1.78, p.z) * (1.0 - smoothstep(jy - 0.025, jy + 0.025, p.y));
        vec3 hinge = vec3(0.0, 0.36, 1.58);
        p = mix(p, hinge + rotX(p - hinge, uJaw), jw);
      }
      float hz = smoothstep(0.98, 1.3, p.z);
      if (hz > 0.0) {
        vec3 pv = vec3(0.0, 0.42, 1.08);
        vec3 q = rotZ(rotX(rotY(p - pv, uLook * 0.6 * hz), uPitch * hz), uTilt * hz);
        p = pv + q;
      }
      // しっぽの付け根の太さ（栄養をためている具合）
      // レオパらしい、栄養をためたぶりっと太いしっぽ（付け根から先へ、にんじんのように細くなる）
      if (leg < 0.5) {
        float tu = clamp((TAIL_V + 0.15 - p.z) / 3.0, 0.0, 1.0);
        float tf = smoothstep(0.0, 0.14, tu) * (1.0 - 0.92 * smoothstep(0.3, 1.0, tu));
        float tk = tf * (TAIL_BASE + uTailFat);
        p.x *= 1.0 + tk;
        p.y = cy + (p.y - cy) * (1.0 + tk * 0.35);
      }
      float body = 1.0 - smoothstep(0.8, 1.35, p.z);
      // 胴は肩と腰が逆向きに振れる定常波。頭の振れは小さくする。
      float w = uWalk * 0.095 * sin(uPhase) * clamp(-p.z * 0.8, -1.0, 1.0) * body;
      float tt = clamp((-1.4 - p.z) / 3.1, 0.0, 1.0);
      // 尾は歩行に遅れて動く。休憩中に絶えず振り続けない。
      w += tt * tt * (uCurl * 1.4 + uWalk * 0.16 * sin(uPhase - tt * 2.6) + uHappy * 0.025 * sin(uT * 3.0 - p.z));
      w += step(0.55, tt) * uStalk * 0.06 * sin(uT * 28.0 - p.z * 4.0);
      // 興味があるときの、ゆっくりしたしっぽのゆらゆら
      w += tt * tt * uWag * 0.35 * sin(uT * 3.2 - p.z * 1.2);
      // 曲がるときは、体が弓なりにしなる（頭は行き先へ、しっぽはあとからついてくる）
      float bz = p.z - 0.3;
      w += uBend * bz * bz * (bz > 0.0 ? 0.07 : 0.04);
      p.x += w;
      if (leg < 0.5) p.x *= 1.0 + uBreathe * 0.016 * (1.0 - smoothstep(0.8, 1.2, p.z)) * smoothstep(-1.6, -1.1, p.z);
      // 体を低くして休むときも、指先は接地を保ち、足首側で曲がる。
      float settle = leg > 0.5 ? smoothstep(0.035, 0.18, p.y) : 1.0;
      p.y -= uDrop > 0.0 ? uDrop * settle : uDrop;
      // 指先と爪は、休憩や歩行の姿勢でも床の下へ突き抜けない。
      if (leg > 0.5) p.y = max(0.002, p.y);
      return p;
    }
    vec3 leoDeform(vec3 p) {
      if (aLeg < 0.5) return leoWarp(p, aLeg, aCy);
      // WebGL 1 でも使えるように、配列の添字は定数にする。
      vec3 home = aLeg < 1.5 ? uFootHome[0] : aLeg < 2.5 ? uFootHome[1] : aLeg < 3.5 ? uFootHome[2] : uFootHome[3];
      vec3 target = aLeg < 1.5 ? uFootTarget[0] : aLeg < 2.5 ? uFootTarget[1] : aLeg < 3.5 ? uFootTarget[2] : uFootTarget[3];
      if (uPlant < 0.5) {
        float off = aLeg < 1.5 ? 0.0 : aLeg < 2.5 ? 0.5 : aLeg < 3.5 ? 0.58 : 0.08;
        float duty = aLeg < 2.5 ? 0.72 : 0.78;
        float q = fract(uPhase / 6.283185 + off);
        float swing = clamp((q - duty) / (1.0 - duty), 0.0, 1.0);
        float travel = q < duty ? mix(0.14, -0.14, q / duty) : mix(-0.14, 0.14, smoothstep(0.0, 1.0, swing));
        target = leoWarp(home, aLeg, aCy) + vec3(0.0, sin(swing * 3.14159) * 0.105, travel) * uWalk;
      }
      vec3 v0 = home - aPivot, v1 = target - aPivot;
      // 水平だけでなく上下にも脚を回し、足先の移動を前腕の引き伸ばしで埋めない。
      vec3 axis = cross(v0, v1);
      float len = length(axis);
      float angle = min(0.85, atan(len, dot(v0, v1)));
      axis = len > 0.00001 ? axis / len : vec3(0.0, 1.0, 0.0);
      float joint = aLimb;
      vec3 limb = aPivot + rotAxis(p - aPivot, axis, angle * joint);
      vec3 palm = aPivot + rotAxis(home - aPivot, axis, angle);
      vec3 result = leoWarp(limb, aLeg, aCy);
      vec3 palmWarp = leoWarp(palm, aLeg, aCy);
      // 指先はまとめて動かし、前腕・すね側で曲げる。爪にも同じ式を使う。
      float foot = (1.0 - smoothstep(0.08, 0.40, p.y)) * joint;
      result += (target - palmWarp) * foot;
      vec4 floorPlane = aLeg < 1.5 ? uFootPlane[0] : aLeg < 2.5 ? uFootPlane[1] : aLeg < 3.5 ? uFootPlane[2] : uFootPlane[3];
      // 手のひら・指・爪はまとまった形を保ち、床に沿う。足首より上で曲げる。
      vec3 palmOffset = p - home;
      if (uPlant > 0.5) palmOffset = alignAxis(palmOffset, vec3(0.0, 1.0, 0.0), floorPlane.xyz);
      result = mix(result, target + palmOffset, (1.0 - smoothstep(0.09, 0.36, p.y)) * joint);
      result = mix(leoWarp(p, 0.0, aCy), result, aLimb);
      if (uPlant > 0.5) {
        result += floorPlane.xyz * max(0.0, floorPlane.w - dot(floorPlane.xyz, result)) * smoothstep(0.2, 0.9, aLimb);
      }
      return result;
    }`;
  function deformPoint(p, U) {
    const q = p.clone();
    if (q.z < -1.55) q.z = -1.55 + (q.z + 1.55) * 1.6;
    const hz = smooth(clamp((q.z - 0.98) / 0.32, 0, 1));
    if (hz > 0) {
      const pv = V(0, 0.42, 1.08);
      q.sub(pv).applyEuler(new T.Euler(U.uPitch.value * hz, U.uLook.value * 0.6 * hz, U.uTilt.value * hz, 'ZXY')).add(pv);
    }
    const body = 1 - smooth(clamp((q.z - 0.8) / 0.55, 0, 1));
    let w = U.uWalk.value * 0.095 * Math.sin(U.uPhase.value) * clamp(-q.z * 0.8, -1, 1) * body;
    const tt = clamp((-1.4 - q.z) / 3.1, 0, 1);
    w += tt * tt * (U.uCurl.value * 1.4 + U.uWalk.value * 0.16 * Math.sin(U.uPhase.value - tt * 2.6) + U.uHappy.value * 0.025 * Math.sin(U.uT.value * 3 - q.z));
    if (U.uWag) w += tt * tt * U.uWag.value * 0.35 * Math.sin(U.uT.value * 3.2 - q.z * 1.2);
    const bz = q.z - 0.3;
    w += (U.uBend ? U.uBend.value : 0) * bz * bz * (bz > 0 ? 0.07 : 0.04);
    q.x += w;
    q.y -= U.uDrop.value;
    return q;
  }
  function deformMaterial(mat, U) {
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\n' + DEFORM_GLSL)
        .replace('#include <begin_vertex>', 'vLeoZ = position.z;\n// 手足（付け根から先）だけを白くする目印（ギャラクシー）\nvLeoFeet = uWhiteFeet * step(0.5, aLeg) * smoothstep(uFeetFrom, uFeetFrom + 0.18, length(position.xz - aPivot.xz));\nvec3 transformed = leoDeform(vec3(position));');
      // 脱皮：まだ脱いでいない古い皮を白っぽく。頭から少しずつ脱いでいく（境目は皮がめくれて明るく）
      if (sh.fragmentShader.includes('#include <dithering_fragment>')) {
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform float uShedOn, uShedEdge;\nvarying float vLeoZ, vLeoFeet;')
          .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.90, 0.68, 0.73), vLeoFeet);')
          .replace('#include <dithering_fragment>', `#include <dithering_fragment>
            float oldSkin = uShedOn * (1.0 - smoothstep(uShedEdge - 0.1, uShedEdge + 0.1, vLeoZ));
            gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.80, 0.80, 0.77) + gl_FragColor.rgb * 0.22, oldSkin * 0.62);
            float roll = uShedOn * step(uShedEdge, 1.7) * max(0.0, 1.0 - abs(vLeoZ - uShedEdge) / 0.07);
            gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.97, 0.96, 0.93), roll * 0.7);`);
      }
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
    const pal = A.colors(look.genes, look.tang, look.stage, look.poly);
    const hi = quality !== 'photo';
    const W = hi ? 1024 : 768, H = hi ? 1536 : 1152;
    // 描いた模様は覚えておき、同じ子に切りかえたときは描き直さない
    const melK = Math.min(1, Math.max(0, ((look.poly && look.poly.mel) || 0) - 30) / 60);
    const colorTex = cachedTex(skinCache, 'skin|' + W + '|' + lookKey(look), () => canvasTexture(skinCanvas(pal, Object.assign({}, look, { model: true }), W, H), { srgb: true }), 8);
    colorTex.wrapS = T.RepeatWrapping;
    const bump = bumpTexture(W, H);
    bump.wrapS = T.RepeatWrapping;
    const rough = roughTexture();
    rough.wrapS = T.RepeatWrapping;
    const shed = false;
    const U = {};
    for (const k of ['uT', 'uPhase', 'uWalk', 'uLook', 'uPitch', 'uTilt', 'uCurl', 'uStalk', 'uHappy', 'uBreathe', 'uDrop', 'uTailFat', 'uTailLift', 'uBend', 'uJaw', 'uWag', 'uShedOn', 'uShedEdge', 'uWhiteFeet', 'uFeetFrom']) U[k] = { value: 0 };
    U.uPlant = { value: 0 };
    U.uFootHome = { value: MODEL.feet.map(p => p.clone()) };
    U.uFootTarget = { value: MODEL.feet.map(p => p.clone()) };
    U.uFootPlane = { value: MODEL.feet.map(() => new T.Vector4(0, 1, 0, 0.002)) };
    // 脱皮中は古い皮で全体が白っぽい（ケースの中では少しずつ脱いでいく）
    U.uShedOn.value = look.shed ? 1 : 0; U.uShedEdge.value = 9;
    // ギャラクシーは手足ぜんぶ、エクリプスは指先だけ白く抜ける
    const eclFeet = look.genes && look.genes.ecl === 2 && !pal.galaxy && look.stage !== 'baby' && pal.pattern;
    U.uWhiteFeet.value = pal.galaxy && look.stage !== 'baby' ? 1 : eclFeet ? 0.85 : 0;
    U.uFeetFrom.value = pal.galaxy ? 0.06 : look.genes.snow === 2 ? 0.14 : 0.3;
    U.uTailFat.value = look.fat || 0;
    const skinMat = deformMaterial(phys('#ffffff', {
      map: colorTex, bumpMap: bump, bumpScale: 0.006, roughnessMap: rough, roughness: shed ? 0.95 : 0.6,
      clearcoat: shed ? 0 : 0.12, clearcoatRoughness: 0.6,
      emissive: new T.Color('#ffffff'), emissiveMap: shed ? null : colorTex, emissiveIntensity: shed ? 0.22 : 0.07,
      sheen: new T.Color('#3a2a18'), envMapIntensity: 0.3,
    }), U);
    skinMat.color.setScalar(0.78);
    if (melK > 0) skinMat.sheen = new T.Color('#3a2a18').multiplyScalar(1 - melK);
    const mesh = new T.Mesh(MODEL.geo, skinMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.customDepthMaterial = deformMaterial(new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking }), U);
    const rootG = new T.Group();
    rootG.add(mesh);

    // 小さな爪。体の模様を変更せず、脚と同じ変形で追従させる。
    const clawU = Object.assign({}, U, { uWhiteFeet: { value: 0 } });
    const clawMesh = new T.Mesh(MODEL.claws, deformMaterial(phys('#E6DECE', { roughness: 0.38, clearcoat: 0.15 }), clawU));
    clawMesh.frustumCulled = false;
    rootG.add(clawMesh);

    // 目：虹彩＋濡れた角膜＋キャッチライト、まばたき用のまぶた
    const eyeKey = [pal.eye, pal.pupil, pal.solid, (look.seed || 0) % 7].join('|');
    const eyeTex = [false, true].map(d => cachedTex(irisCache, eyeKey + '|' + d, () => canvasTexture(irisCanvas(pal, d, (look.seed || 0) % 7), { srgb: true }), 24));
    const eyeMat = phys('#ffffff', { map: eyeTex[0], roughness: shed ? 0.5 : 0.3, clearcoat: 1, clearcoatRoughness: shed ? 0.6 : 0.04 });
    const corneaMat = phys('#ffffff', { transparent: true, opacity: look.shed ? 0.4 : 0.1, roughness: 0, clearcoat: 1, clearcoatRoughness: 0, envMapIntensity: 1.6, depthWrite: false });
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
    // あくびで見える口の中
    const mouthIn = new T.Mesh(new T.SphereGeometry(1, 20, 12), phys('#B04A5E', { roughness: 0.5 }));
    mouthIn.scale.setScalar(0.001);
    rootG.add(mouthIn);
    rootG.traverse(o => { if (o.isMesh && o !== mesh) o.castShadow = false; });
    const gk = {
      glb: true, root: rootG, mesh, clawMesh, U, eyes, lids, eyeMat, corneaMat, eyeTex, bones, mouth, legs: [],
      owned: [], dilated: false, tongue, mouthIn,
    };
    pose(gk, restPose());
    return gk;
  }

  function poseGLB(gk, P) {
    const U = gk.U;
    U.uT.value = P.t; U.uPhase.value = P.phase; U.uWalk.value = P.walk; U.uLook.value = P.look;
    U.uPitch.value = P.pitch - 0.05; U.uTilt.value = P.tilt; U.uCurl.value = Math.min(P.curl, 1) * 0.9; U.uStalk.value = P.stalk;
    U.uHappy.value = P.happy; U.uBreathe.value = P.breathe; U.uDrop.value = P.drop - 0.04; U.uBend.value = P.bend || 0; U.uJaw.value = (P.jaw || 0) * 0.3; U.uWag.value = P.wag || 0;
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
      // 舌の根もとは口の中に残したまま、先だけを前へ出す（口から離れて浮かないように）
      const fwd = new T.Vector3(0, -0.12 - 0.15 * tg, 1).applyQuaternion(headQ).normalize();
      const hz = 0.05 + 0.075 * tg;
      gk.tongue.position.copy(gk.mouth.position).addScaledVector(fwd, hz - 0.07);
      gk.tongue.quaternion.copy(headQ);
      gk.tongue.rotateX(0.12 + 0.15 * tg);
      gk.tongue.scale.set(0.06, 0.024, hz);
    } else gk.tongue.scale.setScalar(0.001);
    if (gk.mouthIn) {
      const j = P.jaw || 0;
      if (j > 0.02) {
        const off = new T.Vector3(0, -0.035 - 0.05 * j, -0.15).applyQuaternion(headQ);
        gk.mouthIn.position.copy(gk.mouth.position).add(off);
        gk.mouthIn.quaternion.copy(headQ);
        gk.mouthIn.scale.set(0.115, 0.025 + 0.095 * j, 0.21);
      } else gk.mouthIn.scale.setScalar(0.001);
    }
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
  const isCricket = k => k === 'cricket' || k === 'cricketS';
  function buildFood(kind) {
    const g = new T.Group();
    if (kind === 'cricketS') {
      // 小さいコオロギ
      const c = buildFood('cricket');
      c.scale.setScalar(0.62);
      g.add(c);
    } else if (kind === 'paste') {
      // 練り餌：ぽってりした小さなかたまり
      const m = phys('#B5793F', { roughness: 0.55, clearcoat: 0.25 });
      const b = new T.Mesh(new T.SphereGeometry(0.17, 16, 10), m); b.scale.set(1, 0.55, 1); b.position.y = 0.06; g.add(b);
      const t = new T.Mesh(new T.SphereGeometry(0.09, 12, 8), m); t.position.set(0.04, 0.13, -0.02); t.scale.set(1, 0.7, 1); g.add(t);
    } else if (kind === 'cricket') {
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
  // カルシウムをまぶしたえさは、白い粉をうっすらまとう
  function dustFood(g) {
    g.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.lerp(new T.Color('#EEE9DC'), 0.5); o.material.roughness = 0.85; o.material.clearcoat = 0; } });
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
  // 画像テクスチャ（URL ごとに1回だけ読む。読めたら cb を呼ぶ）
  const imgTexCache = {};
  function imgTex(url, cb) {
    let e = imgTexCache[url];
    if (!e) {
      e = imgTexCache[url] = { tex: null, cbs: [], fail: false };
      new T.TextureLoader().load(url, t => { t.encoding = T.sRGBEncoding; e.tex = t; e.cbs.splice(0).forEach(f => f(t)); }, undefined, () => { e.fail = true; e.cbs.length = 0; });
    }
    if (e.tex) cb(e.tex); else if (!e.fail) e.cbs.push(cb);
    return e;
  }
  const imgTexReady = urls => urls.every(u => { const e = imgTexCache[u]; return !u || (e && (e.tex || e.fail)); });
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
  // ---- 家具の3Dモデル集（Quaternius「Stylized Nature MegaKit」CC0 から必要なものだけまとめたもの）
  const KIT = { ready: null, data: null, buf: null, tex: {}, mats: {} };
  function loadKit(url) {
    if (!KIT.ready) {
      const embedded = root.LEOPA_KIT_B64 ? Promise.resolve(Uint8Array.from(atob(root.LEOPA_KIT_B64), c => c.charCodeAt(0)).buffer) : null;
      KIT.ready = (embedded || fetch(url).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }))
        .then(buf => {
          const dv = new DataView(buf);
          if (dv.getUint32(0, true) !== 0x54494B4C) throw new Error('bad kit');
          const jl = dv.getUint32(4, true);
          KIT.data = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, jl)));
          KIT.base = 8 + jl; KIT.buf = buf;
          // 画像を先に全部読みこんでから使えるようにする（読みこみ途中の白い家具が出ないように）
          return Promise.all(KIT.data.images.map((im, i) => new Promise(res => {
            const url = URL.createObjectURL(new Blob([new Uint8Array(buf, KIT.base + im.data[0], im.data[1])], { type: im.mime }));
            const img = new Image();
            img.onload = () => { const t = new T.Texture(img); t.encoding = T.sRGBEncoding; t.flipY = false; t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 4; t.needsUpdate = true; KIT.tex[i] = t; res(); };
            img.onerror = () => res();
            img.src = url;
          })));
        })
        .then(() => { photoCache.clear(); itemCache.clear(); return true; })
        .catch(() => { KIT.data = null; return false; });
    }
    return KIT.ready;
  }
  const kitHas = name => !!(KIT.data && KIT.tex && KIT.data.items[name]);
  function kitMat(name) {
    if (KIT.mats[name]) return KIT.mats[name];
    const m = KIT.data.mats[name] || {};
    let map = m.img != null ? KIT.tex[m.img] : null;
    if (!map && /Bark|Wood/i.test(name)) {
      // 樹皮のテクスチャは同梱されていないので、白っぽい流木の木肌を描く
      const c = document.createElement('canvas'); c.width = 256; c.height = 512;
      const ctx = c.getContext('2d'); const r = prng(41);
      ctx.fillStyle = '#C9B8A0'; ctx.fillRect(0, 0, 256, 512);
      for (let i = 0; i < 120; i++) { ctx.strokeStyle = `rgba(${r() < 0.6 ? '110,90,70' : '235,225,210'},${0.15 + r() * 0.3})`; ctx.lineWidth = 1 + r() * 3; const x = r() * 256; ctx.beginPath(); ctx.moveTo(x, 0); for (let y = 0; y <= 512; y += 32) ctx.lineTo(x + Math.sin(y / 50 + i) * 4, y); ctx.stroke(); }
      map = new T.CanvasTexture(c); map.encoding = T.sRGBEncoding; map.wrapS = map.wrapT = T.RepeatWrapping;
    }
    if (m.glass) {
      const mat = phys('#E8F0F4', { transparent: true, opacity: 0.18, roughness: 0.05, clearcoat: 1, depthWrite: false });
      mat.userData.shared = true;
      return (KIT.mats[name] = mat);
    }
    if (m.color) {
      const mat = new T.MeshStandardMaterial({ roughness: 0.75, metalness: 0 });
      mat.color.setRGB(m.color[0], m.color[1], m.color[2]);
      mat.userData.shared = true;
      return (KIT.mats[name] = mat);
    }
    if (m.nearest && map) { map.magFilter = T.NearestFilter; map.minFilter = T.NearestFilter; map.generateMipmaps = false; map.needsUpdate = true; }
    if (name === 'Skin' || name === 'Metal') {
      const mat = name === 'Skin' ? phys('#B87556', { roughness: 0.6, side: T.DoubleSide }) : phys('#CDD2D7', { metalness: 0.9, roughness: 0.22, side: T.DoubleSide });
      mat.userData.shared = true;
      return (KIT.mats[name] = mat);
    }
    if (name === 'Stone') {
      const mat = phys('#7A746A', { roughness: 0.92, bumpMap: sandTex(), bumpScale: 0.04, side: T.DoubleSide });
      mat.userData.shared = true;
      return (KIT.mats[name] = mat);
    }
    if (name === 'Terracotta') {
      const mat = phys('#A44D28', { roughness: 0.88, bumpMap: sandTex(), bumpScale: 0.025, side: T.DoubleSide });
      mat.userData.shared = true;
      return (KIT.mats[name] = mat);
    }
    const mat = new T.MeshStandardMaterial({ color: '#ffffff', map, roughness: 0.92, metalness: 0, alphaTest: m.alpha ? 0.5 : 0, side: m.alpha ? T.DoubleSide : T.FrontSide });
    mat.userData.shared = true;
    KIT.mats[name] = mat;
    return mat;
  }
  const kitGeo = {};
  // 名前の家具を作る。fit：横幅（XZの大きいほう）をこの長さに、h があれば高さを h 倍に
  function buildKit(name, fit, opt) {
    const it = KIT.data.items[name];
    const g = new T.Group();
    const k = fit / Math.max(it.size[0], it.size[2]);
    it.prims.forEach((p, i) => {
      const key = name + i;
      if (!kitGeo[key]) {
        const geo = new T.BufferGeometry();
        const f32 = r => new Float32Array(KIT.buf.slice(KIT.base + r[0], KIT.base + r[0] + r[1]));
        geo.setAttribute('position', new T.BufferAttribute(f32(p.pos), 3));
        if (p.nrm) geo.setAttribute('normal', new T.BufferAttribute(f32(p.nrm), 3));
        if (p.uv) geo.setAttribute('uv', new T.BufferAttribute(f32(p.uv), 2));
        const ib = KIT.buf.slice(KIT.base + p.idx[0], KIT.base + p.idx[0] + p.idx[1]);
        geo.setIndex(new T.BufferAttribute(p.i32 ? new Uint32Array(ib) : new Uint16Array(ib), 1));
        if (!p.nrm) geo.computeVertexNormals();
        geo.computeBoundingSphere();
        geo.userData.shared = true;
        kitGeo[key] = geo;
      }
      const m = new T.Mesh(kitGeo[key], kitMat(p.mat));
      m.castShadow = true; m.receiveShadow = true;
      g.add(m);
    });
    g.scale.set(k, k * ((opt && opt.h) || 1), k);
    return g;
  }
  function doorMesh(w, h) {
    const m = new T.Mesh(new T.CircleGeometry(0.62, 32), new T.MeshBasicMaterial({
      map: gradientCanvasTexture([[0, 'rgba(18,14,10,1)'], [0.7, 'rgba(30,24,18,.95)'], [1, 'rgba(30,24,18,0)']]), transparent: true, depthWrite: false,
    }));
    m.scale.set(w, h, 1);
    return m;
  }
  const OLD_DECOR = {
    rock: {
      name: '岩シェルター', price: 30, r: 1.45, shelter: { x: 0.25, z: 2.75 },
      desc: '中にもぐって眠れる。定番のかくれ家',
      build() {
        const g = new T.Group();
        const rock = new T.Mesh(rockGeometry(), phys('#6E6358', { roughness: 0.95, bumpMap: sandTex(), bumpScale: 0.03 }));
        rock.scale.set(1.75, 1.0, 1.4);
        rock.position.y = 0.1;
        g.add(rock);
        return g;
      },
    },
    wet: {
      name: 'ウェットシェルター', price: 40, r: 1.15, shelter: { x: 0, z: 2.35 },
      desc: '上に水をためて中をしっとり。脱皮の味方',
      build() {
        const g = new T.Group();
        const dome = new T.Mesh(new T.SphereGeometry(1.05, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), phys('#8E9A94', { roughness: 0.4, clearcoat: 0.5 }));
        dome.scale.set(1, 0.72, 1);
        const pool = new T.Mesh(new T.CircleGeometry(0.42, 32), phys('#6FAECB', { roughness: 0.02, clearcoat: 1 }));
        pool.rotation.x = -Math.PI / 2;
        pool.position.y = 0.745;
        g.add(dome, pool);
        return g;
      },
    },
    cork: {
      name: 'コルクバーク', price: 25, r: 1.2, shelter: { x: 0, z: 2.3 },
      desc: '木の皮のトンネル。自然な雰囲気に',
      build() {
        const g = new T.Group();
        // 半分に割った筒を、入口が正面（+Z）に来るように寝かせる
        const geo = new T.CylinderGeometry(0.8, 0.8, 2.3, 32, 1, true, -Math.PI / 2, Math.PI);
        geo.rotateX(-Math.PI / 2);
        const bark = new T.Mesh(geo, phys('#6B4A30', { roughness: 0.95, bumpMap: sandTex(), bumpScale: 0.08, side: T.DoubleSide }));
        g.add(bark);
        return g;
      },
    },
    log: {
      name: '流木', price: 20, r: 1.1,
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
      name: '平たい石', price: 15, r: 0.85,
      desc: 'ひなたぼっこ用の石。ホット側にどうぞ',
      build() {
        const s = new T.Mesh(rockGeometry(), phys('#8C857C', { roughness: 0.85, bumpMap: sandTex(), bumpScale: 0.03 }));
        s.scale.set(0.95, 0.22, 0.75);
        return s;
      },
    },
    plant: {
      name: '多肉植物', price: 13, r: 0.55,
      desc: '小さなエケベリア。ケースに彩りを',
      build: () => buildPlant(),
    },
    dish: {
      name: '水入れ', price: 10, r: 0.95,
      desc: 'いつでも新鮮なお水を',
      build() {
        const g = new T.Group();
        const dish = new T.Mesh(new T.CylinderGeometry(0.85, 0.78, 0.28, 40), phys('#E8E1D2', { roughness: 0.35, clearcoat: 0.6 }));
        dish.position.y = 0.14;
        const water = new T.Mesh(new T.CircleGeometry(0.7, 40), phys('#6FAECB', { roughness: 0.02, clearcoat: 1, transparent: true, opacity: 0.85 }));
        water.rotation.x = -Math.PI / 2;
        water.position.y = 0.285;
        water.name = 'water'; water.userData.r = 0.7;
        g.add(dish, water);
        return g;
      },
    },
  };
  const OLD = OLD_DECOR;
  // 3Dモデル集が読めたらそれを、読めなかったときは手作りの形を使う
  function kitOr(name, fit, opt, fallback) { return kitHas(name) ? buildKit(name, fit, opt) : fallback(); }
  // 水入れ：石をくりぬいた器に水を張る
  // 同じ形で色ちがいを作るための材質（作ったものは使い回す）
  const variantMats = {};
  function variantMat(key, color, opt) {
    if (!variantMats[key]) { const m = phys(color, Object.assign({ roughness: 0.9, bumpMap: sandTex(), bumpScale: 0.03, side: T.DoubleSide }, opt || {})); m.userData.shared = true; variantMats[key] = m; }
    return variantMats[key];
  }
  function paint(g, mat) { if (mat) g.traverse(o => { if (o.isMesh) o.material = mat; }); return g; }
  const BASIN_V = {
    dish: null,
    dish2: { key: 'sandstone', color: '#94502E', opt: { roughness: 0.95, bumpScale: 0.05 }, w: 2.1, h: 1.0 },
    dish3: { key: 'marble', color: '#E9E6E0', opt: { roughness: 0.25, clearcoat: 0.8, bumpScale: 0.006 }, w: 1.8, h: 1.15 },
  };
  function stoneBasin(t) {
    if (!kitHas('Basin')) return OLD_DECOR.dish.build();
    const v = BASIN_V[t] || null;
    const g = new T.Group(), W = (v && v.w) || 2.0;
    const body = paint(buildKit('Basin', W, { h: (v && v.h) || 1 }), v && variantMat(v.key, v.color, v.opt));
    const it = KIT.data.items.Basin, k = W / Math.max(it.size[0], it.size[2]);
    const water = new T.Mesh(new T.CircleGeometry(it.size[2] * k * 0.42, 40), phys('#6FAECB', { roughness: 0.02, clearcoat: 1, transparent: true, opacity: 0.85 }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(-W * 0.06, it.size[1] * k * ((v && v.h) || 1) * 0.72, 0);
    water.name = 'water'; water.userData.r = it.size[2] * k * 0.42;
    g.add(body, water);
    return g;
  }
  // ウェットシェルター：テラコッタのトンネル。両はしの穴から中に入れる。上の受け皿に水をためる
  const WET_FIT = 3.0;
  const WET_V = {
    wet: null,
    wet2: { key: 'glazeWhite', color: '#F2EFE8', opt: { roughness: 0.22, clearcoat: 1, bumpScale: 0.004 } },
    wet3: { key: 'charcoal', color: '#24211F', opt: { roughness: 0.75, bumpScale: 0.04 } },
  };
  function wetShelter(t) {
    if (!kitHas('Wet')) return OLD_DECOR.wet.build();
    const v = WET_V[t] || null;
    const g = new T.Group();
    const body = paint(buildKit('Wet', WET_FIT), v && variantMat(v.key, v.color, v.opt));
    const it = KIT.data.items.Wet, k = WET_FIT / Math.max(it.size[0], it.size[2]);
    const water = new T.Mesh(new T.PlaneGeometry(it.size[0] * k * 0.52, it.size[2] * k * 0.66), phys('#6FAECB', { roughness: 0.02, clearcoat: 1, transparent: true, opacity: 0.85 }));
    water.rotation.x = -Math.PI / 2;
    water.position.y = it.size[1] * k * 0.9;
    g.add(body, water);
    return g;
  }
  // ユーザー作成の岩型。色ちがいも同じ形を使う。
  const ROCK_WET_COLORS = { wetRockSand: '#B9A080', wetRockRed: '#995D45', wetRockGray: '#777B7A' };
  let rockWetWaterGeo = null;
  function rockWetWater(body) {
    if (!rockWetWaterGeo) {
      // くぼみの内側に収まる水面。縁の形に合わせ、岩の外にはみ出さない。
      body.updateMatrixWorld(true);
      const cx = -0.28, cz = -0.02, y = 1.55, count = 64;
      const points = [cx, y, cz], indices = [];
      const ray = new T.Raycaster(), down = V(0, -1, 0);
      for (let i = 0; i < count; i++) {
        const angle = i / count * Math.PI * 2, dx = Math.cos(angle), dz = Math.sin(angle);
        let lo = 0, hi = 1.8;
        for (let n = 0; n < 10; n++) {
          const r = (lo + hi) / 2;
          ray.set(V(cx + dx * r, 3, cz + dz * r), down);
          const hit = ray.intersectObject(body, true)[0];
          if (hit && hit.point.y < y - 0.01) lo = r; else hi = r;
        }
        points.push(cx + dx * lo, y, cz + dz * lo);
        indices.push(0, (i + 1) % count + 1, i + 1);
      }
      rockWetWaterGeo = new T.BufferGeometry();
      rockWetWaterGeo.setAttribute('position', new T.Float32BufferAttribute(points, 3));
      rockWetWaterGeo.setIndex(indices);
      rockWetWaterGeo.computeVertexNormals();
      rockWetWaterGeo.userData.shared = true;
    }
    const mat = phys('#5D9CB6', { roughness: 0.04, clearcoat: 1, transparent: true, opacity: 0.8, depthWrite: false });
    mat.color.convertSRGBToLinear();
    const water = new T.Mesh(rockWetWaterGeo, mat);
    water.name = 'wetWater';
    return water;
  }
  function rockWetShelter(t) {
    const key = 'rockWet-' + t;
    if (!variantMats[key]) {
      // このモデルの色はsRGBで指定。線形に直して白飛びを抑える。
      const mat = variantMat(key, ROCK_WET_COLORS[t], { roughness: 0.96, bumpScale: 0.035 });
      mat.color.convertSRGBToLinear();
    }
    const body = paint(kitOr('UserRockWet', 3.4, null, () => OLD_DECOR.wet.build()), variantMats[key]);
    if (kitHas('UserRockWet')) body.rotation.y = Math.PI / 2; // 入口をケースの正面にそろえる
    const g = new T.Group(); // 配置時の回転とは別に、モデルの向きを保つ
    g.add(body);
    if (kitHas('UserRockWet')) g.add(rockWetWater(body));
    return g;
  }
  const DECOR = {
    rock: {
      name: '岩（赤茶）', price: 30, r: 1.45, climb: true,
      desc: '赤茶色の大きな岩。レオパがよじ登って遊びます',
      build: () => kitOr('Rock_Medium_1_Desert', 3.3, { h: 0.62 }, () => OLD_DECOR.rock.build()),
    },
    rock2: {
      name: '岩（苔むし）', price: 30, r: 1.4, climb: true,
      desc: '苔がついた灰色の岩。上でひと休みすることも',
      build: () => kitOr('Rock_Medium_2', 3.2, { h: 0.72 }, () => OLD_DECOR.rock.build()),
    },
    wet: {
      name: 'ウェットシェルター', price: 40, r: 1.3, shelter: { x: 0, z: 0 }, tunnel: true,
      desc: 'テラコッタのトンネル型。上に水をためて中をしっとり。両はしの穴から出入りできます',
      build: () => wetShelter('wet'),
    },
    wet2: {
      name: 'ウェットシェルター（白い陶器）', price: 45, r: 1.3, shelter: { x: 0, z: 0 }, tunnel: true,
      desc: 'つやのある白い陶器。明るく清潔な雰囲気に',
      build: () => wetShelter('wet2'),
    },
    wet3: {
      name: 'ウェットシェルター（炭焼き）', price: 45, r: 1.3, shelter: { x: 0, z: 0 }, tunnel: true,
      desc: '黒い炭焼きの素焼き。落ち着いた大人っぽい雰囲気に',
      build: () => wetShelter('wet3'),
    },
    wetRockSand: {
      name: '岩ウェットシェルター（砂色）', price: 50, r: 1.55, shelter: { x: 0, z: 0 }, photoElevation: 0.8,
      desc: '砂色の岩の隠れ家。くぼみに水をためて中をしっとり。中にもぐって眠れます',
      build: () => rockWetShelter('wetRockSand'),
    },
    wetRockRed: {
      name: '岩ウェットシェルター（赤茶）', price: 50, r: 1.55, shelter: { x: 0, z: 0 }, photoElevation: 0.8,
      desc: '赤茶色の岩の隠れ家。くぼみに水をためて中をしっとり。中にもぐって眠れます',
      build: () => rockWetShelter('wetRockRed'),
    },
    wetRockGray: {
      name: '岩ウェットシェルター（灰色）', price: 50, r: 1.55, shelter: { x: 0, z: 0 }, photoElevation: 0.8,
      desc: '灰色の岩の隠れ家。くぼみに水をためて中をしっとり。中にもぐって眠れます',
      build: () => rockWetShelter('wetRockGray'),
    },
    log: {
      name: '枯れ木（ひろがり）', price: 20, r: 0.9,
      desc: '枝が大きく広がった白い枯れ木。ケースの主役に',
      build: () => kitOr('DeadTree_1', 1.75, null, () => OLD_DECOR.log.build()),
    },
    log2: {
      name: '枯れ木（すらり）', price: 20, r: 0.85,
      desc: 'すらりと背の高い枯れ木',
      build: () => kitOr('DeadTree_2', 1.6, null, () => OLD_DECOR.log.build()),
    },
    stone: {
      name: '石だたみ（まる）', price: 15, r: 1.0, climb: true,
      desc: '丸い石を並べた床。ひなたぼっこにも',
      build: () => kitOr('RockPath_Round_Wide', 2.1, { h: 1.5 }, () => OLD_DECOR.stone.build()),
    },
    stone2: {
      name: '石だたみ（しかく）', price: 15, r: 1.0, climb: true,
      desc: '四角い石を並べた床。ひなたぼっこにも',
      build: () => kitOr('RockPath_Square_Wide', 2.0, { h: 1.2 }, () => OLD_DECOR.stone.build()),
    },
    plant: {
      name: 'アガベ風の植物', price: 13, r: 0.6,
      desc: 'とがった葉がかっこいい、乾燥地の植物',
      build: () => kitOr('Plant_1', 1.3, null, () => OLD_DECOR.plant.build()),
    },
    plant2: {
      name: 'シダ', price: 13, r: 0.8, soft: true,
      desc: 'ふんわり広がる緑のシダ',
      build: () => kitOr('Fern_1', 1.9, { h: 1.2 }, () => OLD_DECOR.plant.build()),
    },
    grass: {
      name: 'かれ草', price: 8, r: 0.55, soft: true,
      desc: '金色のかれ草。荒野の雰囲気に',
      build: () => kitOr('Grass_Wispy_Tall', 1.2, { h: 0.85 }, () => OLD_DECOR.plant.build()),
    },
    grass2: {
      name: '青い草', price: 8, r: 0.45, soft: true,
      desc: 'すっと伸びた緑の草',
      build: () => kitOr('Grass_Common_Tall', 0.85, { h: 0.75 }, () => OLD_DECOR.plant.build()),
    },
    flower: {
      name: '赤い花', price: 12, r: 0.55, soft: true,
      desc: 'ケースがぱっと明るくなる赤い花',
      build: () => kitOr('Flower_3_Group', 1.05, { h: 0.8 }, () => OLD_DECOR.plant.build()),
    },
    flower2: {
      name: '黄色い花', price: 12, r: 0.55, soft: true,
      desc: 'あざやかな黄色の花',
      build: () => kitOr('Flower_4_Group', 1.1, { h: 0.7 }, () => OLD_DECOR.plant.build()),
    },
    mush: {
      name: '白いきのこ', price: 10, r: 0.4,
      desc: 'ちょこんと生えた小さなきのこ（飾りです）',
      build: () => kitOr('Mushroom_Common', 0.75, null, () => OLD_DECOR.plant.build()),
    },
    mush2: {
      name: 'オレンジのきのこ', price: 10, r: 0.55,
      desc: '重なりあって生えるきのこ（飾りです）',
      build: () => kitOr('Mushroom_Laetiporus', 1.1, null, () => OLD_DECOR.plant.build()),
    },
    // 恐竜時代ケージに合う飾り（Quaternius「Animated Dinosaur Pack」CC0）
    trex: {
      name: '恐竜フィギュア（Tレックス）', price: 25, r: 0.9,
      desc: '恐竜の王さま。恐竜時代ケージにぴったり',
      build: () => kitOr('Trex', 2.6, null, () => OLD_DECOR.rock.build()),
    },
    trike: {
      name: '恐竜フィギュア（トリケラトプス）', price: 25, r: 0.9,
      desc: '3本の角がかっこいい草食恐竜',
      build: () => kitOr('Triceratops', 2.4, null, () => OLD_DECOR.rock.build()),
    },
    stego: {
      name: '恐竜フィギュア（ステゴサウルス）', price: 25, r: 0.9,
      desc: '背中の板とトゲが目印',
      build: () => kitOr('Stegosaurus', 2.5, null, () => OLD_DECOR.rock.build()),
    },
    para: {
      name: '恐竜フィギュア（パラサウロロフス）', price: 25, r: 0.8,
      desc: '赤いトサカがおしゃれな恐竜',
      build: () => kitOr('Parasaurolophus', 2.2, null, () => OLD_DECOR.rock.build()),
    },
    // おかしの家ケージに合う飾り（Kenney「Food Kit」CC0）
    donut: {
      name: 'ドーナツ', price: 15, r: 0.9, climb: true,
      desc: 'スプリンクルつきの大きなドーナツ。上に乗れます',
      build: () => kitOr('Donut', 1.9, null, () => OLD_DECOR.stone.build()),
    },
    cookie: {
      name: 'サンドクッキー', price: 15, r: 0.95, climb: true,
      desc: 'チョコのサンドクッキー。上でひと休み',
      build: () => kitOr('Cookie', 2.0, null, () => OLD_DECOR.stone.build()),
    },
    cake: {
      name: 'バースデーケーキ', price: 20, r: 1.0,
      desc: 'ろうそくの立ったケーキ。お祝いの気分に',
      build: () => kitOr('Cake', 2.1, null, () => OLD_DECOR.stone.build()),
    },
    ginger: {
      name: 'ジンジャーブレッドマン', price: 15, r: 1.0, climb: true,
      desc: '床に寝ころぶ大きなクッキー。上を歩けます',
      build: () => kitOr('Gingerbread', 2.3, { h: 3 }, () => OLD_DECOR.stone.build()),
    },
    dish: {
      name: '水入れ', price: 10, r: 1.0, climb: true, drink: true,
      desc: '石をくりぬいた水入れ。いつでも新鮮なお水を',
      build: () => stoneBasin('dish'),
    },
    dish2: {
      name: '水入れ（赤い砂岩）', price: 12, r: 1.05, climb: true, drink: true,
      desc: '赤茶色の砂岩の水入れ。荒野ふうのケースに',
      build: () => stoneBasin('dish2'),
    },
    dish3: {
      name: '水入れ（白い大理石）', price: 15, r: 0.95, climb: true, drink: true,
      desc: 'つるっとした白い大理石の水入れ。上品な雰囲気に',
      build: () => stoneBasin('dish3'),
    },
  };
  // Poly Haven（CC0）の家具を、別の色にぬりなおす（金の像など）
  function kitTint(name, fit, opt, mat, fallback) {
    const g = kitOr(name, fit, opt, fallback);
    if (kitHas(name)) g.traverse(m => { if (m.isMesh) m.material = mat; });
    return g;
  }
  function kitMetal(g, metal, rough) {
    g.traverse(m => { if (m.isMesh && m.material.isMeshStandardMaterial) { m.material.metalness = metal; m.material.roughness = rough; m.material.needsUpdate = true; } });
    return g;
  }
  let luxGold = null;
  const goldMat = () => luxGold || (luxGold = Object.assign(phys('#C9971E', { metalness: 0.85, roughness: 0.28, clearcoat: 1 }), { userData: { shared: true } }));
  // ショー限定（夜）：コードで作る天体・宝石の飾り
  function amethystCluster() {
    const g = new T.Group();
    const rock = new T.Mesh(new T.DodecahedronGeometry(0.9, 0), phys('#3E3846', { roughness: 0.9 }));
    rock.scale.set(1.3, 0.42, 1); rock.position.y = 0.12; g.add(rock);
    const mat = phys('#6A1FC8', { roughness: 0.08, clearcoat: 1, emissive: '#4A0FA8', emissiveIntensity: 0.6, transparent: true, opacity: 0.92 });
    for (const [x, h, rad, rz, rx] of [[0, 1.6, 0.32, 0, 0], [0.45, 1.2, 0.26, 0.35, 0.2], [-0.5, 1.1, 0.25, -0.4, -0.1], [0.2, 0.9, 0.22, 0.2, -0.5], [-0.2, 0.8, 0.2, -0.25, 0.5], [0.7, 0.7, 0.18, 0.6, -0.3]]) {
      const c = new T.Group();
      const body = new T.Mesh(new T.CylinderGeometry(rad, rad, h, 6), mat); body.position.y = h / 2;
      const tip = new T.Mesh(new T.ConeGeometry(rad, rad * 1.6, 6), mat); tip.position.y = h + rad * 0.8;
      c.add(body, tip); c.position.set(x, 0.2, rx * 0.6); c.rotation.set(rx, 0, -rz); g.add(c);
    }
    g.traverse(m => { if (m.isMesh) m.castShadow = true; });
    return g;
  }
  function moonGlobe() {
    const g = new T.Group();
    const silver = phys('#C9CED8', { metalness: 0.9, roughness: 0.25 });
    const moon = new T.Mesh(new T.SphereGeometry(0.9, 40, 28), phys('#ffffff', { roughness: 0.9, emissive: '#C8D4FF', emissiveIntensity: 0.12 }));
    moon.position.y = 1.35; g.add(moon);
    imgTex('assets/img/moon.webp', t => { moon.material.map = t; moon.material.needsUpdate = true; });
    const ring = new T.Mesh(new T.TorusGeometry(1.0, 0.035, 8, 48, Math.PI * 1.3), silver);
    ring.position.y = 1.35; ring.rotation.z = Math.PI * 0.35; g.add(ring);
    const st = new T.Mesh(new T.CylinderGeometry(0.08, 0.35, 0.4, 24), silver); st.position.y = 0.2; g.add(st);
    g.traverse(m => { if (m.isMesh) m.castShadow = true; });
    return g;
  }
  function ringedPlanet() {
    const g = new T.Group();
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const x = c.getContext('2d'), bands = ['#E0A65A', '#B8692E', '#F0CC8E', '#A5582A', '#DDA25C', '#C98544'], r = prng(7);
    for (let i = 0; i < 16; i++) { x.fillStyle = bands[i % 6]; x.fillRect(0, i * 8, 256, 8 + r() * 4); }
    const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding;
    const p = new T.Mesh(new T.SphereGeometry(0.75, 40, 28), phys('#ffffff', { map: t, roughness: 0.5 }));
    p.position.y = 1.3; g.add(p);
    const ring = new T.Mesh(new T.RingGeometry(0.95, 1.45, 64), phys('#D9BE8C', { side: T.DoubleSide, transparent: true, opacity: 0.88, roughness: 0.4 }));
    ring.position.y = 1.3; ring.rotation.x = -Math.PI / 2 + 0.45; g.add(ring);
    const st = new T.Mesh(new T.CylinderGeometry(0.06, 0.3, 0.55, 24), phys('#2A2F45', { metalness: 0.6, roughness: 0.3 })); st.position.y = 0.27; g.add(st);
    g.traverse(m => { if (m.isMesh) m.castShadow = true; });
    return g;
  }
  function starLamp() {
    const g = new T.Group();
    const sh = new T.Shape();
    for (let i = 0; i < 10; i++) { const rr = i % 2 ? 0.38 : 0.9, a = Math.PI / 2 + i * Math.PI / 5; sh[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr); }
    const star = new T.Mesh(new T.ExtrudeGeometry(sh, { depth: 0.25, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 3 }), phys('#F2A900', { emissive: '#D98200', emissiveIntensity: 0.45, roughness: 0.3, metalness: 0.2 }));
    star.position.set(0, 1.45, -0.12); g.add(star);
    const pole = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 0.6, 12), phys('#C9CED8', { metalness: 0.9, roughness: 0.25 })); pole.position.y = 0.55; g.add(pole);
    const base = new T.Mesh(new T.CylinderGeometry(0.45, 0.55, 0.25, 32), phys('#1F2C4C', { metalness: 0.3, roughness: 0.4 })); base.position.y = 0.12; g.add(base);
    g.traverse(m => { if (m.isMesh) m.castShadow = true; });
    return g;
  }
  // 新しい家具（Poly Haven・CC0）
  Object.assign(DECOR, {
    phTrunk: { name: '流木（ながい）', price: 30, r: 1.4, climb: true, desc: '長く横たわる流木。上をのんびり歩けます', build: () => kitOr('PH_Trunk', 5.2, null, () => OLD_DECOR.log.build()) },
    phStump: { name: '切り株', price: 25, r: 1.4, climb: true, desc: '低い切り株。上に乗ってひと休み', build: () => kitOr('PH_Stump', 2.9, null, () => OLD_DECOR.log.build()) },
    phBranch: { name: '流木（Y字）', price: 20, r: 0.7, desc: '白っぽいY字の流木。ケースのアクセントに', build: () => kitOr('PH_Branch', 1.5, null, () => OLD_DECOR.log.build()) },
    phRock: { name: '砂岩', price: 25, r: 1.0, climb: true, desc: '砂にうもれた、ごつごつの砂岩', build: () => kitOr('PH_SandRock', 2.0, null, () => OLD_DECOR.rock.build()) },
    phShrub: { name: '黄色い花の低木', price: 15, r: 0.9, soft: true, desc: '乾いた土地に咲く、黄色い花の低木', build: () => kitOr('PH_Didelta', 2.0, null, () => OLD_DECOR.plant.build()) },
    phFern: { name: 'シダ（大）', price: 15, r: 0.9, soft: true, desc: '大きく葉を広げるシダ', build: () => kitOr('PH_Fern', 2.2, null, () => OLD_DECOR.plant.build()) },
    phShell: { name: '巻き貝', price: 15, r: 0.7, desc: 'トゲのある大きな巻き貝（飾りです）', build: () => kitOr('PH_Shell', 1.6, null, () => OLD_DECOR.stone.build()) },
    phGnome: { name: '小人の置物', price: 20, r: 0.55, desc: 'ランタンを持った庭の小人', build: () => kitOr('PH_Gnome', 1.0, null, () => OLD_DECOR.stone.build()) },
    phCat: { name: 'ねこの置物', price: 20, r: 0.6, desc: '石でできた、すわったねこ', build: () => kitOr('PH_Cat', 1.1, null, () => OLD_DECOR.stone.build()) },
    phDuck: { name: 'アヒル', price: 15, r: 0.65, desc: 'おふろでおなじみの黄色いアヒル', build: () => kitOr('PH_Duck', 1.3, null, () => OLD_DECOR.stone.build()) },
    // ショー限定（金）
    phChest: { name: '宝箱', price: 150, r: 1.2, climb: true, expo: 'gold', desc: '金具のついた古い宝箱。上に乗れます（レプタイルズショー限定）', build: () => kitOr('PH_Chest', 2.6, null, () => OLD_DECOR.stone.build()) },
    phVase: { name: '真ちゅうの花びん', price: 120, r: 0.45, expo: 'gold', desc: '細かい彫りもようの真ちゅうの花びん（レプタイルズショー限定）', build: () => kitMetal(kitOr('PH_Vase', 0.75, null, () => OLD_DECOR.stone.build()), 0.75, 0.32) },
    phHorse: { name: '金の馬の像', price: 150, r: 0.6, expo: 'gold', desc: '前足を上げた金色の馬（レプタイルズショー限定）', build: () => kitTint('PH_Horse', 1.2, null, goldMat(), () => OLD_DECOR.stone.build()) },
    // ショー限定（夜）
    phClock: { name: '置き時計', price: 120, r: 0.95, expo: 'night', desc: '木のアンティーク置き時計（レプタイルズショー限定）', build: () => kitOr('PH_Clock', 1.8, null, () => OLD_DECOR.stone.build()) },
    amethyst: { name: '光る紫の結晶', price: 150, r: 0.9, expo: 'night', desc: 'ほのかに光るアメジストの結晶（レプタイルズショー限定）', build: () => amethystCluster() },
    moonGlobe: { name: '月の地球儀', price: 150, r: 0.8, expo: 'night', imgs: ['assets/img/moon.webp'], desc: '本物の月の写真でできた地球儀（レプタイルズショー限定）', build: () => moonGlobe() },
    starLamp: { name: '星のランプ', price: 120, r: 0.6, expo: 'night', desc: 'やさしく光る星のランプ（レプタイルズショー限定）', build: () => starLamp() },
    planet: { name: '輪のある惑星', price: 150, r: 0.9, expo: 'night', desc: '土星のような輪のある惑星の置物（レプタイルズショー限定）', build: () => ringedPlanet() },
  });
  const DEFAULT_DECOR = [{ t: 'wet', x: -4.4, z: -2.6, rot: 0 }, { t: 'dish', x: -5.0, z: 3.2, rot: 0 }, { t: 'plant', x: 1.8, z: -3.8, rot: 0 }];
  // ケースの広さ（床の半分の幅・奥行き）
  const TANK = { hw: 6.5, hd: 4.5 };
  // ケージの大きさと見た目（ショップで買って、ケースごとに選べる）
  const CAGE_SIZES = {
    std: { name: 'レギュラー', hw: 6.5, hd: 4.5, price: 0, desc: '幅60cmクラスの定番サイズ' },
    wide: { name: 'ワイド', hw: 8, hd: 5.2, price: 150, desc: '幅75cmクラス。家具をゆったり置ける' },
    big: { name: 'ビッグ', hw: 9.5, hd: 6, price: 350, desc: '幅90cmクラス。のびのび歩き回れる' },
  };
  const CAGE_THEMES = {
    glass: { name: 'ガラスケージ', price: 0, desc: 'シンプルな黒フレームのガラスケージ', floor: 'sand', tint: '#ffffff', frame: '#2F3431', floorImg: 'assets/img/cage-glass-floor.webp' },
    white: { name: 'ホワイト＆ペーパー', price: 60, desc: '白いフレームにキッチンペーパー敷き。清潔感たっぷり', floor: 'paper', tint: '#ffffff', frame: '#F4F2ED', floorImg: 'assets/img/cage-white-floor.webp', floorScale: 4 },
    // 背面・床の画像は Poly Haven（CC0）のテクスチャ
    wood: { name: '木製ビバリウム', price: 120, desc: 'あたたかみのある木のフレームと背面パネル', floor: 'sand', tint: '#F4E6D0', frame: '#8A5C34', back: 'wood', thick: true, backImg: 'assets/img/cage-wood-back.webp', floorImg: 'assets/img/cage-wood-floor.webp' },
    desert: { name: 'デザート', price: 120, desc: '赤い砂と岩の背景で、ふるさとの荒野ふうに', floor: 'sand', tint: '#E7AE7E', frame: '#3A2E26', back: 'rock', backImg: 'assets/img/cage-desert-back.webp', floorImg: 'assets/img/cage-desert-floor.webp' },
    dino: { name: '恐竜時代', price: 150, desc: '火山の背景とシダの森、足あとの残る大地。太古の世界へタイムスリップ', floor: 'dinofloor', tint: '#ffffff', frame: '#5B4A3A', back: 'volcano', thick: true, dino: true, backFull: true, backImg: 'assets/img/cage-dino-back.webp', floorImg: 'assets/img/cage-dino-floor.webp' },
    candy: { name: 'おかしの家', price: 150, desc: 'クッキーの床、チョコの壁、キャンディの柱。あまーいおうち', floor: 'cookie', tint: '#ffffff', frame: '#F7A8C4', back: 'choco', thick: true, candy: true, backImg: 'assets/img/cage-candy-back.webp', floorImg: 'assets/img/cage-candy-floor.webp', floorScale: 6 },
    // レプタイルズショーの会場でだけ買える
    expoGold: { name: 'ショー限定・ゴールド', price: 500, desc: 'チャンピオンの気分。金彩の岩壁とアールデコの飾り枠、黄金の砂と水晶のきらめき（レプタイルズショー限定）', floor: 'sand', tint: '#FFF1D2', frame: '#9A6A0E', back: 'wood', thick: true, expo: true, backFull: true, backTint: '#94733F', luxe: { metal: '#A8740E', trim: '#D9A52A', gem: '#E8F6FF', emblem: 'trophy', trimTint: '#A87A30' }, backImg: 'assets/img/cage-gold-back.webp', floorImg: 'assets/img/cage-gold-floor.webp', frameImg: 'assets/img/cage-gold-trim.webp' },
    expoNight: { name: 'ショー限定・ミッドナイト', price: 500, desc: '星降る紫晶の洞窟と、星くずの黒い砂。夜空のような紺色のフレーム（レプタイルズショー限定）', floor: 'sand', tint: '#C8D2F0', frame: '#1F2C4C', back: 'rock', thick: true, expo: true, backFull: true, luxe: { metal: '#C9CED8', trim: '#9AA6C4', gem: '#7FB2FF', glow: true, emblem: 'star' }, backImg: 'assets/img/cage-night-back.webp', floorImg: 'assets/img/cage-night-floor.webp', frameImg: 'assets/img/cage-night-trim.webp' },
  };
  // ケージ用の模様（一度作ったら使い回す）
  const cageTexCache = {};
  function cageTex(kind) {
    if (cageTexCache[kind]) return cageTexCache[kind];
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    const r = prng(kind.length * 17 + 3);
    if (kind === 'paper') {
      c.width = c.height = 512;
      ctx.fillStyle = '#F7F5F0'; ctx.fillRect(0, 0, 512, 512);
      for (let y = 8; y < 512; y += 16) for (let x = 8 + (y / 16 % 2) * 8; x < 512; x += 16) { ctx.fillStyle = 'rgba(180,170,150,.18)'; ctx.beginPath(); ctx.arc(x, y, 2.2, 0, 7); ctx.fill(); }
      ctx.strokeStyle = 'rgba(170,160,140,.25)'; ctx.lineWidth = 3;
      for (const x of [170, 341]) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 512); ctx.stroke(); }
    } else if (kind === 'cookie') {
      c.width = 1024; c.height = 768;
      ctx.fillStyle = '#B9814A'; ctx.fillRect(0, 0, 1024, 768);
      const W = 1024 / 6, H = 768 / 4;
      for (let j = 0; j < 4; j++) for (let i = 0; i < 6; i++) {
        const x = i * W + 6, y = j * H + 6, w = W - 12, h = H - 12;
        ctx.fillStyle = (i + j) % 2 ? '#E8B877' : '#DDA766';
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, 18) : ctx.rect(x, y, w, h); ctx.fill();
        ctx.strokeStyle = 'rgba(150,95,40,.55)'; ctx.lineWidth = 4; ctx.setLineDash([10, 10]);
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x + 12, y + 12, w - 24, h - 24, 10) : ctx.rect(x + 12, y + 12, w - 24, h - 24); ctx.stroke(); ctx.setLineDash([]);
        for (let k = 0; k < 6; k++) { ctx.fillStyle = 'rgba(130,80,35,.6)'; ctx.beginPath(); ctx.arc(x + w * (0.25 + (k % 3) * 0.25), y + h * (k < 3 ? 0.38 : 0.66), 4, 0, 7); ctx.fill(); }
        if (r() < 0.35) { ctx.fillStyle = '#5A3418'; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(x + w * r(), y + h * r(), 7, 0, 7); ctx.fill(); } }
      }
    } else if (kind === 'choco') {
      c.width = 1024; c.height = 256;
      ctx.fillStyle = '#4A2A17'; ctx.fillRect(0, 0, 1024, 256);
      for (let i = 0; i < 8; i++) for (let j = 0; j < 2; j++) {
        const x = i * 128 + 8, y = j * 128 + 8;
        const g = ctx.createLinearGradient(x, y, x + 112, y + 112);
        g.addColorStop(0, '#7B4A2A'); g.addColorStop(1, '#5A3420');
        ctx.fillStyle = g; ctx.fillRect(x, y, 112, 112);
        ctx.fillStyle = 'rgba(255,220,190,.12)'; ctx.fillRect(x + 6, y + 6, 100, 10);
      }
      // ピンクのアイシングを上にたらす
      ctx.fillStyle = '#F9C2D6';
      ctx.fillRect(0, 0, 1024, 18);
      for (let x = 10; x < 1024; x += 46 + r() * 30) { ctx.beginPath(); ctx.ellipse(x, 18, 11, 18 + r() * 26, 0, 0, 7); ctx.fill(); }
    } else if (kind === 'rock') {
      c.width = 1024; c.height = 256;
      const g = ctx.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, '#B97A55'); g.addColorStop(1, '#8E5638');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 1024, 256);
      for (let i = 0; i < 60; i++) { ctx.fillStyle = `rgba(${r() < 0.5 ? '70,35,20' : '230,170,120'},${0.1 + r() * 0.15})`; ctx.beginPath(); ctx.ellipse(r() * 1024, r() * 256, 30 + r() * 90, 8 + r() * 26, r() * 0.4 - 0.2, 0, 7); ctx.fill(); }
      ctx.strokeStyle = 'rgba(60,30,15,.35)'; ctx.lineWidth = 2;
      for (let i = 0; i < 14; i++) { ctx.beginPath(); let x = r() * 1024, y = r() * 256; ctx.moveTo(x, y); for (let k = 0; k < 5; k++) { x += 20 + r() * 40; y += r() * 30 - 15; ctx.lineTo(x, y); } ctx.stroke(); }
    } else if (kind === 'wood') {
      c.width = 1024; c.height = 256;
      ctx.fillStyle = '#9A6A42'; ctx.fillRect(0, 0, 1024, 256);
      for (let i = 0; i < 70; i++) { ctx.strokeStyle = `rgba(${r() < 0.5 ? '80,45,22' : '200,150,100'},${0.12 + r() * 0.2})`; ctx.lineWidth = 1 + r() * 3; const y = r() * 256; ctx.beginPath(); ctx.moveTo(0, y); for (let x = 0; x <= 1024; x += 32) ctx.lineTo(x, y + Math.sin(x / 70 + i) * 5); ctx.stroke(); }
      ctx.fillStyle = 'rgba(50,28,12,.35)'; for (let x = 256; x < 1024; x += 256) ctx.fillRect(x - 2, 0, 4, 256);
    } else if (kind === 'dinofloor') {
      c.width = 1024; c.height = 768;
      ctx.fillStyle = '#8A6A48'; ctx.fillRect(0, 0, 1024, 768);
      for (let i = 0; i < 1600; i++) { ctx.fillStyle = `rgba(${r() < 0.5 ? '60,42,28' : '170,140,105'},${0.15 + r() * 0.3})`; ctx.beginPath(); ctx.arc(r() * 1024, r() * 768, 1 + r() * 3.5, 0, 7); ctx.fill(); }
      for (let i = 0; i < 40; i++) { ctx.fillStyle = `rgba(${r() < 0.5 ? '120,110,100' : '90,80,70'},.8)`; ctx.beginPath(); ctx.ellipse(r() * 1024, r() * 768, 5 + r() * 10, 4 + r() * 7, r() * 3, 0, 7); ctx.fill(); }
      // 恐竜の3本指の足あと
      const foot = (x, y, a, sc) => {
        ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.scale(sc, sc);
        ctx.fillStyle = 'rgba(45,30,18,.55)';
        ctx.beginPath(); ctx.ellipse(0, 10, 16, 20, 0, 0, 7); ctx.fill();
        for (const t of [-0.5, 0, 0.5]) { ctx.save(); ctx.rotate(t); ctx.beginPath(); ctx.ellipse(0, -22, 7, 22, 0, 0, 7); ctx.fill(); ctx.beginPath(); ctx.moveTo(-5, -40); ctx.lineTo(0, -54); ctx.lineTo(5, -40); ctx.fill(); ctx.restore(); }
        ctx.restore();
      };
      for (let k = 0; k < 5; k++) foot(180 + k * 150, 600 - k * 95 + (k % 2) * 40, 0.9, 1.1);
    } else if (kind === 'volcano') {
      c.width = 1024; c.height = 256;
      const sky = ctx.createLinearGradient(0, 0, 0, 256);
      sky.addColorStop(0, '#6B4C7A'); sky.addColorStop(0.45, '#E0865A'); sky.addColorStop(1, '#F4C27A');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, 1024, 256);
      // 遠くの火山（煙と溶岩）
      const vol = (x, w, h, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x - w, 256); ctx.lineTo(x - w * 0.18, 256 - h); ctx.lineTo(x + w * 0.18, 256 - h); ctx.lineTo(x + w, 256); ctx.fill(); };
      ctx.fillStyle = 'rgba(90,70,80,.45)';
      for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(700 + i * 18, 40 - i * 6, 26 + i * 6, 0, 7); ctx.fill(); }
      vol(700, 260, 205, '#5A3A3A');
      ctx.strokeStyle = '#FF7A2A'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(690, 56); ctx.quadraticCurveTo(670, 140, 640, 200); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(712, 56); ctx.quadraticCurveTo(740, 120, 770, 190); ctx.stroke();
      ctx.fillStyle = '#FFB347'; ctx.fillRect(660, 48, 80, 8);
      vol(260, 200, 130, '#6E4A44');
      // 翼竜のシルエット
      ctx.fillStyle = 'rgba(50,30,45,.75)';
      for (const [x, y, sc] of [[420, 60, 1], [500, 90, 0.7], [930, 50, 0.8]]) {
        ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc);
        ctx.beginPath(); ctx.moveTo(-50, 0); ctx.quadraticCurveTo(-20, -18, 0, 0); ctx.quadraticCurveTo(20, -18, 50, 0); ctx.quadraticCurveTo(20, -6, 0, 6); ctx.quadraticCurveTo(-20, -6, -50, 0); ctx.fill();
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(16, -6); ctx.lineTo(4, 4); ctx.fill();
        ctx.restore();
      }
      // 手前のシダ
      ctx.fillStyle = '#2F4A2A';
      for (let x = 0; x < 1024; x += 56 + r() * 40) {
        const h = 70 + r() * 70, lean = (r() - 0.5) * 40;
        for (let k = 0; k < 9; k++) {
          const t = k / 9, px = x + lean * t, py = 256 - h * t;
          ctx.beginPath(); ctx.ellipse(px - 14 * (1 - t), py, 16 * (1 - t) + 4, 4, -0.5, 0, 7); ctx.fill();
          ctx.beginPath(); ctx.ellipse(px + 14 * (1 - t), py, 16 * (1 - t) + 4, 4, 0.5, 0, 7); ctx.fill();
        }
      }
    } else if (kind === 'stripe') {
      c.width = 64; c.height = 256;
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, 64, 256);
      ctx.fillStyle = '#E8436A';
      for (let y = -64; y < 320; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(64, y + 32); ctx.lineTo(64, y + 56); ctx.lineTo(0, y + 24); ctx.fill(); }
    } else if (kind === 'swirl') {
      c.width = c.height = 256;
      const cols = ['#FF7BA6', '#FFFFFF', '#7FD3F7', '#FFFFFF', '#FFD45E', '#FFFFFF'];
      for (let i = 0; i < 36; i++) { ctx.fillStyle = cols[i % cols.length]; ctx.beginPath(); ctx.moveTo(128, 128); ctx.arc(128, 128, 126, i / 36 * 6.283 + i * 0.05, (i + 1) / 36 * 6.283 + i * 0.05 + 0.02); ctx.fill(); }
    }
    const t = new T.CanvasTexture(c);
    t.encoding = T.sRGBEncoding;
    t.anisotropy = 4;
    cageTexCache[kind] = t;
    return t;
  }
  // ショー限定ケースの豪華な飾り：四すみの柱と玉、上の枠の飾り縁、背面の上の紋章
  function luxeBits(g, front, th, hw, hd, ft) {
    const lx = th.luxe;
    const metal = phys(lx.metal, { roughness: 0.3, metalness: 0.55, clearcoat: 1 });
    const trim = phys(lx.trim, { roughness: 0.3, metalness: 0.5, clearcoat: 1 });
    const gem = phys(lx.gem, { roughness: 0.05, metalness: 0.1, clearcoat: 1, emissive: lx.glow ? lx.gem : '#000000', emissiveIntensity: lx.glow ? 0.6 : 0 });
    const H = 2.2, x0 = hw + 0.1, z0 = hd + 0.1;
    // 四すみの柱と、上下の玉
    for (const [x, z] of [[-x0, -z0], [x0, -z0], [-x0, z0], [x0, z0]]) {
      const parts = [];
      const hh = z > 0 ? 0.5 : H;
      const post = new T.Mesh(new T.BoxGeometry(ft * 1.5, hh + ft, ft * 1.5), metal);
      post.position.set(x, hh / 2, z); parts.push(post);
      const cap = new T.Mesh(new T.BoxGeometry(ft * 2, ft * 0.5, ft * 2), trim);
      cap.position.set(x, hh + ft * 0.75, z); parts.push(cap);
      const ball = new T.Mesh(new T.SphereGeometry(ft * 0.9, 16, 12), gem);
      ball.position.set(x, hh + ft * 1.0 + ft * 0.9, z); parts.push(ball);
      const foot = new T.Mesh(new T.BoxGeometry(ft * 2, ft * 0.6, ft * 2), trim);
      foot.position.set(x, ft * 0.3, z); parts.push(foot);
      for (const m of parts) { m.castShadow = true; g.add(m); if (z > 0) front.push(m); }
    }
    // 上の枠に重ねる細い飾り縁（後ろと左右）
    for (const [x, z, w, d] of [[0, -z0, hw * 2 + 0.3, 0.1], [-x0, 0, 0.1, hd * 2 + 0.2], [x0, 0, 0.1, hd * 2 + 0.2]]) {
      const m = new T.Mesh(new T.BoxGeometry(w + ft * 0.6, ft * 0.35, d + ft * 0.6), trim);
      m.position.set(x, H + ft * 0.65, z); g.add(m);
    }
    // 背面の上の真ん中に、紋章
    const em = new T.Group();
    if (lx.emblem === 'star') {
      const sh = new T.Shape();
      for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.17 : 0.4, a = Math.PI / 2 + i * Math.PI / 5; sh[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); }
      const star = new T.Mesh(new T.ExtrudeGeometry(sh, { depth: 0.06, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 }), gem);
      em.add(star);
      const ring = new T.Mesh(new T.TorusGeometry(0.5, 0.04, 8, 40), metal); em.add(ring);
    } else {
      const disc = new T.Mesh(new T.CylinderGeometry(0.46, 0.46, 0.08, 40), metal); disc.rotation.x = Math.PI / 2; em.add(disc);
      const rim = new T.Mesh(new T.TorusGeometry(0.46, 0.04, 8, 40), trim); em.add(rim);
      // トロフィー（杯・柄・台）
      const cup = new T.Mesh(new T.CylinderGeometry(0.17, 0.09, 0.2, 20), trim); cup.position.set(0, 0.1, 0.07); em.add(cup);
      const stem = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 0.12, 10), trim); stem.position.set(0, -0.05, 0.07); em.add(stem);
      const base = new T.Mesh(new T.BoxGeometry(0.2, 0.05, 0.06), trim); base.position.set(0, -0.13, 0.07); em.add(base);
      for (const sx of [-1, 1]) { const h = new T.Mesh(new T.TorusGeometry(0.06, 0.018, 6, 16, Math.PI), trim); h.rotation.z = sx * -Math.PI / 2; h.position.set(sx * 0.17, 0.12, 0.07); em.add(h); }
      const g1 = new T.Mesh(new T.SphereGeometry(0.035, 12, 8), gem); g1.position.set(0, 0.13, 0.17); em.add(g1);
    }
    em.position.set(0, H + 0.3, -z0 + 0.12); em.scale.setScalar(1.15);
    em.traverse(m => { if (m.isMesh) m.castShadow = true; });
    g.add(em);
  }
  // ケージ本体（床・ガラス・枠・背面・飾り）を作る。ケースの中とショップの見本で共用
  function makeCage(theme, hw, hd, sand) {
    const g = new T.Group(), front = [];
    const th = CAGE_THEMES[theme] || CAGE_THEMES.glass;
    const ftex = th.floor === 'sand' ? sand : cageTex(th.floor);
    const floor = new T.Mesh(new T.PlaneGeometry(hw * 2, hd * 2), phys(th.tint, { map: ftex, bumpMap: ftex, bumpScale: th.floor === 'cookie' ? 0.03 : 0.012, roughness: th.floor === 'paper' ? 0.95 : 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    g.add(floor);
    // ガラスと枠（手前は低くして中が見えるように）
    const glass = phys('#D5E4DD', { transparent: true, opacity: 0.28, roughness: 0.05, clearcoat: 1 });
    const lx = th.luxe;
    const frame = phys(th.frame, lx ? { roughness: 0.32, metalness: 0.5, clearcoat: 0.8 } : { roughness: th.candy ? 0.35 : 0.4, clearcoat: th.candy ? 0.6 : 0 });
    const ft = th.luxe ? 0.32 : th.thick ? 0.22 : 0.1, rails = [];
    for (const [x, z, w, d, h] of [[0, -hd - 0.1, hw * 2 + 0.3, 0.1, 2.2], [-hw - 0.1, 0, 0.1, hd * 2 + 0.2, 2.2], [hw + 0.1, 0, 0.1, hd * 2 + 0.2, 2.2], [0, hd + 0.1, hw * 2 + 0.3, 0.1, 0.5]]) {
      const m = new T.Mesh(new T.BoxGeometry(w, h, d), glass);
      m.position.set(x, h / 2, z);
      g.add(m);
      const f = new T.Mesh(new T.BoxGeometry(w + ft + 0.02, ft, d + ft + 0.02), frame);
      f.position.set(x, h, z);
      f.castShadow = !!th.thick;
      g.add(f); rails.push([f, Math.max(w, d)]);
      if (th.thick) {
        const base = new T.Mesh(new T.BoxGeometry(w + ft + 0.02, ft * 0.8, d + ft + 0.02), frame);
        base.position.set(x, ft * 0.4, z);
        g.add(base); rails.push([base, Math.max(w, d)]);
        if (z > 0) front.push(base);
      }
      if (z > 0) front.push(m, f);
    }
    if (lx) luxeBits(g, front, th, hw, hd, ft);
    if (th.back) {
      const bt = cageTex(th.back);
      bt.wrapS = T.RepeatWrapping; bt.repeat.set(Math.max(1, hw / 6.5), 1);
      const back = new T.Mesh(new T.PlaneGeometry(hw * 2 + 0.2, 2.2), phys('#ffffff', { map: bt, roughness: th.back === 'choco' ? 0.5 : 0.9 }));
      back.position.set(0, 1.1, -hd - 0.17);
      back.receiveShadow = true;
      back.userData.back = true;
      g.add(back);
    }
    // 画像のある限定ケース：読めたら床と背面を画像に差しかえる
    if (th.floorImg) imgTex(th.floorImg, t0 => {
      const t = t0.clone(); t.needsUpdate = true;
      t.wrapS = t.wrapT = T.RepeatWrapping; const fs = th.floorScale || 1.7; t.repeat.set(hw / fs, hd / fs); t.anisotropy = 4;
      floor.material.map = t; floor.material.bumpMap = t; floor.material.bumpScale = 0.02; floor.material.color.set('#ffffff'); floor.material.needsUpdate = true;
    });
    if (th.backImg) imgTex(th.backImg, t => {
      const back = g.children.find(m => m.userData.back);
      if (!back) return;
      // 横長のパネルに、絵をゆがめずに並べる（上下は少し切りとる）
      const A = (hw * 2 + 0.2) / 2.2, im = t.image || {}, ia = im.width && im.height ? im.width / im.height : 2;
      // backFull：1枚の横長の絵として貼る（くり返さない）
      const n = th.backFull ? 1 : Math.max(1, Math.round(A / 2.6)), ry = Math.min(1, (th.backFull ? ia : 2) / (A / n));
      const bt = t.clone(); bt.needsUpdate = true;
      const rx = th.backFull ? Math.min(1, A / ia) : n;   // パネルより横長の絵は、左右を切る
      bt.wrapS = T.RepeatWrapping; bt.repeat.set(rx, ry); bt.offset.set(th.backFull ? (1 - rx) / 2 : 0, (1 - ry) / 2);
      back.material.map = bt; back.material.color.set(th.backTint || '#ffffff'); back.material.needsUpdate = true;
    });
    // 飾り帯の画像：枠の長さに合わせて、横にくり返して貼る
    if (th.frameImg) imgTex(th.frameImg, t => {
      const im = t.image || {}, ia = im.width && im.height ? im.width / im.height : 10;
      for (const [m, L] of rails) {
        const h = m.geometry.parameters.height, tt = t.clone(); tt.needsUpdate = true;
        tt.wrapS = T.RepeatWrapping; tt.repeat.set(Math.max(1, Math.round(L / (h * ia))), 1); tt.anisotropy = 4;
        const mat = m.material.clone(); mat.map = tt; mat.color.set(th.luxe && th.luxe.trimTint || '#ffffff'); mat.metalness = 0.25; mat.needsUpdate = true;
        m.material = mat;
      }
    });
    if (th.candy) g.add(candyBits(hw, hd));
    if (th.dino) g.add(dinoBits(hw, hd));
    return { group: g, floor, front };
  }
  // ---- ショップの見本写真（家具・ケージの見た目・ケージの大きさ）
  const itemCache = new Map();
  let ir = null, irSand = null;
  function itemPhotoReady(kind, id) { return itemCache.get(kind + '|' + id) || null; }
  function itemPhoto(kind, id) {
    const key = kind + '|' + id;
    if (itemCache.has(key)) return itemCache.get(key);
    if (!supported) return '';
    // 画像を使うケースは、画像が読めてから撮る（まだなら null を返して、あとでもう一度）
    const th = kind === 'theme' && CAGE_THEMES[id], us = th ? [th.backImg, th.floorImg, th.frameImg].filter(Boolean) : kind === 'decor' && DECOR[id] && DECOR[id].imgs || [];
    if (us.length && !imgTexReady(us)) { us.forEach(u => imgTex(u, () => {})); return null; }
    if (!ir) {
      const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      renderer.setSize(400, 300);
      renderer.setPixelRatio(1);
      renderer.outputEncoding = T.sRGBEncoding;
      renderer.toneMapping = T.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = T.PCFSoftShadowMap;
      const scene = new T.Scene();
      scene.background = new T.Color('#EFE6D6');
      scene.environment = makeEnvironment(renderer);
      const sun = new T.DirectionalLight('#FFF4E6', 1.05);
      sun.position.set(-4, 12, 7);
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 10, bottom: -10, near: 1, far: 40 });
      sun.shadow.radius = 4; sun.shadow.normalBias = 0.02;
      const table = new T.Mesh(new T.PlaneGeometry(80, 60), phys('#C9A57C', { roughness: 0.7 }));
      table.rotation.x = -Math.PI / 2; table.position.y = -0.02; table.receiveShadow = true;
      scene.add(new T.HemisphereLight('#FFF6E4', '#9C8A6A', 0.45), sun, table);
      ir = { renderer, scene, camera: new T.PerspectiveCamera(30, 4 / 3, 0.1, 120), table };
      irSand = canvasTexture(sandCanvas(), { srgb: true }); irSand.flipY = true;
    }
    const g = new T.Group();
    let gk = null;
    const cam = ir.camera;
    ir.table.visible = kind !== 'decor';
    if (kind === 'decor' || kind === 'kit') {
      const def = kind === 'kit' ? { build: () => buildKit(id, 2.4) } : DECOR[id];
      if (!def || (kind === 'kit' && !kitHas(id))) return '';
      // 家具は砂の上に置いた姿で
      const pad = new T.Mesh(new T.CircleGeometry(3.2, 40), phys('#ffffff', { map: irSand, roughness: 1 }));
      pad.rotation.x = -Math.PI / 2; pad.receiveShadow = true;
      const o = def.build();
      o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      g.add(pad, o);
      ir.scene.add(g);
      const box = new T.Box3().setFromObject(o), c = box.getCenter(new T.Vector3()), sz = box.getSize(new T.Vector3());
      const D = Math.max(sz.x, sz.z, sz.y * 1.4, 1.2) * 2.3;
      cam.position.set(c.x + D * 0.3, c.y + D * (def.photoElevation || 0.42), c.z + D * 0.95);
      cam.lookAt(c.x, c.y * 0.6, c.z);
      ir.scene.background.set('#F1E9DA');
    } else {
      const dims = kind === 'size' ? CAGE_SIZES[id] : CAGE_SIZES.std;
      if (!dims) return '';
      const c = makeCage(kind === 'theme' ? id : 'glass', dims.hw, dims.hd, irSand);
      g.add(c.group);
      // 大きさがわかるように、ふつうサイズのレオパを1匹
      gk = buildGecko({ genes: { snow: 0, alb: 0, ecl: 0, bliz: 0 }, tang: 40, poly: { spots: 50, blotch: 50, head: 50, carrot: 20, lav: 20, aberrant: 10 }, seed: 7, stage: 'adult' }, 'low');
      gk.root.scale.setScalar(0.95);
      gk.root.position.set(-0.6, 0, 0.6);
      gk.root.rotation.y = 0.9;
      gk.root.traverse(m => { if (m.isMesh) m.castShadow = true; });
      pose(gk, restPose());
      g.add(gk.root);
      ir.scene.add(g);
      // 大きさの見本は同じカメラで撮って、違いがわかるように
      if (kind === 'size') { cam.position.set(0, 15.5, 22); cam.lookAt(0, 0, -0.6); }
      else { cam.position.set(0, 9.6, 14.4); cam.lookAt(0, 0.3, -0.5); }
      ir.scene.background.set('#E9E4D8');
    }
    ir.renderer.render(ir.scene, cam);
    const url = ir.renderer.domElement.toDataURL('image/jpeg', 0.86);
    ir.scene.remove(g);
    if (gk) { g.remove(gk.root); disposeGecko(gk); }
    disposeTree(g);
    itemCache.set(key, url);
    return url;
  }
  // 恐竜時代の飾り：石の柱、外に生えるシダ、小さな火山、化石の骨
  function dinoBits(hw, hd) {
    const g = new T.Group();
    const stoneM = phys('#7A6A58', { roughness: 0.95 });
    for (const [x, z] of [[-hw - 0.15, -hd - 0.15], [hw + 0.15, -hd - 0.15], [-hw - 0.15, hd + 0.15], [hw + 0.15, hd + 0.15]]) {
      const back = z < 0, h = back ? 2.5 : 0.8;
      const post = new T.Mesh(new T.CylinderGeometry(0.2, 0.26, h, 7), stoneM);
      post.position.set(x, h / 2, z);
      const cap = new T.Mesh(new T.DodecahedronGeometry(0.3, 0), stoneM);
      cap.position.set(x, h + 0.1, z); cap.rotation.set(0.4, 0.7, 0);
      g.add(post, cap);
    }
    // シダ（外の左奥）
    const fernM = phys('#3E6B35', { roughness: 0.7, side: T.DoubleSide });
    const fern = (x, z, sc) => {
      const f = new T.Group();
      for (let i = 0; i < 9; i++) {
        const leaf = new T.Mesh(new T.PlaneGeometry(0.5, 2.6, 1, 6), fernM);
        const pos = leaf.geometry.attributes.position;
        for (let k = 0; k < pos.count; k++) { const y = pos.getY(k) + 1.3; pos.setZ(k, -0.18 * y * y); pos.setX(k, pos.getX(k) * (1 - y / 2.8)); }
        leaf.geometry.computeVertexNormals();
        leaf.geometry.translate(0, 1.3, 0);
        leaf.rotation.set(-0.5 - (i % 3) * 0.15, i / 9 * Math.PI * 2, 0);
        f.add(leaf);
      }
      f.position.set(x, 0, z); f.scale.setScalar(sc);
      g.add(f);
    };
    fern(-hw - 1.4, -hd - 0.6, 1.1); fern(-hw - 2.2, -hd + 1.2, 0.8);
    // 小さな火山（外の右奥）
    const vol = new T.Mesh(new T.CylinderGeometry(0.45, 1.6, 2.2, 14, 1, true), phys('#5A3E36', { roughness: 0.95, side: T.DoubleSide }));
    vol.position.set(hw + 1.6, 1.1, -hd - 0.8);
    const lava = new T.Mesh(new T.CircleGeometry(0.44, 14), new T.MeshBasicMaterial({ color: '#FF8A2A' }));
    lava.rotation.x = -Math.PI / 2; lava.position.set(hw + 1.6, 2.15, -hd - 0.8);
    g.add(vol, lava);
    // 化石の骨（外の右手前）
    const boneM = phys('#EFE3C8', { roughness: 0.7 });
    const bone = new T.Group();
    const shaft = new T.Mesh(new T.CylinderGeometry(0.09, 0.09, 1.4, 10), boneM);
    shaft.rotation.z = Math.PI / 2;
    bone.add(shaft);
    for (const x of [-0.72, 0.72]) for (const z of [-0.09, 0.09]) { const k = new T.Mesh(new T.SphereGeometry(0.13, 10, 8), boneM); k.position.set(x, 0, z); bone.add(k); }
    bone.position.set(hw + 1.3, 0.13, hd - 0.6); bone.rotation.y = 0.6;
    g.add(bone);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return g;
  }
  // おかしの家の飾り：キャンディの柱、ガムドロップ、ペロペロキャンディ
  function candyBits(hw, hd) {
    const g = new T.Group();
    const stripe = cageTex('stripe'); stripe.wrapS = stripe.wrapT = T.RepeatWrapping; stripe.repeat.set(1, 3);
    const caneM = phys('#ffffff', { map: stripe, roughness: 0.35, clearcoat: 0.6 });
    for (const [x, z] of [[-hw - 0.15, -hd - 0.15], [hw + 0.15, -hd - 0.15], [-hw - 0.15, hd + 0.15], [hw + 0.15, hd + 0.15]]) {
      const back = z < 0;
      const h = back ? 2.6 : 0.85;
      const post = new T.Mesh(new T.CylinderGeometry(0.17, 0.17, h, 18), caneM);
      post.position.set(x, h / 2, z);
      g.add(post);
      const top = new T.Mesh(new T.SphereGeometry(0.24, 18, 12), phys(back ? '#FF7BA6' : '#7FD3F7', { roughness: 0.3, clearcoat: 0.8 }));
      top.position.set(x, h + 0.08, z);
      g.add(top);
    }
    const gumCols = ['#FF5C8A', '#FFD45E', '#7FD36B', '#7FB8F7', '#C08BF0', '#FF9A4D'];
    const r = prng(9);
    for (let i = 0; i < 16; i++) {
      const m = new T.Mesh(new T.SphereGeometry(0.13, 14, 10, 0, 6.283, 0, 1.75), phys(gumCols[i % gumCols.length], { roughness: 0.25, clearcoat: 1, transparent: true, opacity: 0.92 }));
      const k = (i + 0.5) / 16;
      m.position.set(-hw + k * hw * 2, 2.28, -hd - 0.12);
      m.scale.y = 0.9 + r() * 0.3;
      g.add(m);
    }
    const swirl = cageTex('swirl');
    for (const [x, z, s2] of [[-hw - 1.3, -hd - 0.6, 1], [hw + 1.2, -hd - 0.9, 0.8]]) {
      const stick = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 3 * s2, 10), phys('#FFFFFF', { roughness: 0.6 }));
      stick.position.set(x, 1.5 * s2, z);
      const disc = new T.Mesh(new T.CylinderGeometry(0.9 * s2, 0.9 * s2, 0.22, 40), [phys('#FF7BA6', { roughness: 0.3, clearcoat: 1 }), phys('#ffffff', { map: swirl, roughness: 0.25, clearcoat: 1 }), phys('#ffffff', { map: swirl, roughness: 0.25, clearcoat: 1 })]);
      disc.rotation.x = Math.PI / 2;
      disc.position.set(x, 3 * s2 + 0.7 * s2, z);
      g.add(stick, disc);
    }
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

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
    let wall = null, windowG = null, windowGlass = null, sunPatch = null, roomDay = null, roomNight = null;
    const roomProps = {};
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
      // 部屋の背景の絵（昼と夜を重ねて、時間で切りかえる）。読めたら、四角い窓と日だまりはしまう
      const roomPlane = (url, z) => {
        const m = new T.Mesh(new T.PlaneGeometry(22, 11), new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
        m.position.set(0, 5.5, z); m.visible = false; scene.add(m);
        imgTex(url, t => { m.material.map = t; m.material.needsUpdate = true; m.visible = true; windowG.visible = false; sunPatch.visible = false; clockKey = ''; if (st.clock) setClock(st.clock[0], st.clock[1]); });
        return m;
      };
      roomNight = roomPlane('assets/img/room-night.webp', -8.97);
      roomDay = roomPlane('assets/img/room-day.webp', -8.96);
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
      roomProps.pot = pot; roomProps.books = books;
    }

    // 床（ホット側がほんのり暖色）とガラス・枠。ケージの大きさと見た目を変えると作り直す
    const sand = canvasTexture(sandCanvas(), { srgb: true });
    sand.flipY = true;
    const TK = { hw: TANK.hw, hd: TANK.hd };
    const cageG = new T.Group();
    scene.add(cageG);
    let floor = null;
    const frontGlass = [];
    let cageKey = '';
    function buildCage(theme) {
      while (cageG.children.length) { const c = cageG.children.pop(); disposeTree(c); }
      const c = makeCage(theme, TK.hw, TK.hd, sand);
      floor = c.floor;
      frontGlass.length = 0;
      frontGlass.push(...c.front);
      cageG.add(c.group);
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
    function setCage(c) {
      c = c || {};
      const size = CAGE_SIZES[c.size] ? c.size : 'std', theme = CAGE_THEMES[c.theme] ? c.theme : 'glass';
      const key = size + '|' + theme;
      if (key === cageKey) return;
      const sizeChanged = !cageKey || cageKey.split('|')[0] !== size;
      cageKey = key;
      TK.hw = CAGE_SIZES[size].hw; TK.hd = CAGE_SIZES[size].hd;
      BOUNDS.x = TK.hw - 0.7; BOUNDS.zMin = -TK.hd + 0.6; BOUNDS.zMax = TK.hd - 0.5;
      buildCage(theme);
      buildHF();
      if (!sizeChanged) return;
      // 大きいケージは、カメラを少し引いて全体が見えるように
      const f = size === 'std' ? 1 : Math.max(TK.hw / TANK.hw * 1.1, TK.hd / TANK.hd);
      HOME.pos.set(0, 7.6 * f, 12.6 * f);
      HOME.look.set(0, 0.2, -0.4 * f);
      Object.assign(sun.shadow.camera, { left: -TK.hw - 2.5, right: TK.hw + 2.5, top: TK.hd + 3.5, bottom: -TK.hd - 3.5 });
      sun.shadow.camera.updateProjectionMatrix();
      heat.position.x = TK.hw - 0.7;
      if (roomProps.pot) roomProps.pot.position.set(TK.hw + 1.1, 0, -TK.hd - 1.7);
      if (roomProps.books) roomProps.books.position.set(-TK.hw - 1.1, 0, TK.hd + 0.9);
      const n = st.poops.length; setPoops(0); setPoops(n);
      st.x = clamp(st.x, -BOUNDS.x + 1, BOUNDS.x - 1); st.z = clamp(st.z, BOUNDS.zMin + 1, BOUNDS.zMax - 1);
    }
    let HIDE = null;
    let obstacles = [];   // ぶつかる家具（トンネルは左右の壁だけ）
    let placed = [];      // 置いてある家具ぜんぶ（選択・水入れ探しなど）
    let climbs = [];      // よじ登れる家具
    // よじ登れる家具の高さ（床を細かいマス目に分けて、上から光線を当てて測る）
    const HF = { c: 0.12, nx: 0, nz: 0, h: null };
    function buildHF() {
      HF.nx = Math.ceil(TK.hw * 2 / HF.c) + 1; HF.nz = Math.ceil(TK.hd * 2 / HF.c) + 1;
      HF.h = new Float32Array(HF.nx * HF.nz);
      if (!climbs.length) return;
      const rc = new T.Raycaster(), down = new T.Vector3(0, -1, 0), from = new T.Vector3();
      for (const o of climbs) {
        o.updateMatrixWorld(true);
        const bb = new T.Box3().setFromObject(o);
        const i0 = Math.max(0, Math.floor((bb.min.x + TK.hw) / HF.c)), i1 = Math.min(HF.nx - 1, Math.ceil((bb.max.x + TK.hw) / HF.c));
        const j0 = Math.max(0, Math.floor((bb.min.z + TK.hd) / HF.c)), j1 = Math.min(HF.nz - 1, Math.ceil((bb.max.z + TK.hd) / HF.c));
        for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
          rc.set(from.set(-TK.hw + i * HF.c, bb.max.y + 1, -TK.hd + j * HF.c), down);
          const hit = rc.intersectObject(o, true).find(h => h.object.name !== 'water');
          if (hit && hit.point.y > HF.h[j * HF.nx + i]) HF.h[j * HF.nx + i] = hit.point.y;
        }
      }
    }
    function heightAt(x, z) {
      if (!HF.h) return 0;
      const fx = clamp((x + TK.hw) / HF.c, 0, HF.nx - 1.001), fz = clamp((z + TK.hd) / HF.c, 0, HF.nz - 1.001);
      const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, H = HF.h, n = HF.nx;
      return lerp(lerp(H[j * n + i], H[j * n + i + 1], u), lerp(H[(j + 1) * n + i], H[(j + 1) * n + i + 1], u), v);
    }
    let decorKey = '';
    let edit = null; // もようがえ中なら { sel }
    const ring = new T.Mesh(new T.RingGeometry(0.9, 1, 48), new T.MeshBasicMaterial({ color: '#FFC94A', transparent: true, opacity: 0.9, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    ring.visible = false;
    scene.add(ring);
    const contactMat = new T.MeshBasicMaterial({ map: gradientCanvasTexture([[0, 'rgba(40,25,10,.35)'], [0.6, 'rgba(40,25,10,.12)'], [1, 'rgba(40,25,10,0)']]), transparent: true, depthWrite: false });
    // 家具の実際の形（ばく然とした円ではなく、回転した長方形）で当たり判定する
    const boxCache = {};
    function boxOf(t, def, built) {
      if (boxCache[t]) return boxCache[t];
      const keepPos = built.position.clone(), keepRot = built.rotation.y;
      built.position.set(0, 0, 0); built.rotation.y = 0; built.updateMatrixWorld(true);
      const b = new T.Box3().setFromObject(built);
      built.position.copy(keepPos); built.rotation.y = keepRot; built.updateMatrixWorld(true);
      const k = def.soft ? 0.5 : 0.92;
      return (boxCache[t] = {
        cx: (b.min.x + b.max.x) / 2, cz: (b.min.z + b.max.z) / 2,
        hx: Math.max(0.2, (b.max.x - b.min.x) / 2 * k), hz: Math.max(0.2, (b.max.z - b.min.z) / 2 * k),
      });
    }
    // 点(px,pz)から家具までの距離（中にいたらマイナス）と、外へ向かう向き
    function sdObstacle(o, px, pz) {
      const c = Math.cos(o.rot), sn = Math.sin(o.rot), B = o.box;
      const dx = px - o.x, dz = pz - o.z;
      const lx = dx * c - dz * sn - B.cx, lz = dx * sn + dz * c - B.cz;
      const qx = Math.abs(lx) - B.hx, qz = Math.abs(lz) - B.hz;
      let d, nx, nz;
      if (qx > 0 || qz > 0) {
        const ax = Math.max(qx, 0), az = Math.max(qz, 0);
        d = Math.hypot(ax, az); nx = Math.sign(lx) * ax / d; nz = Math.sign(lz) * az / d;
      } else if (qx > qz) { d = qx; nx = Math.sign(lx) || 1; nz = 0; }
      else { d = qz; nx = 0; nz = Math.sign(lz) || 1; }
      return { d, wx: nx * c + nz * sn, wz: -nx * sn + nz * c };
    }
    let lastDecor = [];
    // 家具の3Dモデルを読みこみおえたら、置いてある家具を作り直す
    function refreshDecor() { for (const k in boxCache) delete boxCache[k]; decorKey = ''; setDecor(lastDecor); }
    function setDecor(list) {
      lastDecor = list || [];
      const key = JSON.stringify(list || []);
      if (key === decorKey) return;
      decorKey = key;
      if (st.hidePeek) wake();
      st.gait = null;
      while (decorG.children.length) { const c = decorG.children.pop(); disposeTree(c); }
      obstacles = []; placed = []; climbs = [];
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
        const B = boxOf(d.t, def, o);
        const ob = { x: d.x, z: d.z, r: def.r, i, t: d.t, rot: d.rot || 0, box: B };
        placed.push(ob);
        const c = Math.cos(d.rot || 0), s2 = Math.sin(d.rot || 0);
        const local = (lx, lz) => ({ x: d.x + lx * c + lz * s2, z: d.z - lx * s2 + lz * c });
        if (def.drink) {
          o.updateMatrixWorld(true);
          const w = o.getObjectByName('water');
          if (w) { const wp = w.getWorldPosition(new T.Vector3()); ob.water = { x: wp.x, z: wp.z, y: wp.y, r: w.userData.r || 0.6 }; }
        }
        if (def.climb) climbs.push(o);
        else if (def.tunnel) {
          // トンネル：左右の壁だけにぶつかる。中は通りぬけられる
          const wt = B.hx * 0.36;
          for (const sgn of [-1, 1]) obstacles.push(Object.assign({}, ob, { box: { cx: B.cx + sgn * (B.hx - wt / 2), cz: B.cz, hx: wt / 2, hz: B.hz } }));
        } else obstacles.push(ob);
        if (def.shelter && !HIDE) {
          const sp = local(def.shelter.x, def.shelter.z);
          HIDE = def.tunnel
            ? { x: sp.x, z: sp.z, face: (d.rot || 0) + Math.PI, ob, tunnel: true, door: local(0, B.hz + 1.6), backDoor: local(0, -B.hz - 1.6) }
            : { x: sp.x, z: sp.z, face: (d.rot || 0) + Math.PI, ob };
        }
      });
      buildHF();
      showSel();
    }
    function showSel() {
      const d = edit && edit.sel != null ? placed.find(o => o.i === edit.sel) : null;
      ring.visible = !!d;
      if (d) { ring.position.x = d.x; ring.position.z = d.z; ring.scale.setScalar(d.r + 0.15); }
    }
    function setEdit(e) { edit = e; if (e) setClose(false); showSel(); }
    // 家具にめりこまないように、体にそって押し出す
    function resolveObstacles(g) {
      g = g || st;
      const S = 0.95 * g.size;
      // 鼻先から尻尾の先まで、体にそって点を取る（尻尾は細いので余裕を小さく）
      const pts = [[2.0, 0.22], [1.4, 0.34], [0.6, 0.4], [-0.2, 0.4], [-1.0, 0.34], [-1.8, 0.3], [-2.6, 0.2], [-3.4, 0.12]];
      for (let it = 0; it < 4; it++) {
        for (const o of obstacles) {
          if (HIDE && o.i === HIDE.ob.i && (g.mode === 'hidePeek' || !HIDE.tunnel && (g.sleeping || g.mode === 'toHide'))) continue;
          for (const [k, w] of pts) {
            const px = g.x + Math.sin(g.yaw) * k * S, pz = g.z + Math.cos(g.yaw) * k * S;
            const r = sdObstacle(o, px, pz), min = w * S;
            if (r.d < min) { g.x += r.wx * (min - r.d); g.z += r.wz * (min - r.d); }
          }
        }
        const m = 1.4 * g.size;
        g.x = clamp(g.x, -BOUNDS.x + m, BOUNDS.x - m);
        g.z = clamp(g.z, BOUNDS.zMin + m, BOUNDS.zMax - m * 0.6);
      }
    }
    const freeAt = (x, z, pad) => obstacles.every(o => sdObstacle(o, x, z).d > pad);
    function freePoint(pad, xa, xb, za, zb) {
      for (let k = 0; k < 40; k++) { const x = rand(xa, xb), z = rand(za, zb); if (freeAt(x, z, pad)) return { x, z }; }
      return { x: rand(xa, xb), z: rand(za, zb) };
    }
    const poopSpot = i => [[TK.hw - 1.1, -TK.hd + 0.7], [TK.hw - 1.55, -TK.hd + 0.5], [TK.hw - 0.95, -TK.hd + 1.15]][i % 3];

    const st = {
      gk: null, id: null, key: '', size: 1, x: 0.5, z: 0.8, yaw: 0.4,
      mode: 'idle', wait: 10, target: null, sleeping: false, zzz: 0,
      foods: [], poops: [], t: 0, phase: 0, walkW: 0, blinkT: 2, blinkV: 0,
      lick: 0, happy: 0, stalk: 0, meal: null, hunt: null, eatLook: 0, eatPitch: 0, look: 0, tiltT: 0, active: true, night: false,
      drop: 0.04, curl: 0, pitch: 0,
      heatGlow: 1, heatPref: 0,
      close: false, observe: true, orbit: 0.55, elev: 0.3, zoom: 1,
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
      camBtn.textContent = on ? (st.observe ? '全身に戻す' : 'ケースに戻す') : '顔をアップ';
      camBtn.setAttribute('aria-pressed', String(on));
      container.classList.toggle('closeup', on);
    }
    camBtn.addEventListener('click', e => { e.stopPropagation(); setClose(!st.close); });
    setClose(false);

    function setObserve(on) {
      st.observe = !!on;
      setClose(false);
      if (handlers.onObserve) handlers.onObserve(st.observe);
    }

    function setGecko(look) {
      if (!look) {
        if (st.gk) { scene.remove(st.gk.root); disposeGecko(st.gk); }
        st.gk = null; st.id = null; st.key = '';
        st.gait = null;
        blob.visible = false;
        return;
      }
      const key = lookKey(look);
      if (look.id !== st.id) {
        Object.assign(st, { x: rand(-1.5, 2), z: rand(-0.5, 1.5), yaw: rand(-1, 1), mode: 'idle', wait: rand(8, 14), sleeping: false, stalk: 0, hidePeek: null, act: null, target: null });
        st.gait = null; st.phase = 0; st.walkW = 0; st.spd = 0; st.prevYaw = null; st.walkProgress = null; st.pauseT = 0; st.burst = null; st.idleT = null;
      }
      st.profile = behaviorProfile(look.seed);
      st.tame = look.tame || 0;
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

    function spawnFood(kind, opt) {
      opt = opt || {};
      const obj = buildFood(kind);
      if (opt.dust) dustFood(obj);
      let x, z;
      let tries = 0;
      do { x = rand(-TK.hw + 2, TK.hw - 1.5); z = rand(-TK.hd + 1.4, TK.hd - 1); tries++; } while ((Math.hypot(x - st.x, z - st.z) < 3 || !freeAt(x, z, 0.4) || heightAt(x, z) > 0.05) && tries < 60);
      obj.position.set(x, 0, z);
      obj.rotation.y = rand(0, 6.28);
      scene.add(obj);
      const food = { kind, obj, t: rand(0.4, 1), hop: null, dust: !!opt.dust, refuse: !!opt.refuse };
      if (kind === 'paste') {
        // 練り餌は小さなお皿にのせて置く
        const dish = new T.Mesh(new T.CylinderGeometry(0.3, 0.26, 0.06, 24), phys('#E9E4DA', { roughness: 0.4, clearcoat: 0.5 }));
        dish.position.set(x, 0.03, z); dish.castShadow = dish.receiveShadow = true;
        scene.add(dish);
        food.dish = dish;
        obj.position.y = 0.06;
      }
      st.foods.push(food);
      if (opt.refuse) {
        // 気づいて見るけれど、ぷいっと向きを変える
        if (!opt.quiet && !st.sleeping) { st.peek = clamp(angleTo(st.yaw, Math.atan2(x - st.x, z - st.z)), -0.7, 0.7); st.peekT = 1.6; st.refuseT = 1.7; }
      } else { if (st.sleeping || st.hidePeek) wake(); st.wagT = 1.6; if (st.act) endAct(); }
    }
    // 食べ残し：食べなかったえさの数を、保存されている数にそろえる
    function dropDish(f, later) {
      if (!f.dish) return;
      const d = f.dish; f.dish = null;
      if (later) setTimeout(() => { scene.remove(d); disposeTree(d); }, later); else { scene.remove(d); disposeTree(d); }
    }
    function setLeftovers(kinds) {
      const have = st.foods.filter(f => f.refuse);
      for (let i = kinds.length; i < have.length; i++) { const f = have[i]; st.foods.splice(st.foods.indexOf(f), 1); scene.remove(f.obj); disposeTree(f.obj); dropDish(f); }
      for (let i = have.length; i < kinds.length; i++) spawnFood(kinds[i], { refuse: true, quiet: true });
    }
    function takeFoods() {
      endMealObj(); st.meal = null; st.hunt = null; endTweezers(false); endHandling(true);
      if (st.shedAct && st.shedAct.flake) scene.remove(st.shedAct.flake);
      st.shedAct = null;
      const kinds = st.foods.map(f => ({ kind: f.kind, dust: f.dust, refuse: f.refuse }));
      st.foods.forEach(f => { scene.remove(f.obj); disposeTree(f.obj); dropDish(f); });
      st.foods = [];
      return kinds;
    }
    function setPoops(n) {
      while (st.poops.length > n) { const p = st.poops.pop(); scene.remove(p); disposeTree(p); }
      while (st.poops.length < n) {
        const p = buildPoop();
        const [x, z] = poopSpot(st.poops.length);
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
      st.clock = [hour, season];
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
      if (sunPatch && !(roomDay && roomDay.visible)) { sunPatch.visible = day > 0.05; sunPatch.material.opacity = day; sunPatch.position.x = -4 - 3 * dusk + 3 * dawn; }
      if (wall) wall.material.color.copy(C('#5A5470').lerp(C('#E9E4D8'), day).lerp(C('#F2B48A'), dusk * 0.65));
      if (roomDay && roomDay.visible) {
        // 夜の絵の上に昼の絵を重ね、明るさで切りかえる。夕方は少しオレンジに
        const tint = C('#ffffff').lerp(C('#F6B98E'), dusk * 0.6).lerp(C('#F7D2C8'), dawn * 0.3);
        roomDay.material.opacity = day; roomDay.material.color.copy(tint);
        roomNight.material.opacity = 1; roomNight.material.color.copy(C('#C9C4DA').lerp(C('#ffffff'), night));
        if (wall) wall.material.color.copy(C('#2E2A36').lerp(C('#D9C29A'), day));
      }
    }
    function setNight(on) { setClock(on ? 22 : 13, 'summer'); }
    // 今のケースを写真に撮る（アルバム用。小さめの JPEG）
    function snapshot(width, preserve) {
      renderer.render(scene, camera);
      const src = renderer.domElement;
      const w = Math.min(width || 480, src.width), h = Math.round(w * src.height / src.width);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(src, 0, 0, w, h);
      return c.toDataURL('image/jpeg', 0.72);
    }
    function setDirty(on) { dirt.visible = on; }
    function wake() {
      if (st.hidePeek) { st.hidePeek = null; st.mode = 'idle'; st.wait = 0.8; }
      if (!st.sleeping) return;
      st.sleeping = false;
      st.mode = 'idle';
      st.wait = 0.8;
    }
    // 眠りから覚めても、すぐ飛び出さず入口からそっと周囲を確かめる。
    function peekFromHide() {
      if (!HIDE || !st.gk || !st.sleeping || st.hand || st.pair || st.foods.some(f => !f.refuse)) return false;
      // 両側に入口があるシェルターでは、寝ている向きの入口から顔を出す。
      const yaw = HIDE.tunnel ? HIDE.face : HIDE.face + Math.PI, S = 0.95 * st.size;
      const door = HIDE.backDoor || HIDE.door || { x: HIDE.x + Math.sin(yaw) * HIDE.ob.r, z: HIDE.z + Math.cos(yaw) * HIDE.ob.r };
      const margin = 1.4 * st.size;
      st.hidePeek = { phase: 'out', t: 0, origin: { x: st.x, z: st.z }, yaw,
        goal: { x: clamp(door.x - Math.sin(yaw) * 2.2 * S, -BOUNDS.x + margin, BOUNDS.x - margin), z: clamp(door.z - Math.cos(yaw) * 2.2 * S, BOUNDS.zMin + margin, BOUNDS.zMax - margin) } };
      st.sleeping = false; st.mode = 'hidePeek'; st.target = null;
      return true;
    }
    function stepHidePeek(dt) {
      const q = st.hidePeek;
      if (!q || !HIDE) { wake(); return 0; }
      q.t += dt;
      let step = 0;
      if (q.phase === 'out' || q.phase === 'back') {
        const to = q.phase === 'back' ? q.origin : q.goal;
        step = moveToward(to.x, to.z, 0.35, dt);
        if (Math.hypot(to.x - st.x, to.z - st.z) < 0.16 || q.t > 8) {
          if (q.phase === 'back') { st.hidePeek = null; st.sleeping = true; st.mode = 'idle'; st.wait = (st.night ? rand(30, 60) : rand(60, 120)) * st.profile.rest; st.zzz = 0.8; }
          else { q.phase = 'look'; q.t = 0; st.peekT = 0; seen('look'); }
        }
      } else {
        st.yaw += angleTo(st.yaw, q.yaw) * Math.min(1, dt * 2);
        st.peek = Math.sin(q.t * 1.5) * 0.48; st.peekT = 0.3;
        if (q.t > 3.5 * st.profile.rest) {
          const goOut = Math.random() < (st.night ? 0.65 : 0.18) + st.tame / 500;
          if (goOut) { st.hidePeek = null; st.mode = 'idle'; st.wait = 0.5; }
          else { q.phase = 'back'; q.t = 0; }
        }
      }
      return step;
    }

    function screenPos(obj) {
      const p = new T.Vector3();
      obj.getWorldPosition(p);
      p.y += 0.5;
      p.project(camera);
      return { x: (p.x + 1) / 2 * 100, y: (1 - p.y) / 2 * 100 };
    }
    function fx(text, cls, at) {
      if (!st.gk) return;
      const pos = screenPos(at || st.gk.bones.head);
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
      if (st.tw && !edit) { st.twDrag = { x: e.clientX, y: e.clientY }; try { el.setPointerCapture(e.pointerId); } catch (err) { /* noop */ } return; }
      if (st.hand) { st.strokeDrag = { x: e.clientX, y: e.clientY }; try { el.setPointerCapture(e.pointerId); } catch (err) { /* noop */ } return; }
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) { const [a, b] = [...touches.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); }
      down = { lx: e.clientX, ly: e.clientY, moved: 0 };
      if (st.close) { try { el.setPointerCapture(e.pointerId); } catch (err) { /* noop */ } }
    });
    el.addEventListener('pointermove', e => {
      if (st.twDrag && st.tw) { wiggleTweezers(e.clientX - st.twDrag.x, e.clientY - st.twDrag.y); st.twDrag = { x: e.clientX, y: e.clientY }; return; }
      if (st.strokeDrag && st.hand) {
        const r = el.getBoundingClientRect();
        ray.setFromCamera({ x: (e.clientX - r.left) / r.width * 2 - 1, y: -(e.clientY - r.top) / r.height * 2 + 1 }, camera);
        const a = new T.Vector3(); st.gk.bones.mid.getWorldPosition(a);
        if (ray.ray.distanceToPoint(a) < 1.4 * st.size) strokeGecko(Math.hypot(e.clientX - st.strokeDrag.x, e.clientY - st.strokeDrag.y));
        st.strokeDrag = { x: e.clientX, y: e.clientY };
        return;
      }
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
      if (st.twDrag) { st.twDrag = null; return; }
      if (st.strokeDrag) { st.strokeDrag = null; if (st.hand && st.gk) { st.lick = 0.9; st.tiltT = 1.2; } return; }
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
      for (let i = st.foods.length - 1; i >= 0; i--) {
        const f = st.foods[i];
        if (f.held || !f.refuse) continue;
        if (ray.ray.distanceToPoint(f.obj.position) < 0.8) {
          st.foods.splice(i, 1); scene.remove(f.obj); disposeTree(f.obj); dropDish(f);
          handlers.onTakeFood && handlers.onTakeFood(f.kind);
          return;
        }
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
          if (!st.hand && !st.pair && !st.act && Math.random() < 0.3) startAct('startle');
          else { st.lick = 0.9; st.tiltT = 1.2; }
          handlers.onTapGecko && handlers.onTapGecko();
        }
      }
    });
    el.addEventListener('pointercancel', e => { touches.delete(e.pointerId); pinch = 0; down = null; });

    // ---------- 動き
    const _m = new T.Vector3();
    function mouthWorld() { st.gk.mouth.getWorldPosition(_m); return _m; }
    function moveToward(tx, tz, speed, dt, g, turnLimit = 2.2) {
      g = g || st;
      const dx = tx - g.x, dz = tz - g.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.05) return 0;
      const diff = angleTo(g.yaw, Math.atan2(dx, dz));
      g.yaw += clamp(diff * (1 - Math.exp(-dt * 5)), -dt * turnLimit, dt * turnLimit);
      // 大きな旋回では前進を控えて踏み替える。到着直前にも小さく減速する。
      const alignment = Math.max(0.08, Math.pow(Math.max(0, Math.cos(diff)), 2));
      const desired = speed * alignment * clamp(d / 0.65, 0.12, 1);
      g.spd = lerp(g.spd || 0, desired, 1 - Math.exp(-dt * (desired > (g.spd || 0) ? 3 : 7)));
      const step = Math.min(d, g.spd * dt);
      g.x += Math.sin(g.yaw) * step;
      g.z += Math.cos(g.yaw) * step;
      return step;
    }
    function clampPos(dt) {
      if (st.hand && st.hand.phase !== 'offer' && st.hand.phase !== 'shy') return;
      resolveObstacles();
      const m = 1.4 * st.size;
      st.x = clamp(st.x, -BOUNDS.x + m, BOUNDS.x - m);
      st.z = clamp(st.z, BOUNDS.zMin + m, BOUNDS.zMax - m * 0.6);
      // 歩いている時間ではなく、実際に進めない時間だけを数える。
      // 立ち止まって周囲を見る間や旋回中に、行き先を選び直さない。
      if (['walk', 'toHide', 'toDrink', 'toBask'].includes(st.mode) && !st.hand && !st.pair && !st.hunt && !st.act) {
        const prev = st.walkProgress;
        const progressing = !prev || prev.target !== st.target || Math.hypot(st.x - prev.x, st.z - prev.z) > dt * 0.01 || Math.abs(angleTo(prev.yaw, st.yaw)) > dt * 0.02;
        st.walkTime = progressing || st.pauseT > 0 ? 0 : (st.walkTime || 0) + dt;
        st.walkProgress = { x: st.x, z: st.z, yaw: st.yaw, target: st.target };
        if (st.walkTime > 4) { st.mode = 'idle'; st.target = null; st.wait = calmRest(); st.walkTime = 0; st.walkProgress = null; }
      } else { st.walkTime = 0; st.walkProgress = null; }
    }

    function stepFoods(dt) {
      for (const f of st.foods) {
        if (f.held) continue;
        if (f.hop) {
          f.hop.k += dt / f.hop.dur;
          const k = Math.min(1, f.hop.k);
          f.obj.position.x = lerp(f.hop.x0, f.hop.x1, k);
          f.obj.position.z = lerp(f.hop.z0, f.hop.z1, k);
          f.obj.position.y = isCricket(f.kind) ? Math.sin(Math.PI * k) * (f.kind === 'cricketS' ? 0.35 : 0.55) : 0;
          if (k >= 1) f.hop = null;
          continue;
        }
        if (f.kind === 'paste') continue; // 練り餌は動かない
        if (f.kind === 'worm') f.obj.rotation.y += Math.sin(st.t * 6) * dt * 1.5;
        f.t -= dt;
        if (f.t <= 0) {
          const reach = f.kind === 'cricket' ? 1.4 : f.kind === 'cricketS' ? 1.0 : f.kind === 'dubia' ? 0.6 : 0.2;
          const x1 = clamp(f.obj.position.x + rand(-reach, reach), -BOUNDS.x, BOUNDS.x);
          const z1 = clamp(f.obj.position.z + rand(-reach, reach), BOUNDS.zMin, BOUNDS.zMax);
          f.t = rand(0.9, 2.2);
          if (heightAt(x1, z1) > 0.05 || !freeAt(x1, z1, 0.2)) continue;
          f.obj.rotation.y = Math.atan2(x1 - f.obj.position.x, z1 - f.obj.position.z);
          f.hop = { x0: f.obj.position.x, z0: f.obj.position.z, x1, z1, k: 0, dur: isCricket(f.kind) ? 0.35 : 1.2 };
          f.t = rand(0.9, 2.2);
        }
      }
    }

    // ---- ごはんの捕まえ方：飛びつく → くわえて振る → もぐもぐ → ごっくん → 口のまわりをぺろり
    function hopAway(f) {
      const p = f.obj.position, a = Math.atan2(p.x - st.x, p.z - st.z) + rand(-0.9, 0.9), d = rand(1.2, 2.2);
      const x1 = clamp(p.x + Math.sin(a) * d, -BOUNDS.x, BOUNDS.x), z1 = clamp(p.z + Math.cos(a) * d, BOUNDS.zMin, BOUNDS.zMax);
      f.obj.rotation.y = Math.atan2(x1 - p.x, z1 - p.z);
      f.hop = { x0: p.x, z0: p.z, x1, z1, k: 0, dur: 0.3 };
      f.t = rand(0.6, 1.4);
    }
    const puffs = [];
    const puffGeo = new T.SphereGeometry(0.035, 6, 4);
    function puff(x, z, S) {
      for (let i = 0; i < 7; i++) {
        const m = new T.Mesh(puffGeo, new T.MeshBasicMaterial({ color: '#D9C9A3', transparent: true, opacity: 0.85, depthWrite: false }));
        m.position.set(x + rand(-0.15, 0.15) * S, 0.03, z + rand(-0.15, 0.15) * S);
        scene.add(m);
        puffs.push({ m, vx: rand(-0.9, 0.9), vy: rand(0.8, 1.6), vz: rand(-0.9, 0.9), t: 0 });
      }
    }
    function stepPuffs(dt) {
      for (let i = puffs.length - 1; i >= 0; i--) {
        const q = puffs[i]; q.t += dt;
        q.vy -= 5 * dt;
        q.m.position.x += q.vx * dt; q.m.position.y = Math.max(0.01, q.m.position.y + q.vy * dt); q.m.position.z += q.vz * dt;
        q.m.material.opacity = Math.max(0, 0.85 * (1 - q.t / 0.55));
        if (q.t > 0.55) { scene.remove(q.m); q.m.material.dispose(); puffs.splice(i, 1); }
      }
    }
    function catchFood(food, S) {
      const i = st.foods.indexOf(food);
      if (i >= 0) st.foods.splice(i, 1);
      food.hop = null;
      dropDish(food, 3000);
      const chews = food.kind === 'worm' ? 3 : food.kind === 'dubia' ? 5 : food.kind === 'cricketS' || food.kind === 'paste' ? 2 : 4;
      st.meal = { obj: food.obj, kind: food.kind, t: 0, ph: 'hold', chews, s0: food.obj.scale.x };
      seen('strike');
      if (food.held && st.tw) { food.held = false; st.tw.food = null; st.tw.doneAt = performance.now(); seen('tweezers'); }
      st.hunt = null; st.stalk = 0;
      fx('パクッ', 'eat');
      handlers.onEat && handlers.onEat(food.kind, food.dust);
    }
    function endMealObj() {
      const M = st.meal;
      if (M && M.obj) { scene.remove(M.obj); disposeTree(M.obj); M.obj = null; }
    }
    function stepMeal(dt, S) {
      const M = st.meal;
      M.t += dt;
      const hy = st.yaw + st.look * 0.6;
      if (M.ph === 'hold') {
        // くわえたまま、首を左右にぶんぶん振って弱らせる（ミルワームは引っぱるだけ）
        const k = Math.min(1, M.t / 0.7);
        st.eatLook = M.kind === 'worm' ? 0 : Math.sin(M.t * 28) * 0.32 * (1 - k);
        if (M.kind !== 'worm' && !M.shook) { M.shook = true; seen('shake'); }
        st.eatPitch = M.kind === 'worm' ? 0.06 * Math.sin(k * Math.PI) : -0.05;
        if (M.t > 0.7) { M.ph = 'chew'; M.t = 0; }
      } else if (M.ph === 'chew') {
        // もぐもぐ：かむたびに頭が小さく上下して、えさが口の中へ消えていく
        const per = 0.34, n = M.t / per;
        st.eatPitch = -Math.abs(Math.sin(n * Math.PI)) * 0.1 + 0.03;
        if (M.obj) M.obj.scale.setScalar(M.s0 * Math.max(0.15, 1 - 0.85 * Math.min(1, n / M.chews)));
        if (n >= M.chews) { endMealObj(); M.ph = 'gulp'; M.t = 0; }
      } else if (M.ph === 'gulp') {
        // ごっくん：頭をくいっと上げて飲みこむ
        st.eatPitch = 0.16 * Math.sin(Math.min(1, M.t / 0.45) * Math.PI);
        if (M.t > 0.5) { M.ph = 'lick'; M.t = 0; st.lick = 0.9; M.licks = 1; seen('lips'); }
      } else if (M.ph === 'lick') {
        // 口のまわりをぺろり、ぺろり
        if (M.t > 0.95 && M.licks < 2) { st.lick = 0.9; M.licks++; }
        if (M.t > 1.9) st.meal = null;
      }
      if (M.obj) {
        const mp = mouthWorld();
        const sink = M.ph === 'chew' ? Math.min(1, M.t / (0.34 * M.chews)) : 0;
        const fwd = (0.06 - 0.06 * sink) * S;
        M.obj.position.set(mp.x + Math.sin(hy) * fwd, Math.max(0.02, mp.y - 0.035), mp.z + Math.cos(hy) * fwd);
        M.obj.rotation.set(0, hy + Math.PI / 2 + (M.kind === 'worm' ? Math.sin(M.t * 16) * 0.45 : 0), 0);
      }
    }
    // ---- しぐさ（図鑑に登録する）
    function seen(id) { handlers.onBehavior && handlers.onBehavior(id); }

    // ---- 脱皮：頭から少しずつ古い皮を脱ぐ。顔を床にこすりつけたり、皮をくわえて引っぱって食べたりする
    const flakeMat = new T.MeshStandardMaterial({ color: '#EEEAE0', roughness: 0.9, transparent: true, opacity: 0.85, side: T.DoubleSide });
    function makeFlake(S) {
      const g = new T.PlaneGeometry(0.34 * S, 0.22 * S, 4, 3);
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setZ(i, (Math.random() - 0.5) * 0.06 * S);
      g.computeVertexNormals();
      return new T.Mesh(g, flakeMat);
    }
    function shedPeel() { return st.shedP == null ? -1 : clamp((st.shedP - 0.6) / 0.4, 0, 1); }
    function stepShedAct(dt, S) {
      const A = st.shedAct;
      A.t += dt;
      if (A.type === 'rub') {
        // 顔を床や石にこすりつけて、口のまわりの皮をはがす
        st.eatPitch = 0.28 + Math.sin(A.t * 9) * 0.05;
        st.eatLook = Math.sin(A.t * 6) * 0.35;
        st.tiltT = 0.6;
        if (A.t > 2.4) st.shedAct = null;
      } else {
        // 体の横の皮をくわえて、ぐいっと引っぱり、もぐもぐ食べる
        const turn = A.side * 1.35 * Math.sin(Math.min(1, A.t / 0.7) * Math.PI / 2) * (A.t < 2.2 ? 1 : Math.max(0, 1 - (A.t - 2.2) / 0.5));
        st.eatLook = turn;
        st.eatPitch = 0.12;
        if (A.t > 0.75 && !A.flake && A.t < 1.0) {
          A.flake = makeFlake(S); scene.add(A.flake); seen('shedPull');
        }
        if (A.flake) {
          const mp = mouthWorld(), hy = st.yaw + st.look * 0.6 + turn * 0.6;
          A.flake.position.set(mp.x + Math.sin(hy) * 0.08 * S, Math.max(0.03, mp.y - 0.02), mp.z + Math.cos(hy) * 0.08 * S);
          A.flake.rotation.set(Math.sin(A.t * 7) * 0.4, hy, 0.5);
          if (A.t > 2.2) {
            // もぐもぐ食べて、なくなる
            const k = Math.min(1, (A.t - 2.2) / 1.2);
            st.eatPitch = 0.12 - Math.abs(Math.sin(k * Math.PI * 3)) * 0.1;
            A.flake.scale.setScalar(Math.max(0.05, 1 - k));
            if (k >= 1) { scene.remove(A.flake); A.flake.geometry.dispose(); A.flake = null; st.lick = 0.9; seen('shedEat'); }
          }
        }
        if (A.t > 3.6) { if (A.flake) { scene.remove(A.flake); A.flake.geometry.dispose(); } st.shedAct = null; }
      }
    }

    // ---- ピンセットでごはん：レオパの目の前にエサをさし出し、指でこするとエサがゆれる。ゆらすと飛びつく
    const twMat = phys('#C9CED3', { metalness: 0.9, roughness: 0.28 });
    let twTip = null; // ピンセットの先（モデルの中の位置）
    function buildTweezers() {
      const outer = new T.Group();
      if (kitHas('Tweezers')) {
        const m = buildKit('Tweezers', 3.0);
        if (!twTip) {
          // 先端＝いちばん前（+Z）でいちばん低いところ
          const it = KIT.data.items.Tweezers, k = 3.0 / Math.max(it.size[0], it.size[2]);
          let best = null;
          m.traverse(o => { if (!o.isMesh) return; const pa = o.geometry.attributes.position; for (let i = 0; i < pa.count; i++) { const z = pa.getZ(i), y = pa.getY(i); if (!best || z - y * 0.2 > best.s) best = { s: z - y * 0.2, x: pa.getX(i), y, z }; } });
          twTip = new T.Vector3(best.x * k, best.y * k, best.z * k);
        }
        m.position.copy(twTip).multiplyScalar(-1);
        outer.add(m);
      } else {
        for (const sgn of [-1, 1]) {
          const arm = new T.Mesh(new T.BoxGeometry(0.07, 0.03, 3.2), twMat);
          arm.geometry.translate(0, 0, -1.6);
          arm.position.x = sgn * 0.045;
          arm.rotation.x = -0.6;
          outer.add(arm);
        }
      }
      outer.traverse(o => { if (o.isMesh) o.castShadow = true; });
      return outer;
    }
    function startTweezers(kind, opt) {
      endTweezers(false);
      const grp = buildTweezers();
      scene.add(grp);
      const obj = buildFood(kind);
      if (opt && opt.dust) dustFood(obj);
      scene.add(obj);
      const food = { kind, obj, t: 999, hop: null, held: true, dust: !!(opt && opt.dust) };
      st.foods.unshift(food);
      st.tw = { kind, grp, food, tip: new T.Vector3(), anchor: null, off: new T.Vector3(), lastMove: performance.now() - 5000, born: performance.now(), wig: 0, prevClose: st.close };
      if (st.sleeping) wake();
      setClose(true);
      st.zoom = 1.25; st.elev = 0.45;
    }
    // ピンセットを片づける。drop：つまんでいたごはんを床に落とす
    function endTweezers(drop) {
      const W = st.tw;
      if (!W) return;
      scene.remove(W.grp); disposeTree(W.grp);
      if (W.food && W.food.held && drop) { W.food.held = false; W.food.obj.position.y = 0; W.food.t = rand(0.5, 1.2); }
      st.tw = null;
      setClose(W.prevClose);
    }
    function stepTweezers(dt) {
      const W = st.tw;
      if (!W) return;
      const S = 0.95 * st.size;
      const H = st.hunt;
      // エサの基準の位置：レオパの口の少し前。いちど決めたら動かさない（離れすぎたときだけ置きなおす）
      const mp = mouthWorld();
      if (W.food && W.food.held && (!W.anchor || (Math.hypot(W.anchor.x - mp.x, W.anchor.z - mp.z) > 3.6 && !(H && (H.ph === 'stalk' || H.ph === 'strike'))))) {
        const fx = Math.sin(st.yaw), fz = Math.cos(st.yaw);
        W.anchor = new T.Vector3(mp.x + fx * (1.0 * S + 0.55), 0.42 + 0.15 * S, mp.z + fz * (1.0 * S + 0.55));
      }
      if (performance.now() - W.lastMove > 400) W.off.multiplyScalar(Math.max(0, 1 - dt * 2.5));
      const prev = W.tip.clone();
      W.tip.copy(W.anchor).add(W.off);
      W.tip.x = clamp(W.tip.x, -BOUNDS.x, BOUNDS.x); W.tip.z = clamp(W.tip.z, BOUNDS.zMin, BOUNDS.zMax);
      const sp = prev.distanceTo(W.tip) / Math.max(dt, 0.001);
      W.wig = lerp(W.wig, Math.min(1, sp / 2.5), Math.min(1, dt * 6));
      // ピンセットは画面の右上からさしこむ（レオパやエサにかぶらないように）
      const d = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize().multiplyScalar(-1);
      W.grp.position.copy(W.tip);
      W.grp.rotation.set(0, Math.atan2(d.x, d.z), 0);
      if (W.food && W.food.held) {
        W.food.obj.position.set(W.tip.x, W.tip.y - 0.05, W.tip.z);
        W.food.obj.rotation.set(Math.sin(st.t * 14) * 0.5 * W.wig, Math.atan2(d.x, d.z) + Math.PI / 2, Math.sin(st.t * 11) * 0.3 * (0.3 + W.wig));
        if (performance.now() - W.born > 45000) endTweezers(true);
      } else {
        // 食べられたら、ピンセットを上に引いて片づける
        W.anchor.y += dt * 2.5;
        if (performance.now() - (W.doneAt || 0) > 1100) endTweezers(false);
      }
    }
    // 指でこすった分だけ、エサを左右・前後にゆらす
    function wiggleTweezers(dx, dy) {
      const W = st.tw;
      const r = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize();
      const f = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 2).setY(0).normalize();
      W.off.addScaledVector(r, dx * 0.012).addScaledVector(f, dy * 0.012);
      const L = W.off.length();
      if (L > 0.9) W.off.multiplyScalar(0.9 / L);
      W.lastMove = performance.now();
    }

    // ---- ふれあい：手のひらを差し出すと乗ってくる。持ちあげたり、なでたり、手から手へ歩かせたり
    let handProf = null; // 手のひらの高さ（指先方向の位置ごと）
    function buildHand(len) {
      const g = new T.Group();
      if (kitHas('Hand')) {
        const it = KIT.data.items.Hand;
        const m = buildKit('Hand', len);
        const k = len / Math.max(it.size[0], it.size[2]);
        // もとは手のひらが下向きなので、ひっくり返して上に向ける
        const flip = new T.Group();
        flip.rotation.x = Math.PI;
        flip.position.y = it.size[1] * k;
        flip.add(m);
        g.add(flip);
      } else {
        const palm = new T.Mesh(new T.BoxGeometry(len, 0.35 * len / 5, len * 0.45), phys('#E9B99B', { roughness: 0.6 }));
        palm.position.y = 0.175 * len / 5;
        g.add(palm);
      }
      g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      if (!handProf) {
        // 長さ1あたりの高さを、指先方向に32か所測っておく
        const t = buildHand.tmp || (buildHand.tmp = true);
        const probe = g.clone(); probe.scale.setScalar(1 / len); probe.updateMatrixWorld(true);
        const rc = new T.Raycaster(), down = new T.Vector3(0, -1, 0), prof = [];
        for (let i = 0; i <= 32; i++) {
          const x = -0.5 + i / 32;
          let top = 0;
          for (const z of [-0.06, 0, 0.06]) { rc.set(new T.Vector3(x, 5, z), down); const h = rc.intersectObject(probe, true)[0]; if (h) top = Math.max(top, h.point.y); }
          prof.push(top);
        }
        handProf = prof;
      }
      g.userData.len = len;
      return g;
    }
    // 手の上の高さ（手の外なら -1）
    function handHeightAt(h, x, z) {
      if (!h || !handProf) return -1;
      const len = h.userData.len;
      const dx = x - h.position.x, dz = z - h.position.z, c = Math.cos(h.rotation.y), s2 = Math.sin(h.rotation.y);
      const lx = dx * c - dz * s2, lz = dx * s2 + dz * c;
      if (Math.abs(lz) > len * 0.2 || Math.abs(lx) > len * 0.5) return -1;
      const f = clamp((lx / len + 0.5) * 32, 0, 32), i = Math.min(31, Math.floor(f));
      return h.position.y + lerp(handProf[i], handProf[i + 1], f - i) * len * 0.92;
    }
    function surfaceAt(x, z) {
      let y = heightAt(x, z);
      if (st.hand) for (const h of st.hand.hands) { const v = handHeightAt(h, x, z); if (v > y) y = v; }
      if (st.pair && st.pair.hand && !st.pair.handUp) { const v = handHeightAt(st.pair.hand, x, z); if (v > y) y = v; }
      return y;
    }
    const handFwd = () => new T.Vector3(Math.sin(st.yaw), 0, Math.cos(st.yaw));
    function placeHand(h, cx, cz, yaw, y) { h.position.set(cx, y, cz); h.rotation.y = yaw - Math.PI / 2; }
    function startHandling(tame) {
      endHandling(true);
      if (st.sleeping || st.hidePeek) wake();
      const S = 0.95 * st.size, len = 5.4 * S;
      const h = buildHand(len);
      scene.add(h);
      const f = handFwd();
      // 鼻先の少し前に、手のひらを置く（指先はレオパと同じ向き）
      let cx = st.x + f.x * (2.0 * S + len * 0.55), cz = st.z + f.z * (2.0 * S + len * 0.55);
      cx = clamp(cx, -BOUNDS.x + len * 0.3, BOUNDS.x - len * 0.3); cz = clamp(cz, BOUNDS.zMin + len * 0.3, BOUNDS.zMax - len * 0.3);
      placeHand(h, cx, cz, Math.atan2(cx - st.x, cz - st.z), 0);
      st.act = null;
      st.hand = { phase: 'offer', hands: [h], cur: 0, t: 0, tame, shy: tame < 25 && Math.random() < 0.5, onT: 0, prevClose: st.close, stroke: 0 };
      st.mode = 'idle'; st.wait = 999;
      setClose(true); st.zoom = 1.35; st.elev = 0.5;
    }
    function endHandling(silent) {
      const H = st.hand;
      if (!H) return;
      for (const h of H.hands) { scene.remove(h); disposeTree(h); }
      st.hand = null;
      st.mode = 'idle'; st.wait = rand(1, 3);
      st.x = clamp(st.x, -BOUNDS.x + 1, BOUNDS.x - 1); st.z = clamp(st.z, BOUNDS.zMin + 1, BOUNDS.zMax - 1);
      setClose(H.prevClose);
      if (!silent) handlers.onHandling && handlers.onHandling('end');
    }
    function handCmd(cmd) {
      const H = st.hand;
      if (!H) return;
      if (cmd === 'down' && H.phase !== 'down') { H.phase = 'down'; H.t = 0; }
      if (cmd === 'walk' && H.phase === 'lifted') {
        // つぎの手を、いまの手の指先の先に差し出す（ケースの外に出そうなら内側へ曲げる）
        const cur = H.hands[H.cur], len = cur.userData.len, yaw = cur.rotation.y + Math.PI / 2;
        // いまの手の指先に、つぎの手首がつくように置く。ケースの外に出るなら、向きを少しずつ変えて探す
        const tipX = cur.position.x + Math.sin(yaw) * len * 0.46, tipZ = cur.position.z + Math.cos(yaw) * len * 0.46;
        let nx = 0, nz = 0, ny = yaw;
        for (const d of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8, 2.4, -2.4, Math.PI]) {
          ny = yaw + d;
          nx = tipX + Math.sin(ny) * len * 0.44; nz = tipZ + Math.cos(ny) * len * 0.44;
          if (Math.abs(nx) < BOUNDS.x - len * 0.35 && nz > BOUNDS.zMin + len * 0.2 && nz < BOUNDS.zMax - len * 0.2) break;
        }
        let h = H.hands[1 - H.cur];
        if (!h) { h = buildHand(len); scene.add(h); H.hands.push(h); }
        placeHand(h, nx, nz, ny, cur.position.y - 0.05);
        H.phase = 'walk'; H.t = 0; H.next = H.hands.indexOf(h);
      }
    }
    function stepHandling(dt) {
      const H = st.hand;
      H.t += dt;
      const S = 0.95 * st.size;
      const cur = H.hands[H.cur];
      const len = cur.userData.len;
      const yawC = cur.rotation.y + Math.PI / 2;
      const ctr = (h, k) => ({ x: h.position.x + Math.sin(h.rotation.y + Math.PI / 2) * k, z: h.position.z + Math.cos(h.rotation.y + Math.PI / 2) * k });
      let step = 0;
      if (H.phase === 'offer') {
        // においを確かめてから乗る（なれていない子は、そっぽを向くことも）
        if (H.t < 1.6) { st.yaw += angleTo(st.yaw, Math.atan2(cur.position.x - st.x, cur.position.z - st.z)) * Math.min(1, dt * 3); if (H.t > 0.8 && st.lick <= 0 && !H.licked) { st.lick = 0.9; H.licked = true; } }
        else if (H.shy) { H.phase = 'shy'; H.t = 0; handlers.onHandling && handlers.onHandling('shy'); }
        else {
          const c = ctr(cur, len * 0.02);
          step = moveToward(c.x, c.z, 0.9, dt);
          if (Math.hypot(c.x - st.x, c.z - st.z) < 0.2) { H.phase = 'lift'; H.t = 0; handlers.onHandling && handlers.onHandling('on'); }
        }
      } else if (H.phase === 'shy') {
        // くるっと向きを変えて、少し離れる
        step = moveToward(st.x - Math.sin(yawC) * 2, st.z - Math.cos(yawC) * 2, 0.9, dt);
        if (H.t > 2.2) endHandling(false);
      } else if (H.phase === 'lift') {
        cur.position.y = lerp(0, 1.8, smooth(Math.min(1, H.t / 1.4)));
        st.yaw += angleTo(st.yaw, yawC) * Math.min(1, dt * 2);
        if (H.t > 1.4) { H.phase = 'lifted'; H.t = 0; }
      } else if (H.phase === 'lifted') {
        H.onT += dt;
        // 手の上で、ときどき少し歩いて向きを変える
        H.wT = (H.wT == null ? rand(6, 10) : H.wT) - dt;
        if (H.wT <= 0) { H.goal = Math.random() < 0.5 ? ctr(cur, rand(-0.15, 0.2) * len) : null; H.wT = rand(8, 14); if (Math.random() < 0.4) st.lick = 0.9; }
        if (H.goal) { step = moveToward(H.goal.x, H.goal.z, 0.35, dt, st, 1.1); if (!step) H.goal = null; }
        const limit = 28 + H.tame * 0.3;
        if (H.onT > limit && !H.restless) { H.restless = true; handlers.onHandling && handlers.onHandling('restless'); }
        if (H.restless) { const e = ctr(cur, len * 0.45); step = moveToward(e.x, e.z, 0.7, dt); }
        if (H.onT > limit + 14) handCmd('down');
      } else if (H.phase === 'walk') {
        // 手から手へ、とことこ歩いてわたる
        const nx = H.hands[H.next];
        const c = ctr(nx, len * 0.02);
        step = moveToward(c.x, c.z, 0.9, dt);
        nx.position.y = lerp(nx.position.y, cur.position.y, Math.min(1, dt * 3));
        if (Math.hypot(c.x - st.x, c.z - st.z) < 0.2) {
          const old = H.cur; H.cur = H.next; H.next = null; H.phase = 'lifted'; H.t = 0;
          H.hands[old].position.y = -50; // 前の手は見えないところへ
          handlers.onHandling && handlers.onHandling('walked');
        }
      } else if (H.phase === 'down') {
        cur.position.y = Math.max(0, cur.position.y - dt * 1.6);
        if (cur.position.y <= 0.001) {
          // 床におりたら、手から前へおりて終わり
          const e = ctr(cur, len * 0.95);
          step = moveToward(e.x, e.z, 0.9, dt);
          if (Math.hypot(e.x - st.x, e.z - st.z) < 0.3 || H.t > 6) endHandling(false);
        }
      }
      // 手の上にいるあいだは、手からはみ出さないように
      if (st.hand && st.hand.phase !== 'offer' && st.hand.phase !== 'shy' && (st.hand.phase !== 'down' || cur.position.y > 0.01)) {
        const hs = [H.hands[H.cur]].concat(H.next != null ? [H.hands[H.next]] : []);
        if (!hs.some(h => handHeightAt(h, st.x, st.z) > -0.5)) {
          const c = ctr(cur, 0);
          st.x = lerp(st.x, c.x, 0.2); st.z = lerp(st.z, c.z, 0.2);
        }
      }
      return step;
    }
    // なでる：手の上のレオパの背中を指でなぞる
    function strokeGecko(dist) {
      const H = st.hand;
      if (!H || (H.phase !== 'lifted' && H.phase !== 'walk')) return;
      H.stroke += dist;
      if (H.stroke > 140) {
        H.stroke = 0; st.happy = 1.4; st.content = 1.6;
        hearts(2);
        handlers.onHandling && handlers.onHandling('stroke');
      }
    }

    // ---------- ペアリング：オスが手に乗ってやってきて、メスに求愛する（寄りそうまで約40秒）
    const P2 = restPose();
    const pairMid = new T.Object3D();
    scene.add(pairMid);
    let mateBlob = null;
    function pairSay(ev) { handlers.onPairing && handlers.onPairing(ev); }
    function startPairing(look) {
      endPairing(true);
      endHandling(true);
      endTweezers(false);
      if (!st.gk || !look) return false;
      if (st.sleeping) wake();
      const S = 0.95 * st.size, SM = 0.95 * look.size;
      // 1回ごとに少しずつ長さを変える（すぐ受け入れる子も、じらす子もいる）
      const j = () => rand(0.85, 1.15);
      const D = { enter: 6 * j(), notice: 5 * j(), approach: 10 * j(), shy: 8 * j(), woo: 4 * j(), snuggle: 7 * j() };
      // メスは家具から離れた、まんなかの広いところへ出てくる
      const meet = freePoint(1.9 * S, -TK.hw * 0.45, TK.hw * 0.45, -TK.hd + 2.6, TK.hd - 2.2);
      // オスは、メスからいちばん離れた空きスペースに、手に乗せて入れる
      const len = 5.4 * SM;
      let drop = null;
      for (let k = 0; k < 24; k++) {
        const c = freePoint(len * 0.45, -BOUNDS.x + len * 0.55, BOUNDS.x - len * 0.55, BOUNDS.zMin + len * 0.35, BOUNDS.zMax - len * 0.35);
        const d = Math.hypot(c.x - meet.x, c.z - meet.z);
        if (!drop || d > drop.d) drop = { x: c.x, z: c.z, d };
      }
      // 手は横向きにおろす（おりたオスが、あとでメスに気づいてふりむけるように）
      const toMeet = Math.atan2(meet.x - drop.x, meet.z - drop.z);
      let hyaw = toMeet + Math.PI / 2;
      { const ex = drop.x + Math.sin(hyaw) * len * 0.6, ez = drop.z + Math.cos(hyaw) * len * 0.6; if (Math.abs(ex) > BOUNDS.x - 1 || ez < BOUNDS.zMin + 1 || ez > BOUNDS.zMax - 1) hyaw = toMeet - Math.PI / 2; }
      const hand = buildHand(len);
      scene.add(hand);
      // 手の中心は、手首側に少しずらしておく（指先から前へおりられるように）
      placeHand(hand, drop.x - Math.sin(hyaw) * len * 0.15, drop.z - Math.cos(hyaw) * len * 0.15, hyaw, 6);
      const gk = buildGecko(look, 'high');
      setPupil(gk, st.night);
      gk.root.scale.setScalar(SM);
      scene.add(gk.root);
      if (!mateBlob) { mateBlob = blob.clone(); scene.add(mateBlob); }
      mateBlob.visible = true;
      const M = {
        gk, size: look.size, x: hand.position.x, z: hand.position.z, yaw: hyaw, y: 6, slope: 0, mode: 'pair',
        phase: 0, walkW: 0, look: 0, pitch: 0, stalk: 0, happy: 0, lick: 0, tilt: 0, drop: 0.04, blinkT: 2, blinkV: 0, content: 0, onHand: true,
      };
      st.pair = { ph: 'enter', t: 0, all: 0, D, meet, hand, M, fLook: 0, fStill: false, heartT: 0, prevClose: st.close };
      st.mode = 'idle'; st.wait = 999; st.meal = null; st.hunt = null; st.act = null; st.hidePeek = null;
      setClose(false);
      pairSay('enter');
      return true;
    }
    function endPairing(silent) {
      const R = st.pair;
      if (!R) return;
      if (R.hand) { scene.remove(R.hand); disposeTree(R.hand); }
      scene.remove(R.M.gk.root); disposeGecko(R.M.gk);
      if (mateBlob) mateBlob.visible = false;
      st.pair = null;
      st.mode = 'idle'; st.wait = rand(1, 3); st.drop = 0.06;
      if (!silent) pairSay('done');
    }
    function skipPairing() { if (st.pair) endPairing(false); }
    const hctr = (h, k) => ({ x: h.position.x + Math.sin(h.rotation.y + Math.PI / 2) * k, z: h.position.z + Math.cos(h.rotation.y + Math.PI / 2) * k });
    function nextPair(R, ph) { R.ph = ph; R.t = 0; R.sub = null; pairSay(ph); }
    // メス（いつものレオパ）の動き。歩いた距離を返す
    function stepPairF(dt, S) {
      const R = st.pair, M = R.M;
      const toM = Math.atan2(M.x - st.x, M.z - st.z);
      let step = 0;
      st.stalk = 0;
      R.fLook = clamp(angleTo(st.yaw, toM), -0.75, 0.75);
      if (R.ph === 'enter') {
        // 物音に気づいて、広いところへ出てくる
        step = moveToward(R.meet.x, R.meet.z, 1.2, dt);
        if (!step) st.yaw += angleTo(st.yaw, toM + 0.9) * Math.min(1, dt * 1.5);
      } else if (R.ph === 'notice' || R.ph === 'approach') {
        if (R.ph === 'notice' && R.t > 1 && R.t < 1.1 && st.lick <= 0) st.lick = 0.9;
        // 横を向いたまま、目だけでオスを追う
        st.yaw += angleTo(st.yaw, toM + 1.1) * Math.min(1, dt * 0.8);
      } else if (R.ph === 'shy') {
        // 少しだけ逃げて、立ち止まって、ふりかえる
        if (!R.flee) {
          const away = toM + Math.PI + rand(-0.5, 0.5);
          let best = null;
          for (const da of [0, 0.5, -0.5, 1, -1, 1.5, -1.5]) {
            const x = clamp(st.x + Math.sin(away + da) * 2.6 * S, -BOUNDS.x + 1.6, BOUNDS.x - 1.6), z = clamp(st.z + Math.cos(away + da) * 2.6 * S, BOUNDS.zMin + 1.6, BOUNDS.zMax - 1.2);
            if (freeAt(x, z, 1.2 * S)) { best = { x, z }; break; }
            if (!best) best = { x, z };
          }
          R.flee = best;
        }
        if (R.t < R.D.shy * 0.45) step = moveToward(R.flee.x, R.flee.z, 1.1, dt);
        else {
          st.yaw += angleTo(st.yaw, toM + 1.3) * Math.min(1, dt * 1);
          if (R.t > R.D.shy * 0.6 && !R.tilted) { st.tiltT = 1.2; R.tilted = true; }
        }
      } else {
        // 受け入れて、体を低くしてじっとする
        st.drop = lerp(st.drop, 0.1, Math.min(1, dt * 2));
        R.fLook = clamp(angleTo(st.yaw, toM), -0.5, 0.5);
        if (R.ph === 'snuggle') st.content = 1;
      }
      return step;
    }
    // オスの動き
    function stepPairM(dt) {
      const R = st.pair, M = R.M, S = 0.95 * st.size, SM = 0.95 * M.size;
      const toF = Math.atan2(st.x - M.x, st.z - M.z);
      const dF = Math.hypot(st.x - M.x, st.z - M.z);
      let step = 0, rattle = 0, look = 0, pitch = 0, tilt = 0, happy = 0;
      if (R.ph === 'enter') {
        const h = R.hand;
        if (R.t < 2.6) {
          // 手に乗って、上からそっとおりてくる
          h.position.y = lerp(6, 0, smooth(R.t / 2.6));
          const c = hctr(h, 0); M.x = c.x; M.z = c.z;
          look = Math.sin(R.t * 1.6) * 0.4;
        } else if (M.onHand) {
          const e = hctr(h, h.userData.len * 0.9);
          step = moveToward(e.x, e.z, 0.9, dt, M);
          if (Math.hypot(e.x - M.x, e.z - M.z) < 0.3) M.onHand = false;
        } else {
          R.handUp = true;
          look = clamp(angleTo(M.yaw, toF), -0.7, 0.7) * 0.5;
        }
      } else if (R.ph === 'notice') {
        // ぴたっと止まって、メスのにおいをかぐ（舌をぺろっ）
        M.yaw += angleTo(M.yaw, toF) * Math.min(1, dt * 1.2);
        look = clamp(angleTo(M.yaw, toF), -0.6, 0.6);
        if ((R.t > 0.8 && R.t < 0.85) || (R.t > 2.8 && R.t < 2.85)) M.lick = 0.9;
        pitch = -0.06;
        rattle = R.t > 3 ? 1 : 0;
      } else if (R.ph === 'approach' || (R.ph === 'shy' && R.t > R.D.shy * 0.3)) {
        // しっぽの先をぶるぶるふるわせながら、少し進んでは止まって近づく
        R.sub = R.sub || { go: true, t: rand(1.5, 2.5) };
        R.sub.t -= dt;
        if (R.sub.t <= 0) { R.sub.go = !R.sub.go; R.sub.t = R.sub.go ? rand(1.6, 2.6) : rand(0.8, 1.4); }
        const back = toF + Math.PI;
        const gx = st.x + Math.sin(back) * 2.3 * Math.max(S, SM), gz = st.z + Math.cos(back) * 2.3 * Math.max(S, SM);
        if (R.sub.go) step = moveToward(gx, gz, 0.55, dt, M);
        else M.yaw += angleTo(M.yaw, toF) * Math.min(1, dt * 2);
        rattle = step ? 1 : 2;
        look = clamp(angleTo(M.yaw, toF), -0.6, 0.6);
        pitch = -0.08;
      } else if (R.ph === 'shy') {
        // 逃げられて、首をかしげる
        tilt = Math.sin(Math.min(1, R.t / 1.2) * Math.PI) * 0.22;
        look = clamp(angleTo(M.yaw, toF), -0.6, 0.6);
      } else if (R.ph === 'woo' || R.ph === 'snuggle') {
        // メスの横にならんで、そっと寄りそう
        const fy = st.yaw;
        if (R.side == null) R.side = Math.sin(angleTo(fy, Math.atan2(M.x - st.x, M.z - st.z))) >= 0 ? 1 : -1;
        const off = 1.05 * (S + SM) / 2 * 1.15;
        const sx = st.x + Math.cos(fy) * off * R.side - Math.sin(fy) * 0.3 * SM, sz = st.z - Math.sin(fy) * off * R.side - Math.cos(fy) * 0.3 * SM;
        const dS = Math.hypot(sx - M.x, sz - M.z);
        if (dS > 0.12) step = moveToward(sx, sz, 0.5, dt, M);
        if (dS < 0.5) M.yaw += angleTo(M.yaw, fy) * Math.min(1, dt * 2);
        rattle = R.ph === 'woo' ? 2 : 0;
        look = clamp(angleTo(M.yaw, toF), -0.5, 0.5) * 0.6;
        if (R.ph === 'snuggle') { happy = 1; M.content = 1; tilt = -R.side * 0.12; }
      }
      // 寄りそうとき以外は、体が重ならないように
      if (R.ph !== 'woo' && R.ph !== 'snuggle' && !M.onHand && dF < 1.9 * Math.max(S, SM)) {
        const k = 1.9 * Math.max(S, SM) - dF;
        M.x -= Math.sin(toF) * k; M.z -= Math.cos(toF) * k;
      }
      if (!M.onHand) resolveObstacles(M);
      return { step, rattle, look, pitch, tilt, happy };
    }
    function stepPairing(dt) {
      const R = st.pair;
      if (!R) return;
      R.t += dt; R.all += dt;
      const M = R.M, SM = 0.95 * M.size;
      if (R.ph === 'enter' && R.t > R.D.enter && !M.onHand && !R.hand) nextPair(R, 'notice');
      else if (R.ph === 'notice' && R.t > R.D.notice) nextPair(R, 'approach');
      else if (R.ph === 'approach' && R.t > R.D.approach) nextPair(R, 'shy');
      else if (R.ph === 'shy' && R.t > R.D.shy) nextPair(R, 'woo');
      else if (R.ph === 'woo' && R.t > R.D.woo) nextPair(R, 'snuggle');
      else if (R.ph === 'snuggle' && R.t > R.D.snuggle) {
        nextPair(R, 'leave');
        if (R.hand) { scene.remove(R.hand); disposeTree(R.hand); R.hand = null; R.handUp = false; }
        // 手をオスの鼻先におろして、迎えにいく
        const len = 5.4 * SM;
        const h = buildHand(len);
        scene.add(h);
        let yaw = M.yaw, cx = 0, cz = 0;
        for (const d of [0, 0.7, -0.7, 1.4, -1.4, 2.1, -2.1, Math.PI]) {
          yaw = M.yaw + d;
          cx = M.x + Math.sin(yaw) * (1.6 * SM + len * 0.5); cz = M.z + Math.cos(yaw) * (1.6 * SM + len * 0.5);
          if (Math.abs(cx) < BOUNDS.x - len * 0.35 && cz > BOUNDS.zMin + len * 0.25 && cz < BOUNDS.zMax - len * 0.25) break;
        }
        placeHand(h, cx, cz, Math.atan2(cx - M.x, cz - M.z), 6);
        R.hand = h;
      }
      // オスをおろした手は、上へ引きあげて片づける
      if (R.handUp && R.hand && R.ph !== 'leave') {
        R.hand.position.y += dt * 2.2;
        if (R.hand.position.y > 7) { scene.remove(R.hand); disposeTree(R.hand); R.hand = null; R.handUp = false; }
      }
      let o = { step: 0, rattle: 0, look: 0, pitch: 0, tilt: 0, happy: 0 };
      if (R.ph === 'leave') {
        const h = R.hand, len = h.userData.len;
        if (R.t < 1.6) h.position.y = lerp(6, 0, smooth(R.t / 1.6));
        else if (!M.onHand) {
          const c = hctr(h, len * 0.02);
          o.step = moveToward(c.x, c.z, 0.9, dt, M);
          if (Math.hypot(c.x - M.x, c.z - M.z) < 0.2) { M.onHand = true; R.upT = 0; }
          if (R.t > 9) { M.x = c.x; M.z = c.z; M.onHand = true; R.upT = 0; }
        } else {
          R.upT += dt;
          M.yaw += angleTo(M.yaw, h.rotation.y + Math.PI / 2) * Math.min(1, dt * 2);
          h.position.y += dt * 2.4 * smooth(Math.min(1, R.upT));
          if (h.position.y > 7.5) { endPairing(false); return; }
        }
        o.look = Math.sin(R.all * 1.3) * 0.3;
        if (R.t < 0.1) st.happy = 0;
      } else o = stepPairM(dt);
      // ハートは2匹のあいだに
      pairMid.position.set((st.x + M.x) / 2, Math.max(st.y || 0, M.y || 0) + 0.6, (st.z + M.z) / 2);
      if (R.ph === 'snuggle') {
        R.heartT -= dt;
        if (R.heartT <= 0) { fx('♥', 'heart', pairMid); R.heartT = rand(0.9, 1.4); }
      }
      // オスの見た目
      if (!o.step) M.spd = (M.spd || 0) * Math.max(0, 1 - dt * 8);
      M.walkW = lerp(M.walkW, o.step > 0 ? 1 : 0, Math.min(1, dt * 6));
      M.blinkT -= dt;
      if (M.blinkT <= 0) M.blinkT = rand(2.5, 6);
      const closing = M.blinkT < 0.13 || (M.content > 0 && Math.sin(R.all * 2.2) > 0.2);
      M.blinkV = lerp(M.blinkV, closing ? 1 : 0, Math.min(1, dt * (closing ? 28 : 16)));
      M.look = lerp(M.look, o.look, Math.min(1, dt * 2.5));
      M.pitch = lerp(M.pitch, o.pitch, Math.min(1, dt * 3));
      M.tilt = lerp(M.tilt, o.tilt, Math.min(1, dt * 3));
      M.drop = lerp(M.drop, o.rattle ? 0.09 : o.step ? 0 : 0.06, Math.min(1, dt * 2));
      if (M.lick > 0) M.lick -= dt;
      if (M.onHand && R.hand) {
        const hy = handHeightAt(R.hand, M.x, M.z);
        M.y = hy > -0.5 ? hy : R.hand.position.y; M.slope = lerp(M.slope, 0, Math.min(1, dt * 6)); M.tailLift = 0.4;
      } else ground(M, dt, SM, false);
      Object.assign(P2, {
        t: R.all + 3.7, phase: M.phase, walk: M.walkW, look: M.look,
        pitch: M.pitch + Math.sin(M.phase * 2) * 0.035 * M.walkW, tilt: M.tilt, curl: 0,
        stalk: o.rattle ? (o.rattle > 1 ? 2.2 : 1.2) : 0, happy: o.happy, drop: M.drop, blink: M.blinkV,
        tongue: M.lick > 0 ? Math.sin((0.9 - M.lick) / 0.9 * Math.PI) : 0, breathe: Math.sin(R.all * 2.4), sway: 1,
      });
      const gk = M.gk;
      if (gk.U) { gk.U.uShedOn.value = 0; gk.U.uShedEdge.value = 9; gk.U.uTailFat.value = 0.05; gk.U.uTailLift.value = M.tailLift || 0; }
      gk.root.position.set(M.x, M.y, M.z);
      gk.root.rotation.order = 'YXZ';
      gk.root.rotation.set(-M.slope, M.yaw, 0);
      const previous = M.motionPrev || { x: M.x, z: M.z, yaw: M.yaw };
      const motion = { dx: M.x - previous.x, dz: M.z - previous.z, dyaw: angleTo(previous.yaw, M.yaw) };
      M.motionPrev = { x: M.x, z: M.z, yaw: M.yaw };
      stepFeet(M, dt, motion, (x, z) => M.onHand && R.hand ? Math.max(surfaceAt(x, z), handHeightAt(R.hand, x, z)) : surfaceAt(x, z), P2.drop);
      P2.phase = M.phase; P2.walk = M.walkW;
      pose(gk, P2);
      mateBlob.position.set(M.x, 0.012 + M.y, M.z);
      mateBlob.scale.set(2.2 * SM, 5.0 * SM, 1);
      mateBlob.rotation.z = M.yaw;
    }

    // ---------- レオパらしいしぐさ（あくび・伸び・ガラスぺろぺろ・トイレ・パトロールなど）
    // st.act = { type, t, ph, ... }。歩いて行く段階（go）と、その場でする段階に分かれる
    const ACT_POSE = { pitch: 0, drop: null, look: 0, tilt: 0, jaw: 0, wag: 0, blink: 0, churn: 0, tail: 0 };
    function startAct(type, extra) {
      if (st.hand || st.pair || st.meal || st.foods.some(f => !f.refuse) || st.sleeping) return false;
      st.act = Object.assign({ type, t: 0, ph: 'do', side: Math.random() < 0.5 ? -1 : 1 }, extra || {});
      st.mode = 'act';
      return true;
    }
    // 通常の休憩は実時間。個体の傾向を残しつつ、次々に歩き直さない。
    function calmRest() { return (st.night ? rand(8, 16) : rand(15, 30)) * st.profile.rest; }
    function endAct() { st.act = null; st.mode = 'idle'; st.wait = calmRest(); }
    function actGo(A, dt, nf) {
      const step = moveToward(A.to.x, A.to.z, 0.5 * nf * st.profile.walk, dt, st, 1.1);
      A.goT = (A.goT || 0) + dt;
      if (Math.hypot(A.to.x - st.x, A.to.z - st.z) < 0.18 || A.goT > 24) {
        if (A.path && A.path.length) { A.to = A.path.shift(); A.goT = 0; return step; }
        A.ph = 'do'; A.t = 0;
      }
      return step;
    }
    function stepAct(dt, S, nf) {
      const A = st.act, a = ACT_POSE;
      Object.assign(a, { pitch: 0, drop: null, look: 0, tilt: 0, jaw: 0, wag: 0, blink: 0, churn: 0, tail: 0 });
      A.t += dt;
      let step = 0;
      if (A.ph === 'go') { step = actGo(A, dt, nf); return step; }
      const k = (d) => Math.sin(Math.min(1, A.t / d) * Math.PI);
      if (A.type === 'yawn') {
        // くわっと大きくあくび
        const o = Math.pow(k(1.8), 0.7);
        a.jaw = 0.42 * o; a.pitch = -0.2 * o; a.blink = 0.7 * o;
        if (A.t > 1.8) endAct();
      } else if (A.type === 'stretch') {
        // 前足をつっぱって、ぐーっと伸び
        const o = k(2.2);
        a.pitch = -0.22 * o; a.drop = 0.04 - 0.09 * o; a.blink = 0.4 * o;
        if (A.t > 2.2) endAct();
      } else if (A.type === 'sniff') {
        // 鼻先を近づけて確かめ、舌で化学情報を集めてから顔を戻す。
        const o = k(3.0);
        a.pitch = 0.28 * o; a.drop = 0.06 + 0.035 * o;
        a.look = A.side * 0.15 * o;
        if (A.t > 1.15 && !A.licked) { st.lick = 0.9; A.licked = true; seen('lick'); }
        if (A.t > 3.0) endAct();
      } else if (A.type === 'settle') {
        // 体をゆっくり低くして休み、顔は床へ突き込まずに保つ。
        a.drop = lerp(0.06, 0.14, smooth(clamp(A.t / 1.6, 0, 1)));
        a.blink = 0.45 * smooth(clamp(A.t / 1.8, 0, 1)); a.pitch = 0.06;
        if (A.t > (A.dur || 7)) endAct();
      } else if (A.type === 'wag') {
        a.wag = Math.min(1, A.t * 2) * (A.t < 2.4 ? 1 : 0); a.look = A.side * 0.3;
        if (A.t > 2.8) endAct();
      } else if (A.type === 'eyelick') {
        // 目のまわりをぺろり
        if (A.t < 0.05) st.lick = 0.9;
        a.look = A.side * 0.35; a.tilt = A.side * 0.18; a.pitch = -0.06;
        if (A.t > 1.1) endAct();
      } else if (A.type === 'startle') {
        // びくっとかたまって、少しあとずさり
        a.pitch = -0.1; a.drop = 0.02;
        if (A.t > 0.35 && A.t < 0.95) { const v = 0.65 * dt; st.x -= Math.sin(st.yaw) * v; st.z -= Math.cos(st.yaw) * v; step = v; }
        if (A.t > 1.1) endAct();
      } else if (A.type === 'glass') {
        // ガラスの前で、舌でぺろぺろ確かめる
        st.yaw += angleTo(st.yaw, 0) * Math.min(1, dt * 3);
        a.pitch = -0.22;
        A.lt = (A.lt || 0) - dt;
        if (A.lt <= 0) { st.lick = 0.9; A.lt = rand(0.5, 0.9); }
        if (A.t > 3.5) endAct();
      } else if (A.type === 'dig') {
        // 前足で床をかりかり
        a.pitch = 0.14; a.churn = 1; a.drop = 0.07;
        A.pt = (A.pt || 0) - dt;
        if (A.pt <= 0) { const m = mouthWorld(); puff(m.x, m.z, S * 0.7); A.pt = 0.45; }
        if (A.t > 2.6) endAct();
      } else if (A.type === 'patrol') {
        endAct();
      } else if (A.type === 'flat') {
        // おなかを床にぺったりつけて、のんびり日なたぼっこ
        a.drop = 0.18; a.blink = 0.6; a.pitch = 0.06;
        if (A.t > A.dur) endAct();
      } else if (A.type === 'toilet') {
        // トイレの場所で、しっぽを少し上げて…
        st.yaw += angleTo(st.yaw, A.face) * Math.min(1, dt * 3);
        a.drop = 0.1; a.tail = 0.5 * k(1.8);
        if (A.t > 1.8) { const cb = A.cb; endAct(); if (cb) cb(); }
      } else endAct();
      return step;
    }
    // トイレ：いつもの隅へ歩いていって、フンをする（cb でフンを出す）
    function toilet(cb) {
      if (!st.gk || !startAct('toilet', { cb })) return false;
      const S = 0.95 * st.size, [px, pz] = poopSpot(st.poops.length);
      // おしり（体の中心から 1.5 くらい後ろ）がフンの場所に来るように、ケースのまんなかを向いて止まる
      const face = Math.atan2(-px, -pz);
      const x = clamp(px + Math.sin(face) * 1.5 * S, -BOUNDS.x + 1.4, BOUNDS.x - 1.4), z = clamp(pz + Math.cos(face) * 1.5 * S, BOUNDS.zMin + 1.4, BOUNDS.zMax - 1);
      Object.assign(st.act, { ph: 'go', to: { x, z }, face });
      return true;
    }
    // 歩きまわるしぐさを始める（パトロール・ガラス・ほる・ぺったり）
    function startWalkAct(type) {
      const S = 0.95 * st.size;
      if (type === 'glass') {
        const x = clamp(st.x + rand(-2, 2), -BOUNDS.x + 1.6, BOUNDS.x - 1.6), z = BOUNDS.zMax - 1.25 * S;
        if (!freeAt(x, z, 0.8 * S)) return false;
        return startAct('glass', { ph: 'go', to: { x, z } });
      }
      if (type === 'dig') {
        const to = HIDE && HIDE.door ? { x: HIDE.door.x, z: HIDE.door.z } : freePoint(1.2 * S, -TK.hw + 2, TK.hw - 2, -TK.hd + 2, TK.hd - 1.5);
        return startAct('dig', { ph: 'go', to });
      }
      if (type === 'flat') {
        const to = freePoint(1.4 * S, 1.2, TK.hw - 1.8, -TK.hd + 1.9, TK.hd - 1.4);
        return startAct('flat', { ph: 'go', to, dur: rand(8, 14) });
      }
      if (type === 'patrol') {
        // ケースのふちにそって、ぐるっと歩く
        const mx = BOUNDS.x - 1.5 * S, z0 = BOUNDS.zMin + 1.5 * S, z1 = BOUNDS.zMax - 1.3 * S;
        const corners = [{ x: -mx, z: z0 }, { x: mx, z: z0 }, { x: mx, z: z1 }, { x: -mx, z: z1 }];
        let i = 0, best = 1e9;
        corners.forEach((c, j) => { const d = Math.hypot(c.x - st.x, c.z - st.z); if (d < best) { best = d; i = j; } });
        const dir = Math.random() < 0.5 ? 1 : 3, n = 2 + Math.floor(Math.random() * 3);
        const path = [];
        for (let k = 0; k <= n; k++) {
          const c = corners[(i + k * dir) % 4];
          path.push(freeAt(c.x, c.z, 1.0 * S) ? c : freePoint(1.0 * S, c.x - 1.5, c.x + 1.5, c.z - 1.2, c.z + 1.2));
        }
        return startAct('patrol', { ph: 'go', to: path.shift(), path });
      }
      return false;
    }

    // 岩や石の上では、足もとの高さに合わせて体を持ちあげ、坂なら体をかたむける
    function ground(g, dt, S, fast, poseDrop) {
      const sy = Math.sin(g.yaw), cy = Math.cos(g.yaw);
      const hf = surfaceAt(g.x + sy * 1.3 * S, g.z + cy * 1.3 * S), hm = surfaceAt(g.x, g.z), hb = surfaceAt(g.x - sy * 1.1 * S, g.z - cy * 1.1 * S);
      let support = Math.max(hm, (hf + hb) / 2);
      for (const foot of MODEL.feet || []) {
        const x = g.x + (foot.x * cy + foot.z * sy) * S;
        const z = g.z + (-foot.x * sy + foot.z * cy) * S;
        const clearance = Math.max(0, 0.10 - Math.max(0, (poseDrop == null ? g.drop || 0.04 : poseDrop) - 0.04));
        support = Math.max(support, footSurface(surfaceAt, x, z, S) - clearance * S);
      }
      // 上りでは体を床の下に残さず、下りだけゆっくり追従する。
      g.y = Math.max(support, lerp(g.y || 0, support, Math.min(1, dt * (fast ? 14 : 8))));
      g.slope = lerp(g.slope || 0, clamp(Math.atan2(hf - hb, 2.4 * S), -0.8, 0.8), Math.min(1, dt * 6));
      // しっぽの途中と先が、足もとの床や岩より下にならない高さを計算して、しっぽを持ちあげる
      const cs = Math.cos(g.slope), sn = Math.sin(g.slope);
      let lift = 0;
      const dropM = (poseDrop == null ? g.drop || 0 : poseDrop) - 0.04;
      for (const [k, yb] of [[0.35, 0.03], [0.65, 0.005], [1, 0]]) {
        const zl = -1.55 - k * 2.93;
        const wx = g.x + sy * zl * S * cs, wz = g.z + cy * zl * S * cs;
        const wy = g.y + S * ((yb - dropM) * cs + zl * sn);
        const need = (surfaceAt(wx, wz) + 0.02 - wy) / S / k;
        if (need > lift) lift = need;
      }
      g.tailLift = lerp(g.tailLift || 0, Math.min(lift, 3), Math.min(1, dt * 10));
    }

    function stepGecko(dt) {
      const gk = st.gk;
      if (!gk) return;
      let step = 0;
      const food = st.foods.find(f => !f.refuse);
      if (st.refuseT > 0) { st.refuseT -= dt; if (st.refuseT <= 0 && !st.sleeping && !food && st.mode === 'idle') { st.wait = 0; } }
      const nf = st.night ? 1.35 : 1;
      const S = 0.95 * st.size;
      const before = { x: st.x, z: st.z, yaw: st.yaw };

      st.eatLook = 0; st.eatPitch = 0;
      if (st.hand) {
        step = stepHandling(dt) || 0;
        st.stalk = 0; st.hunt = null;
      } else if (st.pair) {
        step = stepPairF(dt, S);
        st.hunt = null;
      } else if (st.meal) {
        stepMeal(dt, S);
      } else if (food) {
        if (st.sleeping || st.hidePeek) wake();
        const fp = food.obj.position, mp = mouthWorld();
        const dMouth = Math.hypot(fp.x - mp.x, fp.z - mp.z);
        const aim = Math.atan2(fp.x - st.x, fp.z - st.z);
        const H = st.hunt || (st.hunt = { ph: 'track', t: 0, creep: false });
        H.t += dt;
        const still = food.held && st.tw && performance.now() - st.tw.lastMove > 3500 && H.ph !== 'strike';
        if (still) {
          // ピンセットが止まっていると、見つめるだけ（ゆらすと気づいて近づく）
          st.yaw += angleTo(st.yaw, aim) * Math.min(1, dt * 2);
          st.eatPitch = -0.04;
          if (H.ph === 'stalk') H.ph = 'track';
          H.t = 1;
        } else if (H.ph === 'strike') {
          // 一瞬で飛びつく
          st.yaw += angleTo(st.yaw, aim) * Math.min(1, dt * 14);
          const sp = Math.min(Math.max(0, dMouth - 0.05), H.speed * dt, H.left); H.left -= sp;
          st.x += Math.sin(st.yaw) * sp; st.z += Math.cos(st.yaw) * sp; step = sp;
          st.eatPitch = -0.2 * Math.sin(Math.min(1, H.t / 0.16) * Math.PI);
          if (dMouth < 0.3 * S + 0.16 && !food.hop) catchFood(food, S);
          else if (H.t > 0.2) { H.ph = 'miss'; H.t = 0; seen('miss'); }
        } else if (H.ph === 'miss') {
          // 空ぶり。顔を上げてきょとんとして、もう一度ねらう
          st.eatPitch = 0.08 * Math.sin(Math.min(1, H.t / 0.8) * Math.PI);
          if (H.t > 0.8) { H.ph = 'track'; H.t = 0; }
        } else if (dMouth < 1.1 * S + 0.35 && !food.hop) {
          // ぴたっと止まって、しっぽの先をぷるぷる → ねらいを定めて
          if (H.ph !== 'stalk') { H.ph = 'stalk'; H.t = 0; H.wait = rand(0.7, 1.8); seen('stalk'); }
          st.yaw += angleTo(st.yaw, aim) * Math.min(1, dt * 4);
          st.eatPitch = -0.1;
          if (H.t > H.wait && Math.abs(angleTo(st.yaw, aim)) < 0.3) {
            // コオロギは気配に気づいて跳ねて逃げることがある
            if (isCricket(food.kind) && Math.random() < 0.3) hopAway(food);
            H.ph = 'strike'; H.t = 0; H.speed = (dMouth + 0.3) / 0.15; H.left = dMouth + 0.15;
            puff(mp.x, mp.z, S);
          }
        } else {
          // 気づいたら首をのばして見つめ、近くなったら体を低くしてそろりそろり
          if (H.ph === 'stalk') H.ph = 'track';
          const reach = 2.9 * S;
          H.creep = dMouth < 3.4 * S;
          if (H.ph === 'track' && H.t < 0.6) { st.yaw += angleTo(st.yaw, aim) * Math.min(1, dt * 5); st.eatPitch = -0.05; }
          else step = moveToward(fp.x - Math.sin(aim) * reach, fp.z - Math.cos(aim) * reach, (H.creep ? 0.7 : 1.9) * nf, dt);
        }
        st.stalk = H.ph === 'stalk' || H.creep ? 1 : 0;
      } else if (st.hidePeek) {
        st.stalk = 0; st.hunt = null;
        step = stepHidePeek(dt);
      } else if (st.shedAct && !st.sleeping) {
        st.stalk = 0; st.hunt = null;
        stepShedAct(dt, S);
      } else if (st.act && !st.sleeping) {
        st.stalk = 0; st.hunt = null;
        step = stepAct(dt, S, nf);
      } else {
        st.stalk = 0; st.hunt = null;
        if (st.sleeping) {
          st.wait -= dt;
          st.zzz -= dt;
          if (st.zzz <= 0) { fx('z', 'zzz'); st.zzz = 1.8; }
          if (st.wait <= 0) {
            if (!(Math.random() < st.profile.peek && peekFromHide())) { wake(); const r1 = Math.random(); if (r1 < 0.4) startAct('yawn'); else if (r1 < 0.75) startAct('stretch'); }
          }
          if (HIDE) st.yaw += angleTo(st.yaw, HIDE.face) * Math.min(1, dt * 2);
        } else if (st.mode === 'drink' || st.mode === 'bask') {
          // 水をぺろぺろ飲む／石の横でじっとひなたぼっこ
          st.wait -= dt;
          if (st.target && st.target.face != null) st.yaw += angleTo(st.yaw, st.target.face) * Math.min(1, dt * 3);
          if (st.mode === 'drink') {
            st.lickT -= dt; if (st.lickT <= 0) { st.lick = 0.9; st.lickT = rand(0.9, 1.4); }
            const w = st.target && st.target.water;
            if (w) { const my = mouthWorld().y; st.drinkPitch = clamp((st.drinkPitch || 0) + (my - (w.y + 0.04)) * dt * 6, -0.3, 0.8); }
          }
          if (st.wait <= 0) { const was = st.mode; st.mode = 'idle'; st.wait = calmRest(); if (was === 'bask' && Math.random() < 0.4) startAct('yawn'); }
        } else if (st.mode === 'walk' || st.mode === 'toHide' || st.mode === 'toDrink' || st.mode === 'toBask') {
          // 本物のレオパのように、少し歩いては止まり、まわりを見てまた歩く
          if (st.pauseT > 0) {
            st.pauseT -= dt;
            st.yaw += angleTo(st.yaw, Math.atan2(st.target.x - st.x, st.target.z - st.z)) * Math.min(1, dt * 0.8);
          } else {
            step = moveToward(st.target.x, st.target.z, 0.55 * nf * st.profile.walk, dt, st, 1.1);
            st.burst = (st.burst == null ? rand(3, 6) : st.burst) - dt;
            if (st.burst <= 0 && Math.hypot(st.target.x - st.x, st.target.z - st.z) > 1.2) {
              st.burst = st.night ? rand(4, 8) : rand(3, 6);
              // 毎回ではなく、ときどき立ち止まる
              if (Math.random() < (st.night ? 0.5 : 0.7)) st.pauseT = st.night ? rand(1.2, 2.5) : rand(2, 4);
              if (st.pauseT > 0) {
                if (Math.random() < 0.35) st.lick = 0.9;
                else { st.peek = rand(-0.6, 0.6); st.peekT = st.pauseT; }
              }
            }
          }
          if (Math.hypot(st.target.x - st.x, st.target.z - st.z) < 0.15) {
            if (st.mode === 'toHide' && st.target.next) st.target = st.target.next;
            else if (st.mode === 'toHide') { st.sleeping = true; st.wait = (st.night ? rand(30, 60) : rand(60, 120)) * st.profile.rest; st.zzz = 0.8; st.mode = 'idle'; seen('hide'); }
            else if (st.mode === 'toDrink') { st.mode = 'drink'; st.wait = rand(3, 5); st.lickT = 0.2; seen('drink'); }
            else if (st.mode === 'toBask') { st.mode = 'bask'; st.wait = rand(8, 16); seen('bask'); }
            else { st.mode = 'idle'; st.wait = calmRest(); }
          }
        } else {
          st.wait -= dt;
          if (st.wait <= 0) {
            st.walkTime = 0;
            const dish = placed.find(o => o.water), stone = placed.find(o => o.t === 'stone' || o.t === 'stone2');
            const nextTo = (o, gap) => {
              // 家具の手前（ケースの中心に近い側）に、鼻先を向けて止まる
              const a = Math.atan2(-o.x * 0.6 - o.x * 0.4 + rand(-1.2, 1.2), -o.z + rand(-1, 1));
              const d = o.r + gap;
              const x = clamp(o.x + Math.sin(a) * d, -BOUNDS.x + 1.4, BOUNDS.x - 1.4), z = clamp(o.z + Math.cos(a) * d, BOUNDS.zMin + 1.4, BOUNDS.zMax - 1);
              return { x, z, face: Math.atan2(o.x - x, o.z - z) };
            };
            const r0 = Math.random();
            if (dish && r0 < 0.14) {
              // 口が水の真ん中あたりに来るように、器のふちに前足をかけて止まる
              const w = dish.water;
              const a = Math.atan2(st.x - w.x + rand(-0.6, 0.6), st.z - w.z + rand(-0.6, 0.6));
              const d = w.r * 0.35 + 1.85 * 0.95 * st.size;
              const x = clamp(w.x + Math.sin(a) * d, -BOUNDS.x + 1.4, BOUNDS.x - 1.4), z = clamp(w.z + Math.cos(a) * d, BOUNDS.zMin + 1.4, BOUNDS.zMax - 1);
              st.mode = 'toDrink'; st.target = { x, z, face: Math.atan2(w.x - x, w.z - z), water: w };
            }
            else if (stone && !st.night && r0 < 0.28) { st.mode = 'toBask'; st.target = { x: stone.x + rand(-0.3, 0.3), z: stone.z + rand(-0.3, 0.3), face: rand(0, 6.28) }; }
            else if ((!st.night || st.heatPref < 0) && Math.random() < (st.heatPref < 0 ? 0.5 : st.profile.hide) && HIDE) { st.mode = 'toHide'; st.target = HIDE.tunnel ? { x: HIDE.door.x, z: HIDE.door.z, next: { x: HIDE.x, z: HIDE.z } } : { x: HIDE.x, z: HIDE.z }; }
            else if (!st.night && Math.random() < 0.12) { st.sleeping = true; st.wait = rand(45, 90) * st.profile.rest; st.zzz = 0.8; seen('nap'); }
            else if (st.night && Math.random() < 0.3 && startWalkAct('patrol')) { /* 夜はケースのふちをパトロール */ }
            else if (Math.random() < 0.1 && startWalkAct('glass')) { /* ガラスをぺろぺろ */ }
            else if (Math.random() < 0.08 && startWalkAct('dig')) { /* 床をかりかり */ }
            else if (!st.night && st.heatPref >= 0 && Math.random() < 0.12 && startWalkAct('flat')) { /* 暖かい側でぺったり */ }
            else {
              // 寒いと暖かい側（右）へ、暑いと涼しい側（左）へ寄りがち
              let xa = -TK.hw + 2, xb = TK.hw - 1.8;
              if (st.heatPref > 0 && Math.random() < 0.75) xa = 0.5;
              if (st.heatPref < 0 && Math.random() < 0.75) xb = -0.5;
              st.mode = 'walk'; st.target = freePoint(1.4 * st.size, xa, xb, -TK.hd + 1.9, TK.hd - 1.3);
            }
          }
        }
      }
      clampPos(dt);

      // 歩いた距離で足を動かす（足がすべらないように）
      const motion = { dx: st.x - before.x, dz: st.z - before.z, dyaw: angleTo(before.yaw, st.yaw) };
      const moving = Math.hypot(motion.dx, motion.dz) > 0.00001;
      if (!moving) st.spd = (st.spd || 0) * Math.max(0, 1 - dt * 8);
      // GLB の足は最後に実際の移動量から更新する。押し戻された距離も反映する。
      if (!gk.glb) {
        st.walkW = lerp(st.walkW, moving ? clamp((st.spd || 0) / 0.6, 0.35, 1) : 0, Math.min(1, dt * 6));
        st.phase += Math.hypot(motion.dx, motion.dz) / (0.95 * S) * Math.PI;
      }
      // 向きを変えた速さで、体を弓なりにしならせる
      const yawRate = angleTo(st.prevYaw == null ? st.yaw : st.prevYaw, st.yaw) / Math.max(dt, 1e-3);
      st.prevYaw = st.yaw;
      st.bend = lerp(st.bend || 0, clamp(yawRate * 0.45, -0.9, 0.9), Math.min(1, dt * 4));

      // まばたき
      st.blinkT -= dt;
      if (st.blinkT <= 0) st.blinkT = rand(2.5, 6);
      if (st.content > 0) st.content -= dt;
      const closing = st.sleeping || st.blinkT < 0.13 || (st.content > 0 && Math.sin(st.t * 2.2) > 0.2);
      st.blinkV = lerp(st.blinkV, closing ? 1 : 0, Math.min(1, dt * (closing ? 28 : 16)));

      // こっちを見る・えさを見る
      let wantLook = 0;
      // じっとしているときは、ときどき舌をぺろっと出したり、きょろきょろ見回したりする
      if (!moving && !st.sleeping && !food && st.mode === 'idle' && !st.pair) {
        st.idleT = (st.idleT == null ? rand(10, 18) : st.idleT) - dt;
        if (st.idleT <= 0) {
          const r0 = Math.random(), pk = shedPeel();
          if (pk > 0.02 && pk < 0.98 && r0 < 0.75) {
            if (Math.random() < 0.4) { st.shedAct = { type: 'rub', t: 0 }; seen('shedRub'); }
            else st.shedAct = { type: 'pull', t: 0, side: Math.random() < 0.5 ? -1 : 1 };
          } else if (r0 < 0.3) { st.lick = 0.9; seen('lick'); }
          else if (r0 < 0.58) { st.peek = rand(-0.45, 0.45); st.peekT = rand(2, 3.5); seen('look'); }
          else if (r0 < 0.68) { st.tiltT = 1.2; seen('tilt'); }
          else if (r0 < 0.73) startAct('sniff');
          else if (r0 < 0.82) startAct('stretch');
          else if (r0 < 0.9) startAct('settle', { dur: rand(6, 10) });
          else startAct('yawn');
          st.idleT = pk > 0 && pk < 1 ? rand(2, 4) : rand(16, 30) * st.profile.rest;
        }
      }
      if (st.peekT > 0) st.peekT -= dt;
      const route = st.act && st.act.ph === 'go' ? st.act.to : st.target;
      if (st.pair) {
        wantLook = st.pair.fLook;
      } else if (!st.sleeping && !food && st.peekT > 0) {
        wantLook = st.peek;
      } else if (!st.sleeping && !food && route && (moving || st.mode === 'walk' || st.act && st.act.ph === 'go')) {
        // 歩くときは、体より先に頭が行き先を向く
        wantLook = clamp(angleTo(st.yaw, Math.atan2(route.x - st.x, route.z - st.z)) * 0.9, -0.6, 0.6);
      } else if (!moving && !st.sleeping && !food && st.happy > 0) {
        wantLook = clamp(angleTo(st.yaw, Math.atan2(camera.position.x - st.x, camera.position.z - st.z)), -0.75, 0.75);
      } else if (st.meal) {
        wantLook = 0;
      } else if (food && !st.sleeping) {
        wantLook = clamp(angleTo(st.yaw, Math.atan2(food.obj.position.x - st.x, food.obj.position.z - st.z)), -0.6, 0.6);
      }
      st.look = lerp(st.look, wantLook, Math.min(1, dt * 2.5));
      if (!(st.pair && (st.pair.ph === 'woo' || st.pair.ph === 'snuggle'))) st.drop = lerp(st.drop, st.sleeping || st.mode === 'bask' || st.hidePeek ? 0.13 : st.hunt && st.hunt.ph === 'strike' ? -0.02 : st.stalk ? 0.11 : moving ? 0 : 0.06, Math.min(1, dt * 2));
      st.curl = lerp(st.curl, st.sleeping ? 1 : 0, Math.min(1, dt * 1.5));
      st.pitch = lerp(st.pitch, st.sleeping ? 0.22 : (st.stalk > 0 ? -0.08 : 0), Math.min(1, dt * 3));
      if (st.lick > 0) st.lick -= dt;
      if (st.happy > 0) st.happy -= dt;
      if (st.tiltT > 0) st.tiltT -= dt;

      P.t = st.t;
      P.phase = st.phase;
      P.walk = st.walkW;
      P.look = st.look + (st.eatLook || 0);
      // 歩くときは一歩ごとに頭が小さく上下する
      if (st.mode !== 'drink') st.drinkPitch = lerp(st.drinkPitch || 0, 0, Math.min(1, dt * 3));
      P.pitch = st.pitch + (st.eatPitch || 0) + (st.drinkPitch || 0) + Math.sin(st.phase * 2) * 0.012 * st.walkW;
      P.tilt = (st.tiltT > 0 ? Math.sin(Math.min(1, st.tiltT) * Math.PI) * 0.22 : 0) + (st.happy > 0 ? Math.sin(st.t * 2.2) * 0.025 : 0);
      P.bend = st.bend;
      // しぐさの姿勢（なめらかに切りかえる）
      {
        const a = st.act && st.act.ph === 'do' ? ACT_POSE : null, f = Math.min(1, dt * 6);
        st.ap = st.ap || { pitch: 0, drop: 0, look: 0, tilt: 0, jaw: 0, wag: 0, blink: 0, churn: 0, tail: 0, dw: 0 };
        for (const key of ['pitch', 'look', 'tilt', 'jaw', 'wag', 'blink', 'churn', 'tail']) st.ap[key] = lerp(st.ap[key], a ? a[key] : 0, key === 'jaw' ? Math.min(1, dt * 10) : f);
        st.ap.dw = lerp(st.ap.dw, a && a.drop != null ? 1 : 0, f);
        if (a && a.drop != null) st.ap.drop = a.drop;
        // えさを見つけたときも、しっぽがゆらゆら
        if (st.wagT > 0) { st.wagT -= dt; st.ap.wag = Math.max(st.ap.wag, Math.min(1, st.wagT)); }
        P.pitch += st.ap.pitch; P.look += st.ap.look; P.tilt += st.ap.tilt;
        P.jaw = st.ap.jaw; P.wag = st.ap.wag;
        // 前足でかりかり（その場で足を動かす）
        if (!gk.glb && st.ap.churn > 0.01) { st.phase += dt * 9 * st.ap.churn; P.phase = st.phase; P.walk = Math.max(P.walk, 0.55 * st.ap.churn); }
        st.tailUp = st.ap.tail;
      }
      P.curl = st.curl;
      P.stalk = st.stalk > 0 ? 1 : 0;
      P.happy = st.happy > 0 ? 1 : 0;
      P.drop = lerp(st.drop, st.ap.drop, st.ap.dw);
      P.blink = Math.max(st.mode === 'bask' ? Math.max(st.blinkV, 0.55) : st.blinkV, st.ap.blink);
      P.tongue = st.lick > 0 ? Math.sin((0.9 - st.lick) / 0.9 * Math.PI) : 0;
      P.breathe = Math.sin(st.t * (st.sleeping ? 1.4 : 2.4));
      P.sway = 1;
      ground(st, dt, S, !!st.hand, P.drop);
      if (st.y > 0.6) seen('climb');
      if (moving && st.night) seen('night');
      if (gk.U) {
        const pk = shedPeel();
        gk.U.uShedOn.value = st.shedP == null && !st.stuck ? 0 : 1;
        // 頭の先から、しっぽの先まで、境目がだんだん下がっていく
        gk.U.uShedEdge.value = st.shedP == null && st.stuck ? -3.1 : pk < 0 ? 9 : 1.9 - pk * 5.8;
        gk.U.uTailFat.value = st.fat || 0;
        gk.U.uTailLift.value = (st.tailLift || 0) + (st.tailUp || 0);
        if (gk.corneaMat) gk.corneaMat.opacity = st.shedP != null && pk < 0.12 ? 0.4 : 0.1;
      }
      gk.root.position.set(st.x, st.y, st.z);
      gk.root.rotation.order = 'YXZ';
      gk.root.rotation.set(-st.slope, st.yaw, 0);
      stepFeet(st, dt, motion, (x, z) => {
        if (st.hand && st.hand.phase !== 'offer' && st.hand.phase !== 'shy') {
          let y = surfaceAt(x, z);
          for (const hand of st.hand.hands) y = Math.max(y, handHeightAt(hand, x, z));
          return y;
        }
        return surfaceAt(x, z);
      }, P.drop);
      if (gk.glb) { P.phase = st.phase; P.walk = st.walkW; }
      pose(gk, P);
      blob.position.x = st.x;
      blob.position.y = 0.012 + st.y;
      blob.position.z = st.z;
      blob.scale.set(2.2 * S, 5.0 * S, 1);
      blob.rotation.z = st.yaw;
    }

    const _t = new T.Vector3(), _c = new T.Vector3();
    function stepCamera(dt) {
      // アップのときは、手前のガラスが視界をさえぎらないように隠す
      for (const o of frontGlass) o.visible = !(st.close || (st.observe && !edit && !st.pair));
      if (st.close && st.gk) {
        st.gk.bones.neck.getWorldPosition(_t);
        const D = (3.4 * 0.95 * st.size + 1.4) * st.zoom;
        const az = st.yaw + st.orbit;
        _c.set(_t.x + Math.sin(az) * Math.cos(st.elev) * D, _t.y + Math.sin(st.elev) * D, _t.z + Math.cos(az) * Math.cos(st.elev) * D);
        camera.position.lerp(_c, Math.min(1, dt * 3));
        camLook.lerp(_t, Math.min(1, dt * 4));
      } else if (st.observe && st.gk && !edit && !st.pair) {
        // 模型のサイズは変えず、全身と尾が見える距離で個体を追う。
        _t.set(0, 0.3, -0.55);
        st.gk.root.localToWorld(_t);
        const D = LEN * 0.95 * st.size / (2 * Math.tan(T.MathUtils.degToRad(camera.fov / 2)))
          * 1.1 * Math.max(1, 1.15 / camera.aspect);
        const az = st.yaw + 0.85, elev = 0.58;
        _c.set(_t.x + Math.sin(az) * Math.cos(elev) * D, _t.y + Math.sin(elev) * D,
          _t.z + Math.cos(az) * Math.cos(elev) * D);
        camera.position.lerp(_c, Math.min(1, dt * 2.5));
        camLook.lerp(_t, Math.min(1, dt * 3));
      } else {
        // 縦長の画面（全画面の縦持ちなど）では、ケースの左右が切れないように少し引く
        const fit = camera.aspect < 1.2 ? (4 / 3) / camera.aspect * 1.32 : 1;
        if (st.pair && st.gk) {
          // ペアリング中は、2匹のあいだを少し寄って見る
          const mx = (st.x + st.pair.M.x) / 2, mz = (st.z + st.pair.M.z) / 2;
          _c.copy(HOME.pos).sub(HOME.look).multiplyScalar(fit * 0.8).add(_t.set(mx * 0.6, 0, mz * 0.5 + 0.2));
          camera.position.lerp(_c, Math.min(1, dt * 1.5));
          camLook.lerp(_t, Math.min(1, dt * 1.5));
        } else {
          _c.copy(HOME.pos).sub(HOME.look).multiplyScalar(fit).add(HOME.look);
          camera.position.lerp(_c, Math.min(1, dt * 3));
          camLook.lerp(st.gk ? _t.set(st.x * 0.18, 0, st.z * 0.12 + 0.2) : HOME.look, Math.min(1, dt * 2));
        }
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
        stepFoods(dt); stepPuffs(dt); stepTweezers(dt);
        stepGecko(dt);
        stepPairing(dt);
        stepCamera(dt);
        renderer.render(scene, camera);
      }
      requestAnimationFrame(loop);
    }
    setNight(false);
    requestAnimationFrame(loop);

    setCage({});
    return {
      // ヒーターの温度：光の強さと、レオパがどちら側に寄りがちかを変える
      setHeat(temp) {
        st.heatGlow = clamp(0.35 + (temp - 28) * 0.14, 0.35, 1.5);
        st.heatPref = temp <= 30 ? 1 : temp >= 34 ? -1 : 0;
        heat.intensity = 0.8 * st.heatGlow;
      },
      setShed(p) { st.shedP = p; },
      setStuck(on) { st.stuck = !!on; },
      toilet, startAct, startWalkAct, peekFromHide,
      setLeftovers,
      // 水のよごれ（0：きれい 〜 1：よごれ）
      setWaterDirty(k) {
        st.waterDirty = k;
        decorG.traverse(o => {
          if (!o.isMesh || o.name !== 'water') return;
          if (!o.userData.base) { o.material = o.material.clone(); o.userData.base = o.material.color.clone(); }
          o.material.color.copy(o.userData.base).lerp(new T.Color('#8C8A5A'), k * 0.55);
        });
      },
      setFat(f) { st.fat = f; },
      startTweezers, tweezersActive: () => !!st.tw,
      startPairing, skipPairing, endPairing: () => endPairing(true), pairing: () => st.pair ? st.pair.ph : null,
      startHandling, endHandling: () => endHandling(true), handCmd, handling: () => st.hand ? st.hand.phase : null,
      _st: st, _cam: camera, _hide: () => HIDE, refreshDecor, setCage, setGecko, spawnFood, takeFoods, setPoops, setNight, setClock, snapshot, setDirty, wake, hearts, setClose, setObserve, setDecor, setEdit,
      pendingFoods: () => st.foods.filter(f => !f.refuse).map(f => f.kind),
      lick() { st.lick = 0.9; },
      happy() { st.happy = 1.4; if (st.sleeping) wake(); seen('happy'); },
      setActive(v) { st.active = v; if (v) { last = performance.now(); resize(); } },
    };
  }

  // ======================================================
  // 生体ビューアー：ショップで買う前に、3Dで回して確認する
  // ======================================================
  function createViewer(container, look) {
    if (!supported) return null;
    const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 2));
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    const scene = new T.Scene();
    scene.environment = makeEnvironment(renderer);
    const key1 = new T.DirectionalLight('#FFF4E6', 1.1);
    key1.position.set(-2, 8, 5);
    key1.castShadow = true;
    key1.shadow.mapSize.set(1024, 1024);
    Object.assign(key1.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 20 });
    key1.shadow.radius = 5; key1.shadow.normalBias = 0.02;
    const rimL = new T.DirectionalLight('#DDE8FF', 0.4);
    rimL.position.set(3, 3, -6);
    const ground = new T.Mesh(new T.CircleGeometry(4, 48), new T.MeshBasicMaterial({ color: '#E9D9B2' }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.01;
    const shadowCatcher = new T.Mesh(new T.CircleGeometry(4, 48), new T.ShadowMaterial({ opacity: 0.22 }));
    shadowCatcher.rotation.x = -Math.PI / 2; shadowCatcher.receiveShadow = true;
    scene.add(new T.HemisphereLight('#FFF6E4', '#B9A57E', 0.35), key1, rimL, ground, shadowCatcher);
    const camera = new T.PerspectiveCamera(30, 1, 0.1, 60);
    const gk = buildGecko(look, 'high');
    const P = restPose();
    P.drop = 0.05; P.look = 0; P.t = 0;
    gk.root.scale.setScalar(1.0);
    scene.add(gk.root);
    const aim = new T.Vector3(0, 0.3, -0.55);
    const st = { az: 0.7, el: 0.38, zoom: 1, t: 0, auto: true, done: false };
    const aimGoal = aim.clone();
    const ro = () => {
      const w = container.clientWidth, h = container.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    };
    ro();
    if (root.ResizeObserver) new ResizeObserver(ro).observe(container);
    const el = renderer.domElement;
    el.style.touchAction = 'none'; el.style.cursor = 'grab';
    const touches = new Map(); let pinch = 0, lx = 0, ly = 0;
    el.addEventListener('pointerdown', e => { touches.set(e.pointerId, { x: e.clientX, y: e.clientY }); lx = e.clientX; ly = e.clientY; st.auto = false; try { el.setPointerCapture(e.pointerId); } catch (err) { /* noop */ } if (touches.size === 2) { const [a, b] = [...touches.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); } });
    el.addEventListener('pointermove', e => {
      if (!touches.has(e.pointerId)) return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) { const [a, b] = [...touches.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch) st.zoom = clamp(st.zoom * pinch / d, 0.45, 2); pinch = d; return; }
      st.az -= (e.clientX - lx) * 0.012; st.el = clamp(st.el + (e.clientY - ly) * 0.006, 0.05, 1.3); lx = e.clientX; ly = e.clientY;
    });
    const up = e => { touches.delete(e.pointerId); if (touches.size < 2) pinch = 0; };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', e => { e.preventDefault(); st.zoom = clamp(st.zoom * Math.exp(e.deltaY * 0.0015), 0.45, 2); }, { passive: false });
    // 見る位置のおすすめ：顔・全身・横
    const views = { face: { el: 0.2, zoom: 0.5 }, body: { az: 0.7, el: 0.38, zoom: 1 }, side: { az: Math.PI / 2, el: 0.12, zoom: 0.9 }, top: { az: 0.2, el: 1.25, zoom: 0.95 } };
    let last = performance.now();
    function loop(now) {
      if (st.done) return;
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      st.t += dt; P.t = st.t; P.breathe = Math.sin(st.t * 2.4);
      P.blink = (st.t % 4.2) < 0.13 ? 1 : 0;
      if (st.auto) st.az += dt * 0.35;
      pose(gk, P);
      const fitDistance = LEN / (2 * Math.tan(T.MathUtils.degToRad(camera.fov / 2)))
        * 1.18 * Math.max(1, 1 / camera.aspect);
      const D = (st.focus ? 7.2 : fitDistance) * st.zoom;
      aim.lerp(aimGoal, 0.12);
      camera.position.set(aim.x + Math.sin(st.az) * Math.cos(st.el) * D, aim.y + Math.sin(st.el) * D, aim.z + Math.cos(st.az) * Math.cos(st.el) * D);
      camera.lookAt(aim);
      renderer.render(scene, camera);
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
    return {
      view(name) {
        const v = views[name]; if (!v) return;
        st.auto = false; Object.assign(st, v);
        st.focus = name === 'face';
        if (st.focus) {
          gk.root.updateMatrixWorld(true);
          const h = gk.bones.head.getWorldPosition(new T.Vector3()), m = gk.mouth.getWorldPosition(new T.Vector3());
          const fwd = m.clone().sub(h).setY(0).normalize();
          st.az = Math.atan2(fwd.x, fwd.z) + 0.55;
          aimGoal.copy(h).lerp(m, 0.35); aimGoal.y += 0.15;
        } else aimGoal.set(0, 0.3, -0.55);
      },
      destroy() { st.done = true; try { disposeGecko(gk); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); } catch (e) { /* noop */ } },
    };
  }


  // ======================================================
  // ふ化の演出：卵がカタカタ → ひび → 殻が割れて、ベビーが顔を出す（約6秒、タップで飛ばせる）
  // ======================================================
  function hatchScene(container, look, onEvent) {
    if (!supported) return null;
    const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 2));
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    container.appendChild(renderer.domElement);
    const scene = new T.Scene();
    scene.environment = makeEnvironment(renderer);
    const key1 = new T.DirectionalLight('#FFF4E6', 1.1);
    key1.position.set(-2, 6, 4);
    key1.castShadow = true;
    key1.shadow.mapSize.set(1024, 1024);
    Object.assign(key1.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 1, far: 15 });
    key1.shadow.radius = 4;
    scene.add(new T.HemisphereLight('#FFF6E4', '#B9A57E', 0.4), key1);
    // 床はインキュベーターの中の、しめった土（下にかくれた体は見えない）
    const soil = new T.Mesh(new T.CircleGeometry(6, 48), phys('#8C6B4A', { roughness: 1 }));
    soil.rotation.x = -Math.PI / 2; soil.receiveShadow = true;
    scene.add(soil);
    const camera = new T.PerspectiveCamera(32, 1, 0.1, 40);
    camera.position.set(0, 1.9, 4.4); camera.lookAt(0, 0.65, 0);
    // 卵：上と下のふたつに分けておき、上の殻が割れてはずれる
    const ec = document.createElement('canvas'); ec.width = 512; ec.height = 256;
    const ex = ec.getContext('2d');
    const r0 = prng((look.seed || 1) * 3 + 7);
    const cracks = [];
    for (let i = 0; i < 7; i++) {
      const pts = []; let x = r0() * 512, y = 70 + r0() * 30;
      for (let k = 0; k < 6; k++) { pts.push([x, y]); x += (r0() - 0.5) * 60; y += 8 + r0() * 14; }
      cracks.push(pts);
    }
    const drawEgg = n => {
      ex.fillStyle = '#F6F1E4'; ex.fillRect(0, 0, 512, 256);
      const r = prng(11);
      for (let i = 0; i < 160; i++) { ex.fillStyle = `rgba(190,175,150,${0.15 + r() * 0.25})`; ex.beginPath(); ex.arc(r() * 512, r() * 256, 0.6 + r() * 1.6, 0, 7); ex.fill(); }
      ex.strokeStyle = '#6E5B44'; ex.lineWidth = 2.2; ex.lineJoin = 'round';
      for (let i = 0; i < Math.min(n, cracks.length); i++) { ex.beginPath(); cracks[i].forEach(([x, y], k) => k ? ex.lineTo(x, y) : ex.moveTo(x, y)); ex.stroke(); }
      eggTex.needsUpdate = true;
    };
    const eggTex = new T.CanvasTexture(ec); eggTex.encoding = T.sRGBEncoding;
    const shellMat = () => phys('#ffffff', { map: eggTex, roughness: 0.8, transparent: true });
    const CUT = 0.95;
    const top = new T.Mesh(new T.SphereGeometry(1, 40, 24, 0, Math.PI * 2, 0, CUT), shellMat());
    const bot = new T.Mesh(new T.SphereGeometry(1, 40, 24, 0, Math.PI * 2, CUT, Math.PI - CUT), shellMat());
    bot.material.side = T.DoubleSide; top.material.side = T.DoubleSide;
    const egg = new T.Group();
    for (const m of [top, bot]) { m.castShadow = true; egg.add(m); }
    egg.scale.set(0.52, 0.72, 0.52); egg.position.y = 0.7;
    scene.add(egg);
    drawEgg(0);
    // 中にいるベビー（鼻先を上に向けて、卵の中にかくれている）
    const baby = Object.assign({}, look, { stage: 'baby' });
    const gk = buildGecko(baby, 'high');
    const P = restPose();
    const SC = 0.42;
    gk.root.scale.setScalar(SC);
    scene.add(gk.root);
    const st = { t: 0, done: false, ev: {} };
    const ro = () => { const w = container.clientWidth, h = container.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    ro();
    if (root.ResizeObserver) new ResizeObserver(ro).observe(container);
    const once = (k, at) => { if (st.t >= at && !st.ev[k]) { st.ev[k] = 1; onEvent && onEvent(k); } };
    let last = performance.now();
    function loop(now) {
      if (st.done) return;
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      st.t += dt;
      const t = st.t;
      // 1. カタカタ（だんだん強く）とひび
      const shake = t < 2.1 ? Math.sin(t * 26) * 0.12 * Math.min(1, t / 1.4) * (Math.sin(t * 3) > -0.3 ? 1 : 0.2) : 0;
      egg.rotation.z = shake;
      if (t < 2.1) drawEgg(Math.floor(t / 0.3));
      once('crack', 0.6); once('crack2', 1.3);
      // 2. 上の殻がはずれる
      if (t > 2.1) {
        once('open', 2.1);
        const k = Math.min(1, (t - 2.1) / 0.8);
        top.position.set(k * 1.6, 1.0 * Math.sin(k * Math.PI) + k * 0.2, k * 0.3);
        top.rotation.set(k * 1.2, 0, -k * 2.2);
        top.material.opacity = 1 - Math.max(0, (t - 2.6) / 0.6);
      }
      // 3. ベビーが顔を出す → 4. 体を起こして、殻から一歩
      const rise = clamp((t - 2.4) / 1.6, 0, 1), level = clamp((t - 4.3) / 1.1, 0, 1);
      const tilt = lerp(-1.15, 0, smooth(level));
      gk.root.rotation.set(tilt, 0.25 * (1 - level), 0);
      // 殻の中では足をちぢめて、殻から足がはみ出さないようにする
      gk.root.scale.set(SC * lerp(0.62, 1, smooth(level)), SC, SC);
      gk.root.position.set(0, lerp(-0.9, 0.55, smooth(rise)) * (1 - level) + level * 0.0, lerp(0, 0.6, smooth(level)));
      bot.material.opacity = 1 - clamp((t - 4.4) / 0.9, 0, 1);
      if (bot.material.opacity <= 0.01) bot.visible = false;
      P.t = t; P.breathe = Math.sin(t * 3);
      P.blink = (t > 3.2 && t < 3.35) || (t > 4.9 && t < 5.05) ? 1 : 0;
      P.tongue = t > 3.6 && t < 4.1 ? Math.sin((t - 3.6) / 0.5 * Math.PI) : 0;
      P.look = t > 2.8 && t < 4.3 ? Math.sin(t * 1.6) * 0.35 : 0;
      P.walk = level > 0 && level < 1 ? 0.8 : 0; P.phase = t * 6;
      pose(gk, P);
      once('out', 3.0);
      if (t > 6.2) { finish(); return; }
      renderer.render(scene, camera);
      requestAnimationFrame(loop);
    }
    function finish() {
      if (st.done) return;
      st.done = true;
      onEvent && onEvent('done');
      try { disposeGecko(gk); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); } catch (e) { /* noop */ }
    }
    renderer.domElement.addEventListener('pointerup', () => { if (st.t > 0.4) finish(); });
    requestAnimationFrame(loop);
    return { skip: finish, _st: st };
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
    if (gk.glb) {
      // GLB の骨の目印だけでは尾が範囲に入らず、図鑑写真の全身が切れていた。
      const pos = gk.mesh.geometry.attributes.position;
      const stride = Math.max(1, Math.floor(pos.count / 2000));
      for (let i = 0; i < pos.count; i += stride) {
        q.fromBufferAttribute(pos, i);
        box.expandByPoint(deformPoint(q, gk.U).applyMatrix4(gk.mesh.matrixWorld));
      }
    }
    box.expandByScalar(0.45);
    const c = box.getCenter(new T.Vector3());
    const size = box.getSize(new T.Vector3());
    if (side) {
      // 参考写真と同じ、ななめ前の低い位置から全身
      const dist = Math.max(size.x, size.z) / (2 * Math.tan(T.MathUtils.degToRad(pr.camera.fov / 2))) * 1.1;
      pr.camera.position.set(c.x + dist * 0.25, c.y + dist * 0.45, c.z + dist);
      pr.camera.lookAt(c);
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

  function behaviorProfile(seed) {
    const n = (Math.imul((Number(seed) || 0) ^ 0x9e3779b9, 1664525) >>> 0) % 3;
    return [
      { name: '探検好き', note: '休憩は短め。ケースの中をよく歩きます。', walk: 1.12, rest: 0.8, hide: 0.22, peek: 0.55 },
      { name: 'のんびり', note: 'ゆっくり歩いて、休む時間を長めにとります。', walk: 0.82, rest: 1.35, hide: 0.35, peek: 0.45 },
      { name: '慎重', note: '隠れ家で休み、顔を出して周りを確かめます。', walk: 0.95, rest: 1.1, hide: 0.48, peek: 0.75 },
    ][n];
  }
  root.Leopa3D = { behaviorProfile, _buildKit: (n, f) => buildKit(n, f), loadKit, CAGE_SIZES, CAGE_THEMES, itemPhoto, itemPhotoReady, supported, createTank, createViewer, hatchScene, photo, photoReady, photoKey, loadModel, DECOR, DEFAULT_DECOR, TANK };
})(typeof window !== 'undefined' ? window : globalThis);
