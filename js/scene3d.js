/* レオパといっしょ — 3D 表示（Three.js r128）
 *
 * レオパの体は「頭〜しっぽまで 1 枚つながりのメッシュ」を断面の輪郭から作り、
 * 背骨のボーンで曲げる（SkinnedMesh）。脚・目・まぶた・舌はボーンにぶら下げる。
 * 模様・おなか・唇・突起（ぶつぶつ）は、体の UV に合わせてキャンバスに描く。
 *
 * 座標: レオパは +Z 向き。鼻先 z≈2.27、しっぽの先 z≈-3.36。ケースの床は x: -5〜5, z: -3.75〜3.75。
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
  // z, 半幅, 上の厚み, 下の厚み, 中心の高さ, 断面の角ばり具合
  const PROFILE = [
    [2.22, 0.13, 0.08, 0.07, 0.40, 2.4],
    [2.14, 0.27, 0.14, 0.11, 0.41, 2.5],
    [2.00, 0.40, 0.19, 0.14, 0.43, 2.6],
    [1.82, 0.51, 0.25, 0.17, 0.45, 2.7],
    [1.62, 0.61, 0.31, 0.2, 0.47, 2.7],
    [1.42, 0.70, 0.35, 0.22, 0.49, 2.7],
    [1.24, 0.72, 0.36, 0.24, 0.50, 2.6],
    [1.08, 0.63, 0.34, 0.25, 0.50, 2.5],
    [0.92, 0.50, 0.31, 0.26, 0.49, 2.4],
    [0.74, 0.50, 0.32, 0.27, 0.49, 2.4],
    [0.50, 0.60, 0.36, 0.29, 0.50, 2.4],
    [0.20, 0.70, 0.39, 0.31, 0.50, 2.4],
    [-0.10, 0.74, 0.40, 0.31, 0.49, 2.4],
    [-0.40, 0.72, 0.38, 0.30, 0.48, 2.4],
    [-0.68, 0.60, 0.33, 0.27, 0.46, 2.4],
    [-0.90, 0.48, 0.28, 0.24, 0.40, 2.3],
    [-1.10, 0.50, 0.29, 0.23, 0.35, 2.3],
    [-1.40, 0.52, 0.29, 0.22, 0.30, 2.3],
    [-1.75, 0.46, 0.26, 0.20, 0.25, 2.3],
    [-2.10, 0.36, 0.21, 0.16, 0.19, 2.2],
    [-2.45, 0.25, 0.15, 0.12, 0.14, 2.2],
    [-2.80, 0.15, 0.10, 0.08, 0.10, 2.2],
    [-3.10, 0.08, 0.055, 0.05, 0.07, 2.2],
    [-3.30, 0.03, 0.025, 0.02, 0.05, 2.2],
  ];
  const Z0 = PROFILE[0][0], Z1 = PROFILE[PROFILE.length - 1][0];
  const Z_NOSE = 2.265, Z_TAIL = -3.36, LEN = Z_NOSE - Z_TAIL;

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
    if (gravid) { const g = Math.exp(-Math.pow((z + 0.1) / 0.45, 2)); p.w *= 1 + 0.13 * g; p.hb *= 1 + 0.14 * g; }
    return p;
  }
  // th: 0 = 右側, π/2 = 背中, π = 左側, 3π/2 = おなか
  function section(p, th) {
    const c = Math.cos(th), s = Math.sin(th);
    const e = 2 / (s >= 0 ? p.n : 3.4);
    return [p.w * Math.sign(c) * Math.pow(Math.abs(c), e), p.y + (s >= 0 ? p.ht : p.hb) * Math.sign(s) * Math.pow(Math.abs(s), e)];
  }
  function surf(z, th, gravid) { const [x, y] = section(profileAt(z, gravid), th); return V(x, y, z); }
  function surfNormal(z, th) {
    const e = 0.01;
    const a = surf(z, th + e).sub(surf(z, th - e));
    const b = surf(z - e, th).sub(surf(z + e, th));
    const n = new T.Vector3().crossVectors(a, b).normalize();
    const p = surf(z, th);
    if (n.dot(p.clone().sub(V(0, profileAt(z).y, z))) < 0) n.negate();
    return n;
  }
  const thToU = th => { let u = (th - 1.5 * Math.PI) / (2 * Math.PI); return u - Math.floor(u); };
  const zToV = z => (Z_NOSE - z) / LEN;
  function circumference(z) {
    const p = profileAt(z), h = (p.ht + p.hb) / 2;
    return Math.PI * (3 * (p.w + h) - Math.sqrt((3 * p.w + h) * (p.w + 3 * h)));
  }
  // 口のライン（右側）。前は低く、うしろで少し上がる＝にっこり
  const MOUTH_BACK = 1.2;
  const mouthTh = z => { const t = clamp((2.235 - z) / (2.235 - MOUTH_BACK), 0, 1); return -0.44 + 0.32 * t + 0.12 * t * t; };

  // ======================================================
  // ボーン
  // ======================================================
  const BONES = [
    ['mid', 0.05, null], ['chest', 0.45, 'mid'], ['neck', 0.78, 'chest'], ['head', 1.08, 'neck'],
    ['hip', -0.55, 'mid'], ['t1', -1.0, 'hip'], ['t2', -1.45, 't1'], ['t3', -1.9, 't2'],
    ['t4', -2.35, 't3'], ['t5', -2.8, 't4'], ['t6', -3.15, 't5'],
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

  function bodyGeometry(gravid) {
    const N = 150, M = 44;
    const pos = [], uv = [], si = [], sw = [], idx = [];
    const push = (x, y, z, u, v) => {
      pos.push(x, y, z); uv.push(u, v);
      const w = weightsAt(z);
      si.push(w[0], w[1], 0, 0); sw.push(w[2], w[3], 0, 0);
    };
    for (let i = 0; i < N; i++) {
      const z = Z0 + (Z1 - Z0) * i / (N - 1);
      const p = profileAt(z, gravid);
      for (let j = 0; j <= M; j++) {
        const u = j / M;
        const [x, y] = section(p, 1.5 * Math.PI + u * 2 * Math.PI);
        push(x, y, z, u, zToV(z));
      }
    }
    const nose = N * (M + 1), tail = nose + 1;
    push(0, profileAt(Z0).y - 0.01, Z_NOSE, 0.5, 0);
    push(0, profileAt(Z1).y, Z_TAIL, 0.5, 1);
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

  /* 体の色と模様。横 = 胴まわり（0 と 1 がおなか、0.5 が背中）、縦 = 鼻先→しっぽの先 */
  function skinCanvas(pal, look, W, H) {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const r = prng((look.seed || 1) * 7 + 3);
    const st = look.stage;
    const belly = A.mix(pal.base, '#FFF9EF', 0.74);

    const around = (cols) => {
      const g = ctx.createLinearGradient(0, 0, W, 0);
      [[0, cols[0]], [0.12, cols[0]], [0.27, cols[1]], [0.5, cols[2]], [0.73, cols[1]], [0.88, cols[0]], [1, cols[0]]].forEach(([p, col]) => g.addColorStop(p, col));
      return g;
    };
    ctx.fillStyle = around([belly, pal.base, A.mix(pal.base, '#7A4A08', 0.1)]);
    ctx.fillRect(0, 0, W, H);
    // しっぽは色が少しちがう
    const tailCol = st === 'baby' ? A.mix(pal.tail, '#FFFFFF', 0.35) : pal.tail;
    const tailFill = around([A.mix(tailCol, '#FFFFFF', 0.6), tailCol, A.mix(tailCol, '#6E6070', 0.08)]);
    const vA = zToV(-0.8), vB = zToV(-1.25);
    for (let y = Math.floor(vA * H); y < H; y += 2) {
      ctx.globalAlpha = smooth(clamp((y / H - vA) / (vB - vA), 0, 1));
      ctx.fillStyle = tailFill;
      ctx.fillRect(0, y, W, 2);
    }
    ctx.globalAlpha = 1;
    // 頭の上はほんの少し明るく
    const hg = ctx.createLinearGradient(0, 0, 0, zToV(0.9) * H);
    hg.addColorStop(0, 'rgba(255,248,225,0.18)');
    hg.addColorStop(1, 'rgba(255,248,225,0)');
    ctx.fillStyle = hg;
    ctx.fillRect(0, 0, W, zToV(0.9) * H);

    // 世界の長さ rw の丸を、その位置の太さに合わせて描く
    const blob = (u, z, rw, col, alpha, rot) => {
      const C = Math.max(0.35, circumference(z));
      ctx.globalAlpha = alpha;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(u * W, zToV(z) * H, rw / C * W, rw / LEN * H, rot || 0, 0, Math.PI * 2);
      ctx.fill();
    };
    const bandPath = (z0, z1, col, alpha) => {
      const y0 = zToV(z0) * H, y1 = zToV(z1) * H;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(0, y0);
      for (let x = 0; x <= W; x += W / 24) ctx.lineTo(x, y0 + (r() - 0.5) * (y1 - y0) * 0.35);
      for (let x = W; x >= 0; x -= W / 24) ctx.lineTo(x, y1 + (r() - 0.5) * (y1 - y0) * 0.35);
      ctx.closePath();
      ctx.fill();
    };

    if (pal.pattern) {
      // ベビーのしま模様（大きくなると斑点に変わる）
      const bandA = st === 'baby' ? 0.95 : st === 'young' ? 0.42 : 0;
      if (bandA > 0) {
        for (const [z0, z1] of [[0.98, 0.64], [0.28, -0.1], [-0.44, -0.8], [-1.2, -1.5], [-1.8, -2.08], [-2.34, -2.56], [-2.8, -2.98], [-3.14, -3.36]]) {
          bandPath(z0, z1, pal.spot, bandA);
        }
      }
      // おとなのしっぽの白っぽい帯
      if (st !== 'baby') {
        for (const z of [-1.3, -1.82, -2.3, -2.74, -3.1]) bandPath(z + 0.08, z - 0.08, A.mix(tailCol, '#FFFFFF', 0.5), 0.35);
      }
      // ヒョウ柄
      const spotA = st === 'baby' ? 0 : st === 'young' ? 0.72 : 1;
      if (spotA > 0) {
        const n = Math.round((look.genes.snow === 2 ? 420 : 330) * (W / 1024));
        for (let i = 0; i < n; i++) {
          const z = 2.05 - r() * 5.2;
          const u = 0.5 + (r() + r() - 1) * 0.36;
          const isHead = z > 1.0;
          const C = circumference(z);
          let rw = (isHead ? 0.018 + r() * 0.03 : 0.03 + r() * 0.055) * clamp(C / 3.2, 0.4, 1);
          if (look.genes.snow === 2) rw *= 1.15;
          const parts = 1 + Math.floor(r() * 3);
          for (let k = 0; k < parts; k++) {
            const du = (r() - 0.5) * rw * 1.4 / Math.max(0.35, C), dz = (r() - 0.5) * rw * 1.4;
            blob(u + du, z + dz, rw * (0.6 + r() * 0.5), pal.spot, spotA * (pal.spot === '#A0704A' ? 0.85 : 0.95), r() * 3);
          }
        }
      }
    }
    // 抱卵中はおなかの横に卵が透ける
    if (look.gravid) {
      for (const u of [0.13, 0.87]) for (const z of [0.15, -0.3]) blob(u, z, 0.16, '#FFE9DC', 0.45);
    }
    // おなかは白く（模様も薄く）
    const bg = ctx.createLinearGradient(0, 0, W, 0);
    const bc = a => { const n = parseInt(belly.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
    [[0, 0.95], [0.1, 0.85], [0.2, 0], [0.8, 0], [0.9, 0.85], [1, 0.95]].forEach(([p, a]) => bg.addColorStop(p, bc(a)));
    ctx.globalAlpha = 1;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // くちびると口のライン
    const lineAlong = (thOffset, width, col, alpha) => {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = col;
      ctx.lineCap = 'round';
      for (const side of [1, -1]) {
        const at = z => {
          const th = mouthTh(z) + thOffset;
          return [thToU(side > 0 ? th : Math.PI - th) * W, zToV(z) * H];
        };
        // 区間ごとに、その場所の太さに合わせた線幅で描く
        for (let z = MOUTH_BACK; z < 2.235; z += 0.01) {
          const [x0, y0] = at(z), [x1, y1] = at(Math.min(2.235, z + 0.01));
          ctx.lineWidth = width / Math.max(0.35, circumference(z)) * W;
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.stroke();
        }
        // 鼻先の下を回って反対側へ（横向きの線なので、縦方向の密度で太さを決める）
        const [xe, ye] = at(2.235);
        ctx.lineWidth = width * H / LEN;
        ctx.beginPath();
        ctx.moveTo(xe, ye);
        ctx.lineTo((side > 0 ? 0 : 1) * W, zToV(2.245) * H);
        ctx.stroke();
      }
    };
    lineAlong(0.09, 0.04, A.mix(pal.base, '#FFFDF6', 0.6), 0.7);
    lineAlong(0, 0.02, '#2A1F18', 0.9);
    ctx.globalAlpha = 1;
    return c;
  }

  // 突起（ぶつぶつ）の凹凸。全個体で共通
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
    const dot = (u, z, rw, a) => {
      const C = Math.max(0.35, circumference(z));
      const rx = rw / C * W, ry = rw / LEN * H;
      const x = u * W, y = zToV(z) * H;
      const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
      g.addColorStop(0, `rgba(255,255,255,${a})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    };
    const scale = W / 1024;
    // こまかいうろこ
    for (let i = 0; i < 9000 * scale; i++) dot(r(), 2.2 - r() * 5.5, 0.011 + r() * 0.008, 0.35);
    // 背中と横の大きめの突起
    for (let i = 0; i < 2600 * scale; i++) {
      const z = 1.9 - r() * 5.1;
      dot(0.5 + (r() + r() - 1) * 0.42, z, (0.02 + r() * 0.016) * clamp(circumference(z) / 3, 0.45, 1), 0.85);
    }
    // おなかはなめらかに
    const g = ctx.createLinearGradient(0, 0, W, 0);
    [[0, 0.8], [0.14, 0.55], [0.24, 0], [0.76, 0], [0.86, 0.55], [1, 0.8]].forEach(([p, a]) => g.addColorStop(p, `rgba(128,128,128,${a})`));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    bumpCache[key] = canvasTexture(c);
    return bumpCache[key];
  }
  function limbCanvas(pal, look, col) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = col;
    ctx.fillRect(0, 0, 128, 128);
    if (pal.pattern && look.stage !== 'baby') {
      const r = prng((look.seed || 1) + 41);
      ctx.fillStyle = pal.spot;
      ctx.globalAlpha = look.stage === 'young' ? 0.6 : 0.85;
      for (let i = 0; i < 9; i++) {
        ctx.beginPath();
        ctx.arc(r() * 128, r() * 128, 3 + r() * 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    return c;
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

  /* 目の模様。球の正面（+Z）が中心。レオパの虹彩は網目模様、瞳は縦長でふちがギザギザ */
  function irisCanvas(pal, dilated) {
    const W = 512, H = 256, cx = W / 2, cy = H / 2;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const r = prng(17);
    const g = ctx.createRadialGradient(cx, cy, 6, cx, cy, 150);
    if (pal.solid) {
      g.addColorStop(0, A.mix(pal.eye, '#FFFFFF', 0.1));
      g.addColorStop(0.7, pal.eye);
      g.addColorStop(1, A.mix(pal.eye, '#000000', 0.5));
    } else {
      g.addColorStop(0, A.mix(pal.eye, '#FFFFFF', 0.32));
      g.addColorStop(0.4, pal.eye);
      g.addColorStop(0.8, A.mix(pal.eye, '#000000', 0.2));
      g.addColorStop(1, A.mix(pal.eye, '#000000', 0.35));
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // 網目
    ctx.strokeStyle = pal.solid ? 'rgba(255,255,255,.05)' : A.mix(pal.eye, '#000000', 0.55);
    ctx.lineWidth = 1.8;
    ctx.globalAlpha = pal.solid ? 1 : 0.6;
    for (let i = 0; i < 200; i++) {
      let a = r() * Math.PI * 2, d = 16 + r() * 110;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.95);
      for (let k = 0; k < 4; k++) {
        a += (r() - 0.5) * 0.5;
        d += (r() - 0.3) * 14;
        ctx.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.95);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (!pal.solid) {
      // 瞳孔のまわりの明るい輪
      ctx.strokeStyle = A.mix(pal.eye, '#FFFFFF', 0.5);
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.ellipse(cx, cy, dilated ? 34 : 14, 74, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      // 瞳
      ctx.fillStyle = pal.pupil;
      ctx.beginPath();
      const hw = dilated ? 32 : 12, hh = 74;
      for (let k = 0; k <= 40; k++) {
        const t = k / 40 * Math.PI * 2;
        const wav = 1 + 0.18 * Math.sin(t * 9);
        const x = cx + Math.cos(t) * hw * wav, y = cy + Math.sin(t) * hh;
        if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.fill();
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

  /* look: { genes, tang, seed, stage, gravid, shed }  quality: 'high' | 'photo' */
  function buildGecko(look, quality) {
    const pal = A.colors(look.genes, look.tang, look.stage);
    const hi = quality !== 'photo';
    const W = hi ? 1024 : 512, H = hi ? 1536 : 768;
    const colorTex = canvasTexture(skinCanvas(pal, look, W, H), { srgb: true });
    const owned = [colorTex];
    const shed = !!look.shed;
    const skinMat = phys('#ffffff', {
      map: colorTex, bumpMap: bumpTexture(W, H), bumpScale: 0.018,
      roughness: shed ? 0.95 : 0.58, clearcoat: shed ? 0 : 0.18, clearcoatRoughness: 0.55, skinning: true,
    });
    const limbCol = A.mix(pal.base, '#FFF9EF', 0.06);
    const limbTex = canvasTexture(limbCanvas(pal, look, limbCol), { srgb: true, repeat: 2 });
    owned.push(limbTex);
    const limbMat = phys('#ffffff', { map: limbTex, bumpMap: granules(), bumpScale: 0.01, roughness: 0.6, clearcoat: shed ? 0 : 0.12 });
    const toeMat = phys(A.mix(limbCol, '#FFE8DC', 0.35), { roughness: 0.55 });
    const lidMat = phys(A.mix(pal.base, '#FFF9EF', 0.04), { roughness: 0.55, bumpMap: granules(), bumpScale: 0.006, side: T.DoubleSide });
    const rimMat = phys(A.mix(pal.base, '#FFF6E0', 0.15), { roughness: 0.55 });
    if (shed) for (const m of [skinMat, limbMat, lidMat]) { m.emissive = new T.Color('#FFFFFF'); m.emissiveIntensity = 0.22; }

    const rootG = new T.Group();
    const bones = {};
    const boneList = BONES.map(([name, , parent]) => {
      const b = new T.Bone();
      b.name = name;
      const w = boneWorld(name);
      const pw = parent ? boneWorld(parent) : V(0, 0, 0);
      b.position.copy(w.sub(pw));
      if (parent) bones[parent].add(b);
      bones[name] = b;
      return b;
    });
    const mesh = new T.SkinnedMesh(bodyGeometry(!!look.gravid), skinMat);
    mesh.add(bones.mid);
    mesh.updateMatrixWorld(true);
    mesh.bind(new T.Skeleton(boneList));
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    rootG.add(mesh);

    const HW = boneWorld('head');
    const toHead = p => p.clone().sub(HW);

    // ---- 目とまぶた
    const eyeTex = [canvasTexture(irisCanvas(pal, false), { srgb: true }), canvasTexture(irisCanvas(pal, true), { srgb: true })];
    owned.push(...eyeTex);
    const eyeMat = phys('#ffffff', { map: eyeTex[0], roughness: shed ? 0.5 : 0.12, clearcoat: 1, clearcoatRoughness: shed ? 0.6 : 0.03 });
    if (shed) { eyeMat.emissive = new T.Color('#9FA7B0'); eyeMat.emissiveIntensity = 0.25; }
    const eyeGeo = new T.SphereGeometry(0.2, 48, 32);
    eyeGeo.rotateY(-Math.PI / 2);
    const lids = [];
    for (const side of [1, -1]) {
      const th = side > 0 ? 0.55 : Math.PI - 0.55;
      const p = surf(1.5, th), n = surfNormal(1.5, th);
      const center = p.clone().sub(n.clone().multiplyScalar(0.1));
      const dir = n.clone().add(V(0, 0.08, 0.38)).normalize();
      const eg = new T.Group();
      eg.position.copy(toHead(center));
      eg.quaternion.setFromRotationMatrix(new T.Matrix4().lookAt(dir, V(0, 0, 0), V(0, 1, 0)));
      bones.head.add(eg);
      eg.add(new T.Mesh(eyeGeo, eyeMat));
      const mk = (upper) => {
        const g = new T.Group();
        const shell = new T.Mesh(new T.SphereGeometry(0.212, 40, 16, 0, Math.PI * 2, upper ? 0 : Math.PI / 2, Math.PI / 2), lidMat);
        const rim = new T.Mesh(new T.TorusGeometry(0.21, 0.014, 10, 48), rimMat);
        rim.rotation.x = Math.PI / 2;
        g.add(shell, rim);
        eg.add(g);
        return g;
      };
      lids.push({ up: mk(true), lo: mk(false) });
    }

    // ---- 耳の穴・鼻の穴
    const holeMat = phys('#2A2019', { roughness: 0.4 });
    for (const side of [1, -1]) {
      const th = side > 0 ? 0.14 : Math.PI - 0.14;
      const ear = new T.Mesh(new T.SphereGeometry(1, 16, 10), holeMat);
      const p = surf(1.13, th), n = surfNormal(1.13, th);
      ear.position.copy(toHead(p.sub(n.clone().multiplyScalar(0.01))));
      ear.scale.set(0.06, 0.045, 0.014);
      ear.quaternion.setFromRotationMatrix(new T.Matrix4().lookAt(n, V(0, 0, 0), V(0, 1, 0)));
      bones.head.add(ear);
      const nth = side > 0 ? 1.05 : Math.PI - 1.05;
      const nos = new T.Mesh(new T.SphereGeometry(0.022, 10, 8), holeMat);
      nos.position.copy(toHead(surf(2.165, nth)));
      nos.scale.set(1, 0.6, 1);
      bones.head.add(nos);
    }

    // ---- 舌
    const tongue = new T.Mesh(new T.SphereGeometry(1, 20, 12), phys('#E57388', { roughness: 0.3, clearcoat: 0.6 }));
    tongue.scale.set(0.001, 0.001, 0.001);
    const tongueBase = toHead(V(0, profileAt(2.2).y - 0.035, 2.18));
    tongue.position.copy(tongueBase);
    bones.head.add(tongue);
    const mouth = new T.Object3D();
    mouth.position.copy(toHead(surf(2.235, -Math.PI / 2 + 0.001)));
    bones.head.add(mouth);

    // ---- 脚（左前・右前・右後ろ・左後ろ）
    const legs = [];
    for (const [side, front] of [[-1, true], [1, true], [1, false], [-1, false]]) {
      legs.push(buildLeg(side, front, front ? bones.chest : bones.hip, limbMat, toeMat));
    }
    legs[0].phaseOff = 0; legs[2].phaseOff = 0;
    legs[1].phaseOff = Math.PI; legs[3].phaseOff = Math.PI;

    rootG.traverse(o => { if (o.isMesh && o !== mesh) o.castShadow = true; });
    // 目まわりの影が頭に落ちると黒いくまに見えるので、頭の小物は影を落とさない
    bones.head.traverse(o => { if (o.isMesh) o.castShadow = false; });
    const gk = { root: rootG, mesh, bones, eyeMat, eyeTex, lids, tongue, tongueBase, mouth, legs, midY: bones.mid.position.y, owned, dilated: false };
    pose(gk, restPose());
    return gk;
  }

  function buildLeg(side, front, bone, mat, toeMat) {
    const cfg = front
      ? { z: 0.5, x: 0.44, y: 0.42, Lu: 0.34, Lf: 0.34, r0: 0.12, r1: 0.082, r2: 0.058, rest: 0.4, droop: 0.3, toe: [-70, -36, -4, 26, 56], len: [0.1, 0.15, 0.17, 0.16, 0.12], yaw: 0.2 }
      : { z: -0.62, x: 0.44, y: 0.42, Lu: 0.38, Lf: 0.36, r0: 0.15, r1: 0.095, r2: 0.062, rest: -0.45, droop: 0.28, toe: [-58, -24, 8, 38, 68], len: [0.11, 0.16, 0.19, 0.2, 0.15], yaw: 0.55 };
    const BW = boneWorld(bone.name);
    const shoulder = new T.Group();
    shoulder.position.copy(V(side * cfg.x, cfg.y, cfg.z).sub(BW));
    bone.add(shoulder);
    const upper = new T.Group();
    shoulder.add(upper);
    const ug = taper(cfg.r0, cfg.r1, cfg.Lu);
    ug.rotateZ(-side * Math.PI / 2);
    upper.add(new T.Mesh(ug, mat));
    upper.add(new T.Mesh(new T.SphereGeometry(cfg.r0, 16, 12), mat));
    const elbow = new T.Group();
    elbow.position.set(side * cfg.Lu, 0, 0);
    upper.add(elbow);
    elbow.add(new T.Mesh(new T.SphereGeometry(cfg.r1 * 1.02, 14, 10), mat));
    const fg = taper(cfg.r1, cfg.r2, cfg.Lf);
    fg.rotateZ(Math.PI);
    elbow.add(new T.Mesh(fg, mat));
    const wrist = new T.Group();
    wrist.position.set(0, -cfg.Lf, 0);
    elbow.add(wrist);
    const palm = new T.Mesh(new T.SphereGeometry(1, 16, 10), mat);
    palm.scale.set(cfg.r2 * 1.5, cfg.r2 * 0.6, cfg.r2 * 1.5);
    wrist.add(palm);
    cfg.toe.forEach((deg, i) => {
      const phi = side * (cfg.yaw + deg * Math.PI / 180);
      const L = cfg.len[i];
      const tg = taper(0.026, 0.014, L, 8);
      tg.rotateX(Math.PI / 2);
      const toe = new T.Mesh(tg, mat);
      toe.rotation.order = 'YXZ';
      toe.rotation.y = phi;
      toe.rotation.x = 0.12;
      toe.position.set(Math.sin(phi) * 0.03, -0.012, Math.cos(phi) * 0.03);
      const tip = new T.Mesh(new T.SphereGeometry(0.018, 8, 6), toeMat);
      tip.position.set(0, 0, L);
      toe.add(tip);
      wrist.add(toe);
    });
    return { shoulder, upper, elbow, wrist, side, front, rest: cfg.rest, droop: cfg.droop, Lu: cfg.Lu, Lf: cfg.Lf, phaseOff: 0 };
  }

  function restPose() {
    return { t: 0, phase: 0, walk: 0, look: 0, pitch: 0, tilt: 0, curl: 0, stalk: 0, happy: 0, drop: 0.04, blink: 0, tongue: 0, breathe: 0, sway: 0 };
  }

  const _p = new T.Vector3();
  function pose(gk, P) {
    const B = gk.bones;
    const s = Math.sin(P.phase);
    B.mid.position.y = gk.midY - P.drop + P.walk * Math.abs(Math.cos(P.phase)) * 0.025;
    // 歩くときは体を S 字にくねらせる
    B.chest.rotation.y = -0.2 * s * P.walk;
    B.hip.rotation.y = 0.22 * s * P.walk;
    B.neck.rotation.y = 0.17 * s * P.walk + P.look * 0.45;
    B.head.rotation.y = P.look * 0.55;
    B.neck.rotation.x = P.pitch * 0.5;
    B.head.rotation.x = P.pitch * 0.5;
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
    // まばたき（レオパにはまぶたがある）
    for (const l of gk.lids) {
      l.up.rotation.x = lerp(-0.92, 0.1, P.blink);
      l.lo.rotation.x = lerp(0.72, -0.02, P.blink);
    }
    // ぺろっ
    const tg = P.tongue;
    if (tg > 0.01) {
      gk.tongue.scale.set(0.07, 0.028, 0.06 + 0.1 * tg);
      gk.tongue.position.set(gk.tongueBase.x, gk.tongueBase.y + 0.03 * Math.sin(tg * Math.PI), gk.tongueBase.z + 0.12 * tg);
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
      if (o.geometry) o.geometry.dispose();
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
    const HOME = { pos: V(0, 9.6, 8.4), look: V(0, 0, 0.2) };
    camera.position.copy(HOME.pos);
    const camLook = HOME.look.clone();
    camera.lookAt(camLook);

    const hemi = new T.HemisphereLight('#FFF6E4', '#9C8A6A', 0.3);
    const sun = new T.DirectionalLight('#FFF4E6', 1.0);
    sun.position.set(-3, 10, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 6, bottom: -6, near: 1, far: 30 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 5;
    const heat = new T.PointLight('#FFB060', 0.8, 9, 1.6);
    heat.position.set(4.5, 3, -1);
    const rim = new T.DirectionalLight('#DDE8FF', 0.35);
    rim.position.set(2, 4, -8);
    scene.add(hemi, sun, heat, rim);

    // 床（ホット側がほんのり暖色）
    const sand = canvasTexture(sandCanvas(), { srgb: true });
    sand.flipY = true;
    const floor = new T.Mesh(new T.PlaneGeometry(10, 7.5), phys('#ffffff', { map: sand, bumpMap: sand, bumpScale: 0.012, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    // ガラスと枠（手前は低くして中が見えるように）
    const glass = phys('#D5E4DD', { transparent: true, opacity: 0.28, roughness: 0.05, clearcoat: 1 });
    const frame = phys('#2F3431', { roughness: 0.4 });
    for (const [x, z, w, d, h] of [[0, -3.85, 10.3, 0.1, 2.2], [-5.1, 0, 0.1, 7.7, 2.2], [5.1, 0, 0.1, 7.7, 2.2], [0, 3.85, 10.3, 0.1, 0.5]]) {
      const m = new T.Mesh(new T.BoxGeometry(w, h, d), glass);
      m.position.set(x, h / 2, z);
      scene.add(m);
      const f = new T.Mesh(new T.BoxGeometry(w + 0.12, 0.1, d + 0.12), frame);
      f.position.set(x, h, z);
      scene.add(f);
    }
    // 岩のシェルター
    const rock = new T.Mesh(rockGeometry(), phys('#6E6358', { roughness: 0.95, bumpMap: sand, bumpScale: 0.03 }));
    rock.scale.set(1.75, 1.0, 1.4);
    rock.position.set(-3.3, 0.1, -2.3);
    rock.castShadow = true;
    rock.receiveShadow = true;
    const door = new T.Mesh(new T.CircleGeometry(0.62, 32), new T.MeshBasicMaterial({
      map: gradientCanvasTexture([[0, 'rgba(18,14,10,1)'], [0.7, 'rgba(30,24,18,.95)'], [1, 'rgba(30,24,18,0)']]), transparent: true, depthWrite: false,
    }));
    door.position.set(-3.05, 0.36, -0.93);
    door.rotation.set(-0.3, 0, 0);
    door.scale.set(1.15, 0.78, 1);
    scene.add(rock, door);
    // 水入れ
    const dish = new T.Mesh(new T.CylinderGeometry(0.85, 0.78, 0.28, 40), phys('#E8E1D2', { roughness: 0.35, clearcoat: 0.6 }));
    dish.position.set(-3.8, 0.14, 2.5);
    dish.castShadow = true;
    dish.receiveShadow = true;
    const water = new T.Mesh(new T.CircleGeometry(0.7, 40), phys('#6FAECB', { roughness: 0.02, clearcoat: 1, transparent: true, opacity: 0.85 }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(-3.8, 0.285, 2.5);
    scene.add(dish, water);
    const plant = buildPlant();
    plant.position.set(1.3, 0, -3.05);
    scene.add(plant);
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

    const BOUNDS = { x: 4.3, zMin: -3.2, zMax: 3.3 };
    const HIDE = { x: -3.0, z: 0.55, face: Math.PI };
    const POOP_SPOTS = [[4.2, -3.0], [3.75, -3.2], [4.35, -2.55]];

    const st = {
      gk: null, id: null, key: '', size: 1, x: 0.5, z: 0.8, yaw: 0.4,
      mode: 'idle', wait: 1, target: null, sleeping: false, zzz: 0,
      foods: [], poops: [], t: 0, phase: 0, walkW: 0, blinkT: 2, blinkV: 0,
      lick: 0, happy: 0, chomp: 0, stalk: 0, look: 0, tiltT: 0, active: true, night: false,
      drop: 0.04, curl: 0, pitch: 0,
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
      const key = [look.genes.snow, look.genes.alb, look.genes.ecl, look.genes.bliz, look.tang, look.seed, look.stage, !!look.gravid, !!look.shed].join('|');
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
      do { x = rand(-3.3, 3.8); z = rand(-2.2, 2.8); } while (Math.hypot(x - st.x, z - st.z) < 3);
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
    function setNight(on) {
      if (st.gk) setPupil(st.gk, on);
      st.night = on;
      hemi.intensity = on ? 0.12 : 0.3;
      hemi.color.set(on ? '#A9B8FF' : '#FFF6E4');
      sun.intensity = on ? 0.35 : 1.0;
      sun.color.set(on ? '#AFC0FF' : '#FFF4E6');
      heat.intensity = on ? 0.9 : 0.8;
      renderer.toneMappingExposure = on ? 0.75 : 0.95;
      scene.background = new T.Color(on ? '#1B2130' : '#DCE6DE');
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
          const x1 = clamp(f.obj.position.x + rand(-reach, reach), -4.3, 4.3);
          const z1 = clamp(f.obj.position.z + rand(-reach, reach), -3.2, 3.3);
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
          st.yaw += angleTo(st.yaw, HIDE.face) * Math.min(1, dt * 2);
        } else if (st.mode === 'walk' || st.mode === 'toHide') {
          step = moveToward(st.target.x, st.target.z, 0.85 * nf, dt);
          if (Math.hypot(st.target.x - st.x, st.target.z - st.z) < 0.12) {
            if (st.mode === 'toHide') { st.sleeping = true; st.wait = rand(18, 35); st.zzz = 0.8; }
            st.mode = 'idle';
            st.wait = st.night ? rand(0.8, 2.5) : rand(2.5, 6);
          }
        } else {
          st.wait -= dt;
          if (st.wait <= 0) {
            if (!st.night && Math.random() < 0.3) { st.mode = 'toHide'; st.target = { x: HIDE.x, z: HIDE.z }; }
            else { st.mode = 'walk'; st.target = { x: rand(-2.5, 3.5), z: rand(-1.4, 2.4) }; }
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
      if (!moving && !st.sleeping && !food) {
        wantLook = clamp(angleTo(st.yaw, Math.atan2(camera.position.x - st.x, camera.position.z - st.z)), -0.75, 0.75);
      } else if (food && !st.sleeping) {
        wantLook = clamp(angleTo(st.yaw, Math.atan2(food.obj.position.x - st.x, food.obj.position.z - st.z)), -0.6, 0.6);
      }
      st.look = lerp(st.look, wantLook, Math.min(1, dt * 2.5));
      st.drop = lerp(st.drop, st.sleeping ? 0.13 : moving ? 0 : 0.06, Math.min(1, dt * 2));
      st.curl = lerp(st.curl, st.sleeping ? 1 : 0, Math.min(1, dt * 1.5));
      st.pitch = lerp(st.pitch, st.sleeping ? 0.22 : (st.stalk > 0 ? -0.08 : 0), Math.min(1, dt * 3));
      if (st.lick > 0) st.lick -= dt;
      if (st.happy > 0) st.happy -= dt;
      if (st.tiltT > 0) st.tiltT -= dt;

      P.t = st.t;
      P.phase = st.phase;
      P.walk = st.walkW;
      P.look = st.look;
      P.pitch = st.pitch + (st.chomp > 0.35 ? -0.15 : 0);
      P.tilt = (st.tiltT > 0 ? Math.sin(Math.min(1, st.tiltT) * Math.PI) * 0.22 : 0) + (st.happy > 0 ? Math.sin(st.t * 7) * 0.12 : 0);
      P.curl = st.curl;
      P.stalk = st.stalk > 0 ? 1 : 0;
      P.happy = st.happy > 0 ? 1 : 0;
      P.drop = st.drop;
      P.blink = st.blinkV;
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
    function loop(now) {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
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
      setGecko, spawnFood, takeFoods, setPoops, setNight, setDirty, wake, hearts, setClose,
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
  function photo(look) {
    if (!supported) return null;
    const key = [look.genes.snow, look.genes.alb, look.genes.ecl, look.genes.bliz, look.tang, look.seed, look.stage, !!look.shed].join('|');
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
    P.curl = 1.8;
    P.look = -0.2;
    P.tilt = 0.12;
    P.drop = 0.05;
    gk.root.rotation.y = 0.45;
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
    const dist = Math.max(size.x, size.z) * 2.25;
    pr.camera.position.set(c.x + dist * 0.05, dist * 0.5, c.z + dist * 0.85);
    pr.camera.lookAt(c.x + 0.15, 0.3, c.z);
    pr.renderer.render(pr.scene, pr.camera);
    const url = pr.renderer.domElement.toDataURL('image/png');
    pr.scene.remove(gk.root);
    disposeGecko(gk);
    photoCache.set(key, url);
    return url;
  }

  root.Leopa3D = { supported, createTank, photo };
})(typeof window !== 'undefined' ? window : globalThis);
