/* レオパといっしょ — 3D 表示（Three.js r128）
 * ちびキャラ体型のレオパを、図形の組み合わせと手描きテクスチャで作る。
 * 座標: レオパは +Z 向き。ケースの床は x: -5〜5, z: -3.75〜3.75。
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
  const V = (x, y, z) => new T.Vector3(x, y, z);
  const lerp = (a, b, t) => a + (b - a) * t;
  function angleTo(from, to) { return ((to - from + Math.PI * 3) % (Math.PI * 2)) - Math.PI; }

  // ---------- テクスチャ
  const texCache = new Map();
  function canvasTex(key, w, h, draw) {
    if (texCache.has(key)) return texCache.get(key);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c);
    t.encoding = T.sRGBEncoding;
    t.anisotropy = 4;
    texCache.set(key, t);
    return t;
  }

  /* 体の模様。球の UV は「横 = 胴まわり」「縦 = 頭→しっぽ」。
   * 横 25% のあたりがおなか側になる（球を X 軸で 90° 回しているため）。 */
  function skinTex(pal, o) {
    const key = ['skin', o.part, o.color, pal.spot, o.bands, o.spots, pal.pattern, o.seed, o.dense].join('|');
    return canvasTex(key, 512, 256, (ctx, W, H) => {
      const r = prng(o.seed + (o.part === 'head' ? 11 : o.part === 'tail' ? 23 : 0));
      ctx.fillStyle = o.color;
      ctx.fillRect(0, 0, W, H);
      if (pal.pattern && o.bands > 0) {
        ctx.globalAlpha = o.bands;
        ctx.fillStyle = pal.spot;
        const rows = o.part === 'body' ? [0.3, 0.55, 0.8] : o.part === 'tail' ? [0.5] : [0.88];
        for (const y of rows) {
          const bh = (o.part === 'tail' ? 0.34 : 0.13) * H;
          ctx.beginPath();
          ctx.moveTo(0, y * H - bh / 2);
          for (let x = 0; x <= W; x += 32) ctx.lineTo(x, y * H - bh / 2 + (r() - 0.5) * 12);
          for (let x = W; x >= 0; x -= 32) ctx.lineTo(x, y * H + bh / 2 + (r() - 0.5) * 12);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      if (pal.pattern && o.spots > 0) {
        ctx.globalAlpha = o.spots;
        ctx.fillStyle = pal.spot;
        const n = (o.part === 'head' ? 34 : 70) * (o.dense ? 1.4 : 1);
        for (let i = 0; i < n; i++) {
          const x = r() * W, y = (o.part === 'head' ? 0.35 + r() * 0.6 : 0.08 + r() * 0.86) * H;
          const rad = (o.part === 'head' ? 3 : 4) + r() * (o.part === 'head' ? 4 : 7);
          ctx.beginPath();
          ctx.ellipse(x, y, rad * 1.1, rad, r() * 3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      // 白っぽいおなか
      const belly = A.mix(o.color, '#FFF7EA', 0.62);
      const g = ctx.createLinearGradient(0, 0, W, 0);
      g.addColorStop(0.02, 'rgba(0,0,0,0)');
      g.addColorStop(0.14, belly);
      g.addColorStop(0.36, belly);
      g.addColorStop(0.48, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    });
  }

  // 目のテクスチャ。球の UV 中央 (u=.5, v=.5) が +X を向く
  function eyeTex(pal) {
    const key = ['eye', pal.eye, pal.pupil, pal.solid].join('|');
    return canvasTex(key, 256, 128, (ctx, W, H) => {
      const g = ctx.createRadialGradient(W / 2, H / 2, 4, W / 2, H / 2, W * 0.3);
      if (pal.solid) {
        g.addColorStop(0, A.mix(pal.eye, '#FFFFFF', 0.12));
        g.addColorStop(1, A.mix(pal.eye, '#000000', 0.35));
      } else {
        g.addColorStop(0, A.mix(pal.eye, '#FFFFFF', 0.35));
        g.addColorStop(0.6, pal.eye);
        g.addColorStop(1, A.mix(pal.eye, '#000000', 0.45));
      }
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      if (!pal.solid) {
        ctx.strokeStyle = A.mix(pal.eye, '#000000', 0.25);
        ctx.globalAlpha = 0.4;
        for (let i = 0; i < 26; i++) {
          const a = i / 26 * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(W / 2 + Math.cos(a) * 12, H / 2 + Math.sin(a) * 12);
          ctx.lineTo(W / 2 + Math.cos(a) * 36, H / 2 + Math.sin(a) * 36);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = pal.pupil;
        ctx.beginPath();
        ctx.ellipse(W / 2, H / 2, 7, 30, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  function sandTex() {
    return canvasTex('sand', 512, 384, (ctx, W, H) => {
      const g = ctx.createLinearGradient(0, 0, W, 0);
      g.addColorStop(0, '#E4CFA4');
      g.addColorStop(0.6, '#E6CC9A');
      g.addColorStop(1, '#EDBF86');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      const r = prng(7);
      for (let i = 0; i < 5000; i++) {
        ctx.fillStyle = r() < 0.5 ? 'rgba(120,90,50,.18)' : 'rgba(255,255,255,.28)';
        ctx.fillRect(r() * W, r() * H, 1 + r() * 1.5, 1 + r() * 1.5);
      }
    });
  }

  // ---------- 形
  function std(color, extra) { return new T.MeshStandardMaterial(Object.assign({ color, roughness: 0.65 }, extra)); }
  function ellipsoid(r, sx, sy, sz, mat, alongZ) {
    const geo = new T.SphereGeometry(r, 36, 24);
    if (alongZ) geo.rotateX(Math.PI / 2);
    const m = new T.Mesh(geo, mat);
    m.scale.set(sx, sy, sz);
    m.castShadow = true;
    return m;
  }

  /* look: { genes, tang, seed, stage, gravid, shed } */
  function buildGecko(look) {
    const pal = A.colors(look.genes, look.tang, look.stage);
    const st = look.stage;
    const skin = { bands: st === 'baby' ? 1 : st === 'young' ? 0.45 : 0, spots: st === 'baby' ? 0 : st === 'young' ? 0.7 : 1, seed: look.seed || 1, dense: look.genes.snow === 2 };
    const mat = (part, color) => {
      const m = std('#ffffff', { map: skinTex(pal, Object.assign({ part, color }, skin)), roughness: 0.6 });
      if (look.shed) { m.emissive = new T.Color('#ffffff'); m.emissiveIntensity = 0.28; m.roughness = 1; }
      return m;
    };
    const bodyMat = mat('body', pal.base), headMat = mat('head', pal.base), tailMat = mat('tail', pal.tail);
    const plain = std(pal.base, { roughness: 0.6 });
    if (look.shed) { plain.emissive = new T.Color('#ffffff'); plain.emissiveIntensity = 0.28; }

    const rootG = new T.Group();
    const rig = new T.Group();
    rootG.add(rig);

    const body = ellipsoid(1, 0.8, 0.56, 1.12, bodyMat, true);
    body.position.set(0, 0.62, 0);
    if (look.gravid) body.userData.gw = 1.14;
    rig.add(body);

    // 頭（大きめでちびキャラっぽく）
    const headG = new T.Group();
    headG.position.set(0, 0.9, 1.1);
    rig.add(headG);
    const HC = V(0, 0.04, 0.22), HR = V(0.96, 0.78, 0.88);
    const head = ellipsoid(1, HR.x, HR.y, HR.z, headMat, true);
    head.position.copy(HC);
    headG.add(head);
    const onHead = (ax, ay, out) => {
      const d = V(Math.sin(ax) * Math.cos(ay), Math.sin(ay), Math.cos(ax) * Math.cos(ay));
      return V(HC.x + d.x * HR.x * out, HC.y + d.y * HR.y * out, HC.z + d.z * HR.z * out);
    };
    const normalAt = p => V((p.x - HC.x) / (HR.x * HR.x), (p.y - HC.y) / (HR.y * HR.y), (p.z - HC.z) / (HR.z * HR.z)).normalize();

    // 目（大きく、つやつや）
    const eyes = [];
    const eMat = new T.MeshStandardMaterial({ map: eyeTex(pal), roughness: 0.08, metalness: 0.05 });
    const shine = new T.MeshBasicMaterial({ color: '#ffffff' });
    for (const side of [-1, 1]) {
      const p = onHead(side * 0.56, 0.3, 0.84);
      const n = normalAt(p);
      const eg = new T.Group();
      eg.position.copy(p);
      headG.add(eg);
      const ball = new T.Mesh(new T.SphereGeometry(0.3, 32, 20), eMat);
      ball.quaternion.setFromUnitVectors(V(1, 0, 0), n);
      eg.add(ball);
      const hl = new T.Mesh(new T.SphereGeometry(0.075, 12, 8), shine);
      hl.position.copy(n.clone().multiplyScalar(0.25)).add(V(0, 0.13, 0.08));
      eg.add(hl);
      const hl2 = new T.Mesh(new T.SphereGeometry(0.035, 10, 6), shine);
      hl2.position.copy(n.clone().multiplyScalar(0.29)).add(V(0, -0.06, 0.1));
      eg.add(hl2);
      eyes.push(eg);
    }

    // にっこり口
    const smilePts = [];
    for (let i = 0; i <= 10; i++) {
      const ax = -0.95 + i * 0.19;
      smilePts.push(onHead(ax, -0.3 + 0.16 * Math.pow(ax / 0.95, 2), 1.004));
    }
    const smile = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(smilePts), 48, 0.026, 6), std(A.mix(pal.outline, '#000000', 0.35), { roughness: 0.9 }));
    headG.add(smile);
    for (const side of [-1, 1]) {
      const nose = new T.Mesh(new T.SphereGeometry(0.035, 8, 6), std('#3A2E22'));
      nose.position.copy(onHead(side * 0.14, 0.0, 1.0));
      headG.add(nose);
      // ほっぺ
      const cheek = new T.Mesh(new T.CircleGeometry(0.15, 24), new T.MeshBasicMaterial({ color: '#FF8FA0', transparent: true, opacity: 0.38, depthWrite: false }));
      const cp = onHead(side * 0.78, -0.16, 1.012);
      cheek.position.copy(cp);
      cheek.lookAt(cp.clone().add(normalAt(cp)));
      headG.add(cheek);
    }
    const tongue = ellipsoid(0.1, 1, 0.35, 1.5, std('#E86F82', { roughness: 0.4 }), false);
    tongue.position.copy(onHead(0, -0.3, 0.98));
    tongue.scale.setScalar(0.0001);
    headG.add(tongue);

    // 足
    const legs = [];
    for (const [side, front] of [[-1, true], [1, true], [-1, false], [1, false]]) {
      const g = new T.Group();
      g.position.set(side * 0.55, 0.5, front ? 0.62 : -0.55);
      const upper = ellipsoid(1, 0.38, 0.17, 0.18, plain, false);
      upper.position.set(side * 0.3, -0.12, 0);
      upper.rotation.z = side * -0.55;
      g.add(upper);
      const foot = new T.Group();
      foot.position.set(side * 0.58, -0.44, front ? 0.1 : -0.04);
      foot.add(ellipsoid(1, 0.18, 0.07, 0.19, plain, false));
      for (let i = 0; i < 5; i++) {
        const a = (front ? -0.9 : -1.6) + i * 0.42 + (side < 0 ? 0 : 0);
        const toe = ellipsoid(0.055, 1, 0.8, 1, plain, false);
        toe.position.set(Math.sin(a) * 0.2 * side, -0.01, Math.cos(a) * 0.2 * (front ? 1 : 0.6));
        foot.add(toe);
      }
      g.add(foot);
      rig.add(g);
      legs.push({ g, foot, side, front, baseY: foot.position.y });
    }

    // 太いしっぽ（節ごとにつなげて、ふりふりさせる）
    const tail = [];
    let parent = rig;
    const radii = [0.47, 0.46, 0.42, 0.35, 0.27, 0.19, 0.12];
    radii.forEach((rad, i) => {
      const seg = new T.Group();
      if (i === 0) seg.position.set(0, 0.55, -0.9);
      else seg.position.set(0, -0.025, -0.36);
      parent.add(seg);
      const m = ellipsoid(rad, 1, 0.72, 1.3, tailMat, true);
      seg.add(m);
      tail.push(seg);
      parent = seg;
    });

    rootG.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return { root: rootG, rig, body, headG, eyes, tongue, legs, tail, headBaseZ: headG.position.z };
  }

  function disposeTree(obj) {
    obj.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
    });
  }

  // ---------- えさ・フン
  function buildFood(kind) {
    const g = new T.Group();
    if (kind === 'cricket') {
      const brown = std('#7A4E26'), dark = std('#4F3217');
      const b = ellipsoid(0.13, 1, 0.8, 1.9, brown, false); b.position.y = 0.12; g.add(b);
      const h = ellipsoid(0.09, 1, 1, 1, dark, false); h.position.set(0, 0.14, 0.24); g.add(h);
      for (const s of [-1, 1]) {
        const leg = new T.Mesh(new T.CylinderGeometry(0.02, 0.015, 0.4, 5), dark);
        leg.position.set(s * 0.13, 0.13, -0.08); leg.rotation.set(0.9, 0, s * 0.5); g.add(leg);
        const ant = new T.Mesh(new T.CylinderGeometry(0.006, 0.006, 0.45, 4), dark);
        ant.position.set(s * 0.06, 0.2, 0.45); ant.rotation.set(1.2, 0, s * 0.35); g.add(ant);
      }
    } else if (kind === 'dubia') {
      const b = ellipsoid(0.2, 1, 0.4, 1.3, std('#4E2F1A', { roughness: 0.35 }), false); b.position.y = 0.08; g.add(b);
    } else {
      const m = std('#D2A34A', { roughness: 0.4 });
      for (let i = 0; i < 6; i++) {
        const s = ellipsoid(0.07, 1, 1, 1.2, m, false);
        s.position.set(0, 0.07, (i - 2.5) * 0.1);
        g.add(s);
      }
    }
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return g;
  }
  function buildPoop() {
    const g = new T.Group();
    const p = ellipsoid(0.13, 1, 0.8, 1.7, std('#4A3524', { roughness: 0.9 }), false);
    p.position.y = 0.1;
    const u = ellipsoid(0.08, 1, 0.9, 1, std('#F4F1E8', { roughness: 0.8 }), false);
    u.position.set(0, 0.08, 0.28);
    g.add(p, u);
    return g;
  }

  // ======================================================
  // ケース
  // ======================================================
  function createTank(container, handlers) {
    const renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 2));
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    const fxBox = document.createElement('div');
    fxBox.className = 'fx3d';
    container.appendChild(fxBox);

    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(34, 4 / 3, 0.1, 100);
    camera.position.set(0, 9.6, 8.4);
    camera.lookAt(0, 0, 0.2);

    const hemi = new T.HemisphereLight('#FFF6E4', '#9C8A6A', 0.75);
    const sun = new T.DirectionalLight('#FFFFFF', 0.85);
    sun.position.set(-3, 10, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 6, bottom: -6, near: 1, far: 30 });
    sun.shadow.radius = 4;
    const heat = new T.PointLight('#FFB060', 0.9, 9, 1.6);
    heat.position.set(4.5, 3, -1);
    scene.add(hemi, sun, heat);

    // 床・かべ・シェルター・水入れ
    const floor = new T.Mesh(new T.PlaneGeometry(10, 7.5), std('#ffffff', { map: sandTex(), roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    const wallMat = std('#C9D9D0', { transparent: true, opacity: 0.55, roughness: 0.2 });
    const walls = [[0, -3.9, 10.4, 0.3, 1.6], [0, 3.9, 10.4, 0.3, 0.35], [-5.1, 0, 0.3, 7.5, 1.6], [5.1, 0, 0.3, 7.5, 1.6]];
    for (const [x, z, w, d, h] of walls) {
      const m = new T.Mesh(new T.BoxGeometry(w, h, d), wallMat);
      m.position.set(x, h / 2, z);
      scene.add(m);
    }
    const rockGeo = new T.IcosahedronGeometry(1, 1);
    const rock = new T.Mesh(rockGeo, std('#8F8272', { flatShading: true, roughness: 0.95 }));
    rock.scale.set(1.7, 0.9, 1.35);
    rock.position.set(-3.3, 0.2, -2.3);
    rock.castShadow = true;
    rock.receiveShadow = true;
    const door = new T.Mesh(new T.CircleGeometry(0.55, 24), new T.MeshBasicMaterial({ color: '#2E2720' }));
    door.position.set(-3.1, 0.34, -1.02);
    door.rotation.set(-0.35, 0, 0);
    door.scale.set(1.15, 0.72, 1);
    scene.add(rock, door);
    const dish = new T.Mesh(new T.CylinderGeometry(0.85, 0.8, 0.28, 32), std('#E8E1D2', { roughness: 0.5 }));
    dish.position.set(-3.8, 0.14, 2.5);
    dish.castShadow = true;
    const water = new T.Mesh(new T.CircleGeometry(0.68, 32), std('#78B7D2', { roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.9 }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(-3.8, 0.29, 2.5);
    scene.add(dish, water);
    // 汚れ
    const dirt = new T.Group();
    const dirtMat = new T.MeshBasicMaterial({ color: '#6E5434', transparent: true, opacity: 0.35, depthWrite: false });
    for (const [x, z, r] of [[-1.5, 1.6, 0.35], [1.8, -0.8, 0.25], [0.4, 2.6, 0.3], [2.9, 1.9, 0.22]]) {
      const d = new T.Mesh(new T.CircleGeometry(r, 16), dirtMat);
      d.rotation.x = -Math.PI / 2;
      d.position.set(x, 0.01, z);
      dirt.add(d);
    }
    dirt.visible = false;
    scene.add(dirt);

    const BOUNDS = { x: 4.3, zMin: -3.2, zMax: 3.3 };
    const HIDE = { x: -3.0, z: 0.35, face: Math.PI };
    const POOP_SPOTS = [[4.2, -3.0], [3.75, -3.2], [4.35, -2.55]];

    const st = {
      gk: null, id: null, key: '', size: 1, x: 0.5, z: 0.8, yaw: 0.4,
      mode: 'idle', wait: 1, target: null, sleeping: false, zzz: 0,
      foods: [], poops: [], t: 0, walkPhase: 0, moving: false,
      lick: 0, happy: 0, chomp: 0, stalk: 0, headYaw: 0, active: true, night: false,
    };

    function resize() {
      const w = container.clientWidth, h = container.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    if (root.ResizeObserver) new ResizeObserver(resize).observe(container);
    resize();

    function setGecko(look) {
      if (!look) {
        if (st.gk) { scene.remove(st.gk.root); disposeTree(st.gk.root); }
        st.gk = null; st.id = null; st.key = '';
        return;
      }
      const key = [look.genes.snow, look.genes.alb, look.genes.ecl, look.genes.bliz, look.tang, look.seed, look.stage, !!look.gravid, !!look.shed].join('|');
      if (look.id !== st.id) {
        Object.assign(st, { x: rand(-1.5, 2), z: rand(-0.5, 1.5), yaw: rand(-1, 1), mode: 'idle', wait: 1, sleeping: false, stalk: 0 });
      }
      st.size = look.size;
      if (key !== st.key || look.id !== st.id) {
        if (st.gk) { scene.remove(st.gk.root); disposeTree(st.gk.root); }
        st.gk = buildGecko(look);
        scene.add(st.gk.root);
        st.key = key;
      }
      st.id = look.id;
      st.gk.root.scale.setScalar(1.05 * st.size);
    }

    function spawnFood(kind) {
      const obj = buildFood(kind);
      let x, z;
      do { x = rand(-3.5, 3.8); z = rand(-2.4, 2.8); } while (Math.hypot(x - st.x, z - st.z) < 3);
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
      st.night = on;
      hemi.intensity = on ? 0.32 : 0.75;
      hemi.color.set(on ? '#A9B8FF' : '#FFF6E4');
      sun.intensity = on ? 0.3 : 0.85;
      sun.color.set(on ? '#B8C4FF' : '#FFFFFF');
      heat.intensity = on ? 0.7 : 0.9;
      scene.background = new T.Color(on ? '#1C2230' : '#DCE6DE');
    }
    function setDirty(on) { dirt.visible = on; }
    function wake() {
      if (!st.sleeping) return;
      st.sleeping = false;
      st.mode = 'idle';
      st.wait = 0.8;
    }

    // 画面上の位置にハートや Zzz を出す
    function screenPos(obj) {
      const p = new T.Vector3();
      obj.getWorldPosition(p);
      p.y += 0.6;
      p.project(camera);
      return { x: (p.x + 1) / 2 * 100, y: (1 - p.y) / 2 * 100 };
    }
    function fx(text, cls) {
      if (!st.gk) return;
      const pos = screenPos(st.gk.headG);
      const s = document.createElement('span');
      s.className = 'fx-item ' + (cls || '');
      s.textContent = text;
      s.style.left = (pos.x + rand(-4, 4)) + '%';
      s.style.top = pos.y + '%';
      fxBox.appendChild(s);
      setTimeout(() => s.remove(), 1400);
    }
    function hearts(n) { for (let i = 0; i < n; i++) setTimeout(() => fx('♥', 'heart'), i * 220); }

    // タップ
    const ray = new T.Raycaster();
    let down = null;
    renderer.domElement.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });
    renderer.domElement.addEventListener('pointerup', e => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 12) return;
      down = null;
      const r = renderer.domElement.getBoundingClientRect();
      ray.setFromCamera({ x: (e.clientX - r.left) / r.width * 2 - 1, y: -(e.clientY - r.top) / r.height * 2 + 1 }, camera);
      for (let i = st.poops.length - 1; i >= 0; i--) {
        if (ray.intersectObject(st.poops[i], true).length || distToRay(st.poops[i].position) < 0.45) {
          handlers.onTapPoop && handlers.onTapPoop();
          return;
        }
      }
      if (st.gk && ray.intersectObject(st.gk.root, true).length) {
        if (st.sleeping) wake();
        st.lick = 0.7;
        handlers.onTapGecko && handlers.onTapGecko();
      }
    });
    function distToRay(p) { return ray.ray.distanceToPoint(p); }

    // ---------- 動き
    function headWorld() {
      const p = new T.Vector3();
      st.gk.headG.getWorldPosition(p);
      return p;
    }
    function moveToward(tx, tz, speed, dt) {
      const dx = tx - st.x, dz = tz - st.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.05) return false;
      const want = Math.atan2(dx, dz);
      const diff = angleTo(st.yaw, want);
      st.yaw += diff * Math.min(1, dt * 4);
      const step = Math.min(d, speed * dt * (Math.abs(diff) > 1.1 ? 0.25 : 1));
      st.x += Math.sin(st.yaw) * step;
      st.z += Math.cos(st.yaw) * step;
      return true;
    }
    function clampPos() {
      const m = 1.35 * st.size;
      st.x = Math.max(-BOUNDS.x + m, Math.min(BOUNDS.x - m, st.x));
      st.z = Math.max(BOUNDS.zMin + m, Math.min(BOUNDS.zMax - m * 0.6, st.z));
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
          const x1 = Math.max(-4.3, Math.min(4.3, f.obj.position.x + rand(-reach, reach)));
          const z1 = Math.max(-3.2, Math.min(3.3, f.obj.position.z + rand(-reach, reach)));
          f.obj.rotation.y = Math.atan2(x1 - f.obj.position.x, z1 - f.obj.position.z);
          f.hop = { x0: f.obj.position.x, z0: f.obj.position.z, x1, z1, k: 0, dur: f.kind === 'cricket' ? 0.35 : 1.2 };
          f.t = rand(0.9, 2.2);
        }
      }
    }

    function stepGecko(dt) {
      const gk = st.gk;
      if (!gk) return;
      let moving = false;
      const food = st.foods[0];
      const nightFactor = st.night ? 1.35 : 1;

      if (st.chomp > 0) {
        st.chomp -= dt;
      } else if (food) {
        if (st.sleeping) wake();
        const fp = food.obj.position;
        const hp = headWorld();
        const dHead = Math.hypot(fp.x - hp.x, fp.z - hp.z);
        if (dHead < 0.42 * st.size + 0.12 && !food.hop) {
          // ぱくっ
          st.foods.shift();
          scene.remove(food.obj);
          disposeTree(food.obj);
          st.chomp = 0.6;
          handlers.onEat && handlers.onEat(food.kind);
        } else if (dHead < 1.6 * st.size && st.stalk < 0.9) {
          // 狩りの前にしっぽの先をぷるぷる
          st.stalk += dt;
          const want = Math.atan2(fp.x - st.x, fp.z - st.z);
          st.yaw += angleTo(st.yaw, want) * Math.min(1, dt * 5);
        } else {
          moving = moveToward(fp.x - Math.sin(st.yaw) * 1.25 * st.size * 0.9, fp.z - Math.cos(st.yaw) * 1.25 * st.size * 0.9, (st.stalk >= 0.9 ? 3.2 : 1.7) * nightFactor, dt);
          if (!moving) st.stalk = 0;
        }
      } else {
        st.stalk = 0;
        if (st.sleeping) {
          st.wait -= dt;
          st.zzz -= dt;
          if (st.zzz <= 0) { fx('z', 'zzz'); st.zzz = 1.7; }
          if (st.wait <= 0) wake();
        } else if (st.mode === 'walk' || st.mode === 'toHide') {
          moving = moveToward(st.target.x, st.target.z, 0.9 * nightFactor, dt);
          if (Math.hypot(st.target.x - st.x, st.target.z - st.z) < 0.12) {
            if (st.mode === 'toHide') {
              st.sleeping = true;
              st.wait = rand(18, 35);
              st.zzz = 0.6;
            }
            st.mode = 'idle';
            st.wait = st.night ? rand(0.8, 2.5) : rand(2, 5);
          }
        } else {
          st.wait -= dt;
          if (st.wait <= 0) {
            if (!st.night && Math.random() < 0.3) {
              st.mode = 'toHide';
              st.target = { x: HIDE.x, z: HIDE.z };
            } else {
              st.mode = 'walk';
              st.target = { x: rand(-2.5, 3.5), z: rand(-1.6, 2.4) };
            }
          }
        }
      }
      if (st.sleeping) st.yaw += angleTo(st.yaw, HIDE.face) * Math.min(1, dt * 2);
      clampPos();
      st.moving = moving;

      // ポーズ
      gk.root.position.set(st.x, 0, st.z);
      gk.root.rotation.y = st.yaw;
      if (moving) st.walkPhase += dt * 9;
      const t = st.t;
      gk.rig.position.y = moving ? Math.abs(Math.sin(st.walkPhase)) * 0.05 : 0;
      gk.rig.rotation.z = moving ? Math.sin(st.walkPhase) * 0.05 : 0;
      const breathe = 1 + Math.sin(t * (st.sleeping ? 1.6 : 2.6)) * 0.022;
      gk.body.scale.x = 0.8 * breathe * (gk.body.userData.gw || 1);
      gk.body.scale.y = 0.56 * breathe;
      gk.legs.forEach((l, i) => {
        const ph = st.walkPhase + ((i === 0 || i === 3) ? 0 : Math.PI);
        l.g.rotation.y = moving ? Math.sin(ph) * 0.55 * l.side * (l.front ? 1 : -1) : 0;
        l.foot.position.y = l.baseY + (moving ? Math.max(0, Math.sin(ph)) * 0.12 : 0);
      });
      const wagAmp = st.stalk > 0 ? 0.35 : moving ? 0.16 : st.happy > 0 ? 0.3 : 0.06;
      const wagSpd = st.stalk > 0 ? 22 : moving ? 9 : st.happy > 0 ? 10 : 1.5;
      gk.tail.forEach((s, i) => {
        const curl = st.sleeping ? 0.32 : 0;
        const tipBoost = st.stalk > 0 ? (i >= 4 ? 1 : 0.05) : i / gk.tail.length;
        s.rotation.y = curl + Math.sin(t * wagSpd - i * 0.8) * wagAmp * tipBoost;
      });
      // 頭：こっちを見る・かしげる・ぱくっ
      let wantHead = 0;
      if (!moving && !st.sleeping && !food) {
        const toCam = Math.atan2(camera.position.x - st.x, camera.position.z - st.z);
        wantHead = Math.max(-0.6, Math.min(0.6, angleTo(st.yaw, toCam)));
      }
      st.headYaw = lerp(st.headYaw, wantHead, Math.min(1, dt * 3));
      gk.headG.rotation.y = st.headYaw;
      gk.headG.rotation.z = st.happy > 0 ? Math.sin(t * 8) * 0.18 : (st.lick > 0 ? 0.15 : 0);
      gk.headG.rotation.x = st.sleeping ? 0.18 : 0;
      gk.headG.position.z = gk.headBaseZ + (st.chomp > 0.3 ? 0.18 : 0);
      // まばたき（レオパにはまぶたがある）
      const blink = st.sleeping ? 0.1 : ((t % 4.7) < 0.14 ? 0.12 : 1);
      gk.eyes.forEach(e => { e.scale.y = lerp(e.scale.y, blink, Math.min(1, dt * 25)); });
      // ぺろっ
      if (st.lick > 0) st.lick -= dt;
      const tk = st.lick > 0 ? Math.sin((0.7 - st.lick) / 0.7 * Math.PI) : 0;
      gk.tongue.scale.setScalar(Math.max(0.0001, tk));
      gk.tongue.position.z = 1.0 + tk * 0.25;
      if (st.happy > 0) st.happy -= dt;
    }

    let last = performance.now();
    function loop(now) {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (st.active) {
        st.t += dt;
        stepFoods(dt);
        stepGecko(dt);
        renderer.render(scene, camera);
      }
      requestAnimationFrame(loop);
    }
    setNight(false);
    requestAnimationFrame(loop);

    return {
      setGecko, spawnFood, takeFoods, setPoops, setNight, setDirty, wake, hearts,
      pendingFoods: () => st.foods.map(f => f.kind),
      lick() { st.lick = 0.7; },
      happy() { st.happy = 1.2; if (st.sleeping) wake(); },
      setActive(v) { st.active = v; if (v) { last = performance.now(); resize(); } },
    };
  }
  function rand(a, b) { return a + Math.random() * (b - a); }

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
      renderer.setSize(320, 320);
      renderer.setPixelRatio(1);
      renderer.outputEncoding = T.sRGBEncoding;
      const scene = new T.Scene();
      const key1 = new T.DirectionalLight('#ffffff', 0.9);
      key1.position.set(3, 6, 5);
      scene.add(new T.HemisphereLight('#FFF6E4', '#B9A57E', 0.85), key1);
      const camera = new T.PerspectiveCamera(30, 1, 0.1, 60);
      pr = { renderer, scene, camera };
    }
    const gk = buildGecko(look);
    // くるんとしっぽを巻いて、こっちを向いたポーズ
    gk.tail.forEach((s, i) => { s.rotation.y = 0.42 + i * 0.02; });
    gk.headG.rotation.y = -0.3;
    gk.headG.rotation.z = 0.1;
    gk.root.rotation.y = 0.6;
    gk.root.updateMatrixWorld(true);
    const box = new T.Box3().setFromObject(gk.root);
    const c = box.getCenter(new T.Vector3());
    const size = box.getSize(new T.Vector3());
    gk.root.position.sub(c);
    pr.scene.add(gk.root);
    const dist = Math.max(size.x, size.z) * 1.9;
    pr.camera.position.set(0, dist * 0.45, dist * 0.9);
    pr.camera.lookAt(0, -0.15, 0);
    pr.renderer.render(pr.scene, pr.camera);
    const url = pr.renderer.domElement.toDataURL('image/png');
    pr.scene.remove(gk.root);
    disposeTree(gk.root);
    photoCache.set(key, url);
    return url;
  }

  root.Leopa3D = { supported, createTank, photo };
})(typeof window !== 'undefined' ? window : globalThis);
