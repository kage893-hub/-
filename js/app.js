/* レオパといっしょ — ゲーム本体
 * この世界のレオパは病気にもならず、死ぬこともない。
 * お世話をさぼっても「しょんぼり」して成長が止まるだけ。
 */
(function () {
  'use strict';
  const G = window.LeopaGenetics;
  const A = window.LeopaArt;
  const L3 = window.Leopa3D;

  const SAVE_KEY = 'leopa-together-v1';
  const MIN = 60 * 1000, HOUR = 60 * MIN;
  const RATE = { hunger: 5, clean: 3 }; // 1時間あたりに減る量
  const GROWTH = { perHour: 6, young: 50, adult: 140, max: 260, shedEvery: 35 };
  const EGG_CAP = 12, CASE_MAX = 12;

  const FOODS = {
    cricket: { name: 'コオロギ', hunger: 15, growth: 3, price: 10, pack: 10, desc: '定番のごはん。ぴょんぴょん跳ねる' },
    dubia: { name: 'デュビア', hunger: 25, growth: 5, price: 15, pack: 5, desc: '栄養たっぷり。動きがゆっくりで食べやすい' },
    worm: { name: 'ミルワーム', hunger: 18, growth: 8, price: 8, pack: 5, desc: 'みんな大好き。脂肪が多いのでおやつに' },
  };
  // 卵の温度で性別と日数が変わる（温度依存性決定）
  const TEMPS = [
    { t: 27, label: '27℃', note: 'メスが多い', mins: 60, pMale: 0.1 },
    { t: 29.5, label: '29.5℃', note: 'オスメス半々', mins: 45, pMale: 0.5 },
    { t: 32, label: '32℃', note: 'オスが多い', mins: 30, pMale: 0.9 },
  ];
  const NAMES = ['きなこ', 'マロン', 'ゆず', 'こはく', 'ぽてと', 'みかん', 'だいず', 'あんず', 'ごま', 'ちくわ', 'むぎ', 'ぷりん', 'すず', 'こむぎ', 'はな', 'そら', 'くるみ', 'おもち', 'たまき', 'ぽん', 'レモン', 'ココア', 'しらたま', 'のり', 'べに'];
  const TIPS = [
    'レオパ（ヒョウモントカゲモドキ）にはまぶたがあるので、まばたきができます。',
    'レオパはトイレの場所を決める習性があります。フンはいつもケースの同じ隅に。',
    'フンの白い部分は尿酸。おしっこのかわりです。',
    '卵の温度で性別が決まります。低めだとメス、高めだとオスが多くなります。',
    '脱皮した皮は、たいてい自分で食べてしまいます。',
    'しっぽに栄養をたくわえます。太いしっぽは元気のしるし。',
    '夕方から夜にかけて活発になる生き物です。昼間はシェルターで寝ていることも。',
    '1回に産む卵はふつう2個です。',
    'ベビーのしま模様は、大きくなるとヒョウ柄の斑点に変わっていきます。',
    '抱卵中のメスは、おなかが透けて卵が見えることがあります。',
    'アルビノの模様は黒ではなく茶色になります。',
    'エクリプスは目が真っ黒になる遺伝子です。',
    'ケースの片側だけを温めて、暑い場所と涼しい場所を作ってあげます。',
  ];
  const STAGE_LABEL = { baby: 'ベビー', young: 'ヤング', adult: 'アダルト' };

  let S = null;
  let view = 'case';
  let tipIndex = Math.floor(Math.random() * TIPS.length);

  // ---------- 小道具
  const $ = (s, el) => (el || document).querySelector(s);
  const clamp = (v, a, b) => Math.max(a === undefined ? 0 : a, Math.min(b === undefined ? 100 : b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = p => (p * 100 >= 10 || p === 0 ? Math.round(p * 100) : (p * 100).toFixed(1).replace(/\.0$/, '')) + '%';
  function fmtLeft(ms) {
    const m = Math.max(1, Math.ceil(ms / MIN));
    if (m >= 60) { const h = Math.floor(m / 60); return `${h}時間${m % 60 ? (m % 60) + '分' : ''}`; }
    return `${m}分`;
  }
  function setHTML(el, html) { if (el && el._html !== html) { el.innerHTML = html; el._html = html; } }
  const stageOf = g => g.growth >= GROWTH.adult ? 'adult' : g.growth >= GROWTH.young ? 'young' : 'baby';
  const sizeOf = g => 0.5 + 0.5 * Math.min(1, g.growth / GROWTH.max);
  const sexMark = g => g.sex === 'M' ? '♂' : '♀';
  const selected = () => S.geckos.find(g => g.id === S.selected) || null;
  const isNight = () => { const h = new Date().getHours(); return h >= 18 || h < 6; };
  const clockNow = () => { const d = new Date(); return d.getHours() + d.getMinutes() / 60; };
  const seasonNow = () => { const m = new Date().getMonth() + 1; return m >= 3 && m <= 5 ? 'spring' : m >= 6 && m <= 8 ? 'summer' : m >= 9 && m <= 11 ? 'autumn' : 'winter'; };
  const SEASON_JA = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };
  const timeJa = h => h < 5 ? '夜' : h < 8 ? '朝' : h < 16 ? '昼' : h < 19 ? '夕方' : '夜';

  // ---------- 保存
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) { const s = JSON.parse(raw); if (s && (s.v === 1 || s.v === 2)) return migrate(s); }
    } catch (e) { /* 保存できない環境でも遊べる */ }
    return null;
  }
  // 古いデータ（見た目の遺伝がない版）を新しい形にそろえる
  function migrate(s) {
    if (s.v === 1) {
      for (const x of [...s.geckos, ...s.eggs, ...(s.offers || [])]) x.poly = G.normPoly(x.poly);
      for (const g of s.geckos) if (g.gravid && g.gravid.dad) g.gravid.dad.poly = G.normPoly(g.gravid.dad.poly);
      const oldNames = Object.keys(s.dex || {});
      s.dex = {};
      for (const n of oldNames) if (G.DEX.some(d => d.id === n)) s.dex[n] = true;
      s.names = {};
      s.v = 2;
    }
    s.names = s.names || {};
    s.decorInv = s.decorInv || {};
    return s;
  }
  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* noop */ } }

  function newGecko(o) {
    return {
      id: 'g' + (S.nextId++), name: o.name, sex: o.sex,
      genes: G.normGenes(o.genes || {}), tang: o.tang === undefined ? 20 : o.tang, poly: G.normPoly(o.poly),
      growth: o.growth || 0, hunger: o.hunger === undefined ? 70 : o.hunger, clean: 100, tame: o.tame || 10,
      poop: 0, poopAt: 0, shedUntil: 0, gravid: null, restUntil: 0, handledAt: 0,
      seed: Math.floor(Math.random() * 1e9), gen: o.gen || 1, born: Date.now(),
    };
  }
  function freshState() {
    S = {
      v: 2, coins: 60, cases: 4, incTemp: 29.5, food: { cricket: 20, dubia: 3, worm: 3 },
      geckos: [], eggs: [], dex: {}, names: {}, decorInv: { cork: 1 }, selected: null, offers: [], offersAt: 0,
      lastTick: Date.now(), nextId: 1, welcomed: false, stats: { hatched: 0, rehomed: 0 },
    };
    // はじめはショップでレオパを選ぶところから
    S.starters = makeStarters();
  }
  // はじめてのおむかえ候補。オスとメスがどちらもいて、ブリードの入口になる遺伝子をもつ子も入れる
  function makeStarters() {
    const P = o => Object.assign(G.randomPoly(), o);
    const list = [
      { sex: 'M', genes: { alb: 1 }, tang: 45, poly: P({ spots: 38, carrot: 30 }), note: 'アルビノの遺伝子をかくし持つ' },
      { sex: 'F', genes: { snow: 1, alb: 1 }, tang: 22, poly: P({ spots: 30, lav: 40 }), note: 'マックスノー。アルビノの遺伝子も' },
      { sex: 'F', genes: {}, tang: 62, poly: P({ spots: 40, carrot: 25 }), note: 'オレンジが濃いめの血統' },
      { sex: 'M', genes: { ecl: 1 }, tang: 35, poly: P({ spots: 24, head: 35 }), note: '斑点が少なめ。エクリプスの遺伝子も' },
      { sex: Math.random() < 0.5 ? 'M' : 'F', genes: { alb: 2 }, tang: 30, poly: P({}), note: '赤みがかった目のアルビノ' },
      { sex: Math.random() < 0.5 ? 'M' : 'F', genes: {}, tang: 20, poly: P({ aberrant: 55, blotch: 70 }), note: '模様が少し乱れた個性派' },
    ];
    return list.map(o => Object.assign(o, { genes: G.normGenes(o.genes), growth: 55, seed: Math.floor(Math.random() * 1e9) }));
  }
  const nameOf = x => G.morphName(x.genes, x.tang, x.poly);
  // 図鑑に登録して、新しく載った項目の名前を返す
  function register(g) {
    const fresh = G.dexMatches(g.genes, g.tang, g.poly).filter(id => !S.dex[id]);
    fresh.forEach(id => { S.dex[id] = true; });
    S.names[nameOf(g)] = true;
    return fresh.map(id => G.DEX.find(d => d.id === id).name);
  }
  const unseen = x => G.dexMatches(x.genes, x.tang, x.poly).some(id => !S.dex[id]);
  function unusedName() {
    const used = new Set(S.geckos.map(g => g.name));
    const free = NAMES.filter(n => !used.has(n));
    return free.length ? pick(free) : 'レオパ' + S.nextId;
  }

  // ---------- 時間の流れ（アプリを閉じていた間もまとめて進める）
  function simulate(now) {
    const dtH = (now - S.lastTick) / HOUR;
    if (dtH > 0) {
      for (const g of S.geckos) {
        const fedH = Math.max(0, Math.min(dtH, (g.hunger - 30) / RATE.hunger));
        g.hunger = clamp(g.hunger - RATE.hunger * dtH);
        g.clean = clamp(g.clean - RATE.clean * dtH);
        if (fedH > 0) grow(g, fedH * GROWTH.perHour, now);
      }
      S.lastTick = now;
    }
    for (const g of S.geckos) {
      if (g.poopAt && now >= g.poopAt) { g.poop = Math.min(3, g.poop + 1); g.clean = clamp(g.clean - 10); g.poopAt = 0; }
      if (g.shedUntil && now >= g.shedUntil) g.shedUntil = 0;
      if (g.gravid && now >= g.gravid.layAt) layEggs(g, now);
    }
  }
  function grow(g, amt, now) {
    if (g.growth >= GROWTH.max) return;
    const before = g.growth, st = stageOf(g);
    g.growth = Math.min(GROWTH.max, g.growth + amt);
    if (Math.floor(before / GROWTH.shedEvery) < Math.floor(g.growth / GROWTH.shedEvery) && !g.shedUntil) {
      g.shedUntil = now + 40 * MIN;
    }
    const st2 = stageOf(g);
    if (st2 !== st) { toast(`${g.name}が${STAGE_LABEL[st2]}になりました！`); memo(g, `${STAGE_LABEL[st2]}になった！ 模様も変わってきたね`, true); }
    if (g.shedUntil && !g._shedMemo) { g._shedMemo = true; if (!(albumOf(g).entries.some(e => e.text.includes('脱皮')))) memo(g, 'はじめての脱皮がはじまった'); }
    if (!g.shedUntil) g._shedMemo = false;
  }
  function layEggs(g, now) {
    if (S.eggs.length + 2 > EGG_CAP) return; // インキュベーターが空くまで待つ
    const dad = g.gravid.dad;
    const temp = TEMPS.find(t => t.t === S.incTemp) || TEMPS[1];
    for (let i = 0; i < 2; i++) {
      const child = G.breed(g, dad);
      S.eggs.push({
        id: 'e' + (S.nextId++), genes: child.genes, tang: child.tang, poly: child.poly,
        sex: Math.random() < temp.pMale ? 'M' : 'F', temp: temp.t,
        laidAt: now, hatchAt: now + temp.mins * MIN, mom: g.name, dad: dad.name,
        gen: Math.max(g.gen, dad.gen || 1) + 1,
      });
    }
    g.gravid = null;
    g.restUntil = now + 60 * MIN;
    sfx('lay');
    toast(`${g.name}が卵を2個産みました！インキュベーターに移しました`);
    memo(g, `${dad.name}とのあいだに、卵を2個産んだ`);
  }

  // ---------- お店の入荷
  function randomOffer() {
    const r = () => { const x = Math.random(); return x < 0.6 ? 0 : x < 0.9 ? 1 : 2; };
    const x = Math.random();
    const genes = { snow: x < 0.7 ? 0 : x < 0.95 ? 1 : 2, alb: r(), ecl: r(), bliz: r() };
    const adult = Math.random() < 0.25;
    const poly = G.randomPoly();
    let tang = Math.round(rand(0, 65));
    // ときどき、ブリーダーが選別してきた血統の子が入荷する
    const line = Math.random();
    if (line < 0.12) poly.spots = Math.round(rand(6, 26));
    else if (line < 0.2) poly.carrot = Math.round(rand(35, 70));
    else if (line < 0.28) tang = Math.round(rand(60, 85));
    else if (line < 0.33) poly.aberrant = Math.round(rand(55, 85));
    else if (line < 0.38) poly.lav = Math.round(rand(55, 85));
    const o = { genes, tang, poly, sex: Math.random() < 0.5 ? 'M' : 'F', growth: adult ? 150 : Math.round(rand(0, 20)), seed: Math.floor(Math.random() * 1e9) };
    o.price = Math.round(valueOf(o) * 1.3);
    return o;
  }
  function refreshOffers(now) {
    if (now < S.offersAt) return;
    S.offers = [randomOffer(), randomOffer(), randomOffer()];
    S.offersAt = now + 3 * HOUR;
  }
  function valueOf(o) {
    const gs = o.genes;
    let v = 25 + [0, 25, 60][gs.snow];
    for (const k of ['alb', 'ecl', 'bliz']) v += [0, 10, 45][gs[k]];
    const visual = (gs.snow > 0) + (gs.alb === 2) + (gs.ecl === 2) + (gs.bliz === 2);
    if (visual >= 2) v *= 1.3;
    if (visual >= 3) v *= 1.3;
    v += o.tang * 0.5;
    // ラインの呼び名がつく子は値打ちが上がる
    const line = G.lineTokens(o.genes, o.tang, o.poly).filter(t => t !== 'タンジェリン');
    v += line.length * 22;
    if (line.includes('スーパーハイポ')) v += 30;
    if (line.includes('ボールディ')) v += 20;
    if (o.growth >= GROWTH.adult) v *= 1.4;
    return Math.round(v);
  }

  // ---------- トースト
  const toastQ = [];
  let toastBusy = false;
  function toast(msg) { toastQ.push(msg); if (!toastBusy) nextToast(); }
  function nextToast() {
    const el = $('#toast');
    const m = toastQ.shift();
    if (!m) { toastBusy = false; return; }
    toastBusy = true;
    el.textContent = m;
    el.classList.add('show');
    setTimeout(() => { el.classList.remove('show'); setTimeout(nextToast, 250); }, 2400);
  }

  // ---------- シート（下から出るパネル）
  function openSheet(html) {
    const wrap = $('#sheet');
    $('#sheetBody').innerHTML = html;
    wrap.hidden = false;
    const f = $('#sheetBody input, #sheetBody button');
    if (f) setTimeout(() => f.focus(), 50);
  }
  function closeSheet() { $('#sheet').hidden = true; $('#sheetBody').innerHTML = ''; }

  // ======================================================
  // ケースの中（3D）
  // ======================================================
  let tank = null;
  let tankGid = null;

  function lookOf(g) {
    return { id: g.id, genes: g.genes, tang: g.tang, poly: g.poly, seed: g.seed, stage: stageOf(g), gravid: !!g.gravid, shed: !!g.shedUntil, size: sizeOf(g) };
  }
  function initTank() {
    const box = $('#tank3d');
    if (!L3.supported) {
      box.innerHTML = '<p class="tank-empty">この端末では3D表示ができません。お世話はボタンからできます。</p>';
      return;
    }
    tank = L3.createTank(box, {
      onEat(kind) { const g = S.geckos.find(x => x.id === tankGid); if (g) applyEat(g, kind); },
      onTapGecko() { const g = selected(); sfx('tap'); if (g && g.tame >= 40) tank.hearts(1); },
      onTapPoop() { ACTIONS.poop(); },
      onFloorTap: (x, z) => floorTap(x, z),
      onDecorTap: i => decorTap(i),
    });
  }
  function sceneMount() {
    const g = selected();
    if (tankGid && (!g || tankGid !== g.id)) flushFoods();
    tankGid = g ? g.id : null;
    $('#tankEmpty').hidden = !!g;
    if (!tank) return;
    tank.setGecko(g ? lookOf(g) : null);
    tank.setDecor(g ? decorOf(g) : []);
    tank.setPoops(g ? g.poop : 0);
    tank.setDirty(!!g && g.clean < 35);
    tank.setClock(clockNow(), seasonNow());
    const th = $('.thermo');
    if (th) th.textContent = `${SEASON_JA[seasonNow()]}の${timeJa(clockNow())} ／ ホット側 32℃ ・ クール側 26℃`;
  }
  function flushFoods() {
    if (!tank) return;
    const g = S.geckos.find(x => x.id === tankGid);
    for (const k of tank.takeFoods()) if (g) applyEat(g, k);
  }
  // 写真は重いので、まだ撮っていないものは1枚ずつ順番に撮って差しこむ
  const photoQueue = new Map();
  let photoBusy = false;
  function portrait(g, stage, label) {
    const look = { genes: G.normGenes(g.genes), tang: g.tang, poly: g.poly, seed: g.seed || 1, stage: stage || 'adult' };
    if (!L3.supported) return A.gecko(look, { stage: look.stage, label });
    const url = L3.photoReady(look);
    if (url) return `<img src="${url}" alt="${esc(label || '')}">`;
    const key = L3.photoKey(look).replace(/[^\w|.-]/g, '');
    photoQueue.set(key, look);
    if (!photoBusy) { photoBusy = true; setTimeout(pumpPhotos, 30); }
    return `<img class="photo-wait" data-photo="${key}" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" alt="${esc(label || '')}">`;
  }
  function pumpPhotos() {
    const next = photoQueue.entries().next();
    if (next.done) { photoBusy = false; return; }
    const [key, look] = next.value;
    photoQueue.delete(key);
    const url = L3.photo(look);
    document.querySelectorAll(`img[data-photo="${key}"]`).forEach(img => { img.src = url; img.classList.remove('photo-wait'); });
    setTimeout(pumpPhotos, 30);
  }

  // ======================================================
  // お世話
  // ======================================================
  function applyEat(g, kind) {
    const F = FOODS[kind];
    g.hunger = clamp(g.hunger + F.hunger);
    grow(g, F.growth, Date.now());
    g.tame = clamp(g.tame + 1);
    S.coins += 1;
    daily('fed');
    if (view === 'case') sfx('eat');
    if (!g.poopAt) g.poopAt = Date.now() + 2 * MIN;
    renderView();
    save();
  }
  function pendingHunger() { return tank ? tank.pendingFoods().reduce((s, k) => s + FOODS[k].hunger, 0) : 0; }

  function pairBlock(g, now) {
    if (stageOf(g) !== 'adult') return `まだアダルトではありません（せいちょう ${Math.floor(g.growth)} / ${GROWTH.adult}）`;
    if (g.hunger < 40) return 'おなかが空いています。ごはんをあげてからにしよう';
    if (g.gravid) return 'おなかに卵があります（抱卵中）';
    if (g.restUntil > now) return `おやすみ中です（あと${fmtLeft(g.restUntil - now)}）`;
    return '';
  }

  function statusOf(g, now) {
    if (g.gravid) return { cls: 'pink', text: S.eggs.length + 2 > EGG_CAP ? '抱卵中・インキュベーター満杯' : `抱卵中 あと${fmtLeft(g.gravid.layAt - now)}` };
    if (g.shedUntil) return { cls: 'info', text: '脱皮中' };
    if (g.hunger < 25) return { cls: 'warn', text: 'おなかぺこぺこ' };
    if (g.clean < 35 || g.poop >= 2) return { cls: 'warn', text: 'おそうじしてほしい' };
    if (g.restUntil > now) return { cls: 'muted', text: 'ひとやすみ中' };
    if (g.hunger >= 60 && g.clean >= 60) return { cls: 'good', text: 'ごきげん' };
    return { cls: 'muted', text: 'のんびり' };
  }
  function needsCare(g) { return g.hunger < 25 || g.poop > 0 || g.clean < 35 || !!g.shedUntil; }

  function hatch(id) {
    const e = S.eggs.find(x => x.id === id);
    if (!e || Date.now() < e.hatchAt) return;
    if (S.geckos.length >= S.cases) {
      toast('ケースがいっぱいです。ショップでケースを増やすか、里親に出してね');
      return;
    }
    S.eggs = S.eggs.filter(x => x !== e);
    const g = newGecko({ name: unusedName(), sex: e.sex, genes: e.genes, tang: e.tang, poly: e.poly, growth: 0, hunger: 60, gen: e.gen });
    S.geckos.push(g);
    S.stats.hatched++;
    S.coins += 5;
    const fresh = register(g);
    memo(g, `${e.mom} × ${e.dad} の子として、${e.temp}℃の卵から生まれた`, true);
    save();
    renderView();
    const morph = nameOf(g);
    const hets = G.hets(g.genes);
    // 卵がカタカタ → パカッ → 誕生
    openSheet(`<div class="hatching"><div class="hatch-egg">${A.egg()}</div><p class="muted">カタカタ……</p></div>`);
    setTimeout(() => sfx('crack'), 500);
    setTimeout(() => sfx('crack'), 1050);
    setTimeout(() => {
      sfx('hatch');
      openSheet(`<div class="reveal">
        <div class="reveal-art">${portrait(g, "baby", morph)}</div>
        ${fresh.length ? `<span class="pill new">図鑑に新しく登録：${fresh.map(esc).join('・')}</span>` : ''}
        <p class="eyebrow">うまれました！</p>
        <h3 class="morph big">${esc(morph)}</h3>
        <p class="muted">${g.sex === 'M' ? '♂ オス' : '♀ メス'} ・ ${esc(e.mom)} × ${esc(e.dad)} の子${hets.length ? ' ・ ' + hets.map(h => 'het ' + h).join(' / ') : ''}</p>
        ${traitTable(g, true)}
        <form id="renameForm" data-id="${g.id}" data-goto="1" class="rename">
          <label for="renameInput">なまえ</label>
          <input id="renameInput" value="${esc(g.name)}" maxlength="10" autocomplete="off">
          <button class="act primary" type="submit">おむかえする</button>
        </form></div>`);
    }, 1600);
  }

  // ---------- 操作
  const ACTIONS = {
    tab(t) { if (editing) setEditing(null); switchView(t.dataset.view); },
    select(t) { if (editing) setEditing(null); S.selected = t.dataset.id; tipIndex = (tipIndex + 1) % TIPS.length; renderView(); },
    closeSheet() { closeSheet(); },

    feedMenu() {
      const g = selected();
      if (!g) return;
      const full = g.hunger + pendingHunger() >= 90;
      openSheet(`<h3 class="sheet-title">ごはんをあげる</h3>
        ${full ? `<p class="notice">${esc(g.name)}はおなかいっぱいみたい。また少したってから。</p>` : ''}
        <div class="list">${Object.entries(FOODS).map(([k, F]) => `
          <button class="row" data-action="feed" data-kind="${k}" ${full || !S.food[k] ? 'disabled' : ''}>
            <span class="row-art">${A.food(k)}</span>
            <span class="row-main"><b>${F.name}</b><small>${F.desc}</small></span>
            <span class="row-side">のこり ${S.food[k]}</span>
          </button>`).join('')}</div>
        <p class="muted small">なくなったらショップで買えます。</p>`);
    },
    feed(t) {
      const g = selected();
      const k = t.dataset.kind;
      if (!g || !S.food[k]) return;
      if (g.hunger + pendingHunger() >= 90) { toast('おなかいっぱいみたい'); return; }
      S.food[k]--;
      closeSheet();
      if (tank) tank.spawnFood(k);
      else applyEat(g, k);
      save();
    },
    poop() {
      const g = selected();
      if (!g || g.poop <= 0) return;
      g.poop--;
      g.clean = clamp(g.clean + 15);
      S.coins += 1;
      daily('cleaned');
      sfx('tap');
      toast('フンをひろいました');
      renderView();
      save();
    },
    clean() {
      const g = selected();
      if (!g) return;
      if (g.poop === 0 && g.clean >= 95) { toast('もうピカピカです'); return; }
      if (g.clean < 70 || g.poop > 0) S.coins += 2;
      g.clean = 100;
      g.poop = 0;
      daily('cleaned');
      toast('ケースをきれいにしました');
      renderView();
      save();
    },
    handle() {
      const g = selected();
      if (!g) return;
      const now = Date.now();
      const wait = g.handledAt + 15 * MIN - now;
      if (wait > 0) { toast(`少し休ませてあげよう（あと${fmtLeft(wait)}）`); return; }
      g.handledAt = now;
      const wasTame = g.tame;
      g.tame = clamp(g.tame + 6);
      if (wasTame < 100 && g.tame >= 100) memo(g, 'なれ度が100に！手の上ですっかりくつろぐように', true);
      S.coins += 1;
      daily('handled');
      if (tank) { tank.happy(); tank.hearts(3); }
      toast(g.tame >= 60 ? `${g.name}は手の上でリラックスしている` : `${g.name}を手に乗せてみた`);
      renderView();
      save();
    },
    mist() {
      const g = selected();
      if (!g || !g.shedUntil) return;
      g.shedUntil = 0;
      g.tame = clamp(g.tame + 4);
      toast('脱皮完了！脱いだ皮はぱくっと食べちゃいました');
      memo(g, 'しっとりケアで脱皮が完了。皮はぱくっと食べた', true);
      renderView();
      save();
    },
    rename() {
      const g = selected();
      if (!g) return;
      openSheet(`<h3 class="sheet-title">なまえをかえる</h3>
        <form id="renameForm" data-id="${g.id}" class="rename">
          <label for="renameInput">なまえ（10文字まで）</label>
          <input id="renameInput" value="${esc(g.name)}" maxlength="10" autocomplete="off">
          <button class="act primary" type="submit">決定</button>
        </form>`);
    },
    pairMenu() {
      const g = selected();
      if (!g) return;
      const now = Date.now();
      const block = pairBlock(g, now);
      if (block) {
        openSheet(`<h3 class="sheet-title">ペアリング</h3><p>${esc(g.name)}：${block}</p><button class="act" data-action="closeSheet">とじる</button>`);
        return;
      }
      const opp = S.geckos.filter(x => x.sex !== g.sex);
      const ok = opp.filter(x => !pairBlock(x, now));
      const ng = opp.filter(x => pairBlock(x, now));
      const rows = ok.map(p => {
        const mom = g.sex === 'F' ? g : p, dad = g.sex === 'F' ? p : g;
        const fc = G.forecast(mom, dad);
        return `<div class="pair-card">
          <div class="pair-head">${A.swatch(p)}<b>${esc(p.name)}</b><span class="muted">${sexMark(p)} ${esc(nameOf(p))}</span></div>
          <div class="forecast">
            <div class="fc-label">生まれる子の予想</div>
            ${fc.morphs.slice(0, 6).map(m => `<div class="fc-row"><span>${esc(m.name)}</span><span class="fc-bar"><i style="--v:${(m.p * 100).toFixed(1)}%"></i></span><b>${pct(m.p)}</b></div>`).join('')}
            ${fc.morphs.length > 6 ? `<div class="muted small">ほか ${fc.morphs.length - 6} 種類</div>` : ''}
            ${fc.hets.length ? `<div class="muted small">${fc.hets.map(h => `het ${h.name} ${pct(h.p)}`).join(' ・ ')}</div>` : ''}
            <div class="fc-label">見た目の遺伝（両親の平均くらい。1匹ずつばらつく）</div>
            <div class="muted small">${[['タンジェリン度', fc.tang]].concat(G.POLY.map(t => [t.name, fc.poly[t.key]])).map(([n, v]) => `${n} ${v}`).join(' ・ ')}</div>
          </div>
          <button class="act primary" data-action="pair" data-id="${p.id}">${esc(p.name)}とペアリング</button>
        </div>`;
      }).join('');
      openSheet(`<h3 class="sheet-title">${esc(g.name)}のお相手をえらぶ</h3>
        ${rows || `<p class="notice">いまペアリングできる${g.sex === 'F' ? 'オス' : 'メス'}がいません。</p>`}
        ${ng.length ? `<div class="muted small">${ng.map(x => `${esc(x.name)}：${pairBlock(x, now)}`).join('<br>')}</div>` : ''}
        ${!opp.length ? `<p class="muted small">ショップで${g.sex === 'F' ? 'オス' : 'メス'}をおむかえするか、卵をかえしてみよう。</p>` : ''}`);
    },
    pair(t) {
      const g = selected();
      const p = S.geckos.find(x => x.id === t.dataset.id);
      const now = Date.now();
      if (!g || !p || pairBlock(g, now) || pairBlock(p, now)) return;
      const mom = g.sex === 'F' ? g : p, dad = g.sex === 'F' ? p : g;
      memo(mom, `${dad.name}とペアリングした`);
      memo(dad, `${mom.name}とペアリングした`);
      mom.gravid = { layAt: now + 10 * MIN, dad: { name: dad.name, genes: Object.assign({}, dad.genes), tang: dad.tang, poly: Object.assign({}, dad.poly), gen: dad.gen } };
      dad.restUntil = now + 20 * MIN;
      closeSheet();
      toast(`ペアリング成功！${mom.name}は約10分後に卵を産みます`);
      renderView();
      save();
    },
    rehomeMenu() {
      const g = selected();
      if (!g) return;
      if (S.geckos.length <= 1) { toast('さいごの1匹は手放せません'); return; }
      if (g.gravid) { toast('抱卵中は里親に出せません'); return; }
      const reward = Math.round(valueOf(g) * 0.8);
      openSheet(`<h3 class="sheet-title">${esc(g.name)}を里親に出す</h3>
        <p>やさしい飼い主さんのもとへ旅立ちます。お礼に <b>${reward} コイン</b> もらえます。図鑑の記録は残ります。</p>
        <div class="actions"><button class="act" data-action="closeSheet">やめる</button><button class="act primary" data-action="rehome">送り出す</button></div>`);
    },
    rehome() {
      const g = selected();
      if (!g || S.geckos.length <= 1 || g.gravid) return;
      const reward = Math.round(valueOf(g) * 0.8);
      memo(g, 'やさしい飼い主さんのもとへ旅立った。元気でね');
      S.geckos = S.geckos.filter(x => x !== g);
      S.coins += reward;
      S.stats.rehomed++;
      S.selected = S.geckos[0].id;
      closeSheet();
      sfx('coin');
      toast(`${g.name}は新しい家族のもとへ。元気でね！（+${reward}）`);
      renderView();
      save();
    },
    temp(t) { S.incTemp = Number(t.dataset.t); renderView(); save(); },
    hatch(t) { hatch(t.dataset.id); },
    buyFood(t) {
      const k = t.dataset.kind, F = FOODS[k];
      if (S.coins < F.price) { toast('コインが足りません'); return; }
      S.coins -= F.price;
      S.food[k] += F.pack;
      toast(`${F.name}を${F.pack}匹買いました`);
      renderView(); save();
    },
    buyCase() {
      const price = casePrice();
      if (S.cases >= CASE_MAX) return;
      if (S.coins < price) { toast('コインが足りません'); return; }
      S.coins -= price;
      S.cases++;
      toast('ケースを1つ増やしました');
      renderView(); save();
    },
    buyGecko(t) {
      const i = Number(t.dataset.i);
      const o = S.offers[i];
      if (!o) return;
      if (S.geckos.length >= S.cases) { toast('空いているケースがありません'); return; }
      if (S.coins < o.price) { toast('コインが足りません'); return; }
      S.coins -= o.price;
      S.offers.splice(i, 1);
      const g = newGecko({ name: unusedName(), sex: o.sex, genes: o.genes, tang: o.tang, poly: o.poly, growth: o.growth, hunger: 70 });
      g.seed = o.seed;
      S.geckos.push(g);
      const fresh = register(g);
      memo(g, 'ショップからおむかえした', true);
      S.selected = g.id;
      toast(`${g.name}をおむかえしました！${fresh.length ? '図鑑に新しく登録：' + fresh.join('・') : ''}`);
      switchView('case');
      save();
    },
    resetMenu() {
      openSheet(`<h3 class="sheet-title">はじめからあそぶ</h3>
        <p>今のレオパ・卵・図鑑・コインがすべて消えます。元には戻せません。</p>
        <div class="actions"><button class="act" data-action="closeSheet">やめる</button><button class="act danger" data-action="reset">消してはじめから</button></div>`);
    },
    reset() {
      if (tank) tank.takeFoods();
      tankGid = null;
      freshState();
      closeSheet();
      save();
      switchView('case');
      welcome();
    },
    welcomeDone() { S.welcomed = true; save(); closeSheet(); },
  };
  function casePrice() { return 60 + 40 * (S.cases - 4); }

  document.addEventListener('click', ev => {
    const t = ev.target.closest('[data-action]');
    if (!t || t.disabled) return;
    const fn = ACTIONS[t.dataset.action];
    if (fn) { ev.preventDefault(); fn(t, ev); }
  });
  document.addEventListener('submit', ev => {
    if (ev.target.id !== 'renameForm') return;
    ev.preventDefault();
    const g = S.geckos.find(x => x.id === ev.target.dataset.id);
    const v = $('#renameInput').value.trim().slice(0, 10);
    if (g && v) g.name = v;
    if (g && ev.target.dataset.goto) { S.selected = g.id; switchView('case'); }
    closeSheet();
    renderView();
    save();
    if (ev.target.dataset.next === 'starter') {
      if (S.geckos.length < 2) starterList();
      else ACTIONS.starterDone();
    }
  });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !$('#sheet').hidden) closeSheet(); });

  // ======================================================
  // 画面
  // ======================================================
  function switchView(v) {
    view = v;
    for (const s of document.querySelectorAll('.view')) s.hidden = s.id !== 'view-' + v;
    if (tank) tank.setActive(v === 'case');
    for (const b of document.querySelectorAll('.tabbar [data-view]')) {
      const on = b.dataset.view === v;
      b.classList.toggle('on', on);
      b.setAttribute('aria-current', on ? 'page' : 'false');
    }
    renderView();
    window.scrollTo(0, 0);
  }

  function renderView() {
    setHTML($('#soundBtn'), S.mute ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l4 6M21 9l-4 6"/></svg><span class="sr">音をオンにする</span>' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg><span class="sr">音をオフにする</span>');
    setHTML($('#coins'), `<span class="coin" aria-hidden="true"></span><b>${S.coins}</b><span class="sr">コイン</span>`);
    const ready = S.eggs.filter(e => Date.now() >= e.hatchAt).length;
    const badge = $('#eggBadge');
    badge.hidden = !ready;
    badge.textContent = ready;
    if (view === 'case') renderCase();
    else if (view === 'eggs') renderEggs();
    else if (view === 'dex') renderDex();
    else renderShop();
  }

  // 見た目の遺伝の表（compact は目立つ特徴だけをタグで）
  const openTraits = {};
  document.addEventListener('toggle', e => {
    const d = e.target;
    if (d.classList && d.classList.contains('traits')) openTraits[d.id.slice(7)] = d.open;
  }, true);
  function traitRows(x) {
    const p = x.poly || {};
    return [{ name: 'タンジェリン度', v: x.tang, lo: '黄色', hi: 'オレンジ' }]
      .concat(G.POLY.map(t => ({ name: t.name, v: p[t.key] === undefined ? 50 : p[t.key], lo: t.lo, hi: t.hi, quietLow: ['carrot', 'lav', 'aberrant'].includes(t.key) })));
  }
  function traitTable(x, compact) {
    const rows = traitRows(x);
    if (compact) {
      const notes = rows.filter(r => r.v >= 75 || (r.v <= 25 && !r.quietLow)).map(r => `${r.name}：${r.v >= 75 ? r.hi : r.lo}`);
      return notes.length ? `<div class="tags">${notes.map(n => `<span class="tag">${esc(n)}</span>`).join('')}</div>` : '';
    }
    return `<div class="trait-grid">${rows.map(r => `<div class="trait">
      <span class="trait-name">${r.name}</span>
      <span class="trait-scale"><span class="meter"><i style="--v:${r.v}%;--c:var(--accent)"></i></span><small><span>${r.lo}</span><span>${r.hi}</span></small></span>
      <b>${r.v}</b></div>`).join('')}</div>
      <p class="muted small">子どもは両親の平均くらいになり、1匹ずつばらつきます。</p>`;
  }

  function bar(label, v, color, side) {
    return `<div class="bar"><span>${label}</span><span class="meter"><i style="--v:${clamp(v).toFixed(1)}%;--c:${color}"></i></span><b>${side === undefined ? Math.round(v) : side}</b></div>`;
  }

  function renderCase() {
    const now = Date.now();
    const g = selected();
    setHTML($('#geckoTabs'), S.geckos.map(x => `<button class="chip${x.id === S.selected ? ' on' : ''}" data-action="select" data-id="${x.id}" aria-pressed="${x.id === S.selected}">${A.swatch(x)}<span>${esc(x.name)}</span><span class="sex ${x.sex}">${sexMark(x)}</span>${needsCare(x) ? '<i class="dot" aria-label="お世話が必要"></i>' : ''}</button>`).join('') +
      (S.geckos.length < S.cases ? `<span class="chip ghost">空きケース ${S.cases - S.geckos.length}</span>` : ''));
    sceneMount();
    if (!g) { setHTML($('#caseInfo'), ''); return; }
    const st = stageOf(g);
    const morph = nameOf(g);
    const hets = G.hets(g.genes);
    const status = statusOf(g, now);
    const next = st === 'baby' ? GROWTH.young : st === 'young' ? GROWTH.adult : GROWTH.max;
    const growSide = g.growth >= GROWTH.max ? 'MAX' : Math.floor(g.growth);
    const block = pairBlock(g, now);
    setHTML($('#caseInfo'), `
      ${editing ? editPanel(g) : `<div class="actions">
        <button class="act primary" data-action="feedMenu">ごはん</button>
        <button class="act" data-action="clean">おそうじ</button>
        <button class="act" data-action="handle">ふれあう</button>
      </div>
      ${g.shedUntil ? '<button class="act wide mist" data-action="mist">しっとりケアで脱皮を手伝う</button>' : ''}
      ${dailyCard()}
      <div class="card gecko-card">
        <div class="gc-head">
          <div class="gc-title">
            <button class="gname" data-action="rename" aria-label="名前をかえる">${esc(g.name)} <span class="sex ${g.sex}">${sexMark(g)}</span></button>
            <div class="morph">${esc(morph)}</div>
          </div>
          <span class="pill ${status.cls}">${status.text}</span>
        </div>
        <div class="tags">
          <span class="tag">${STAGE_LABEL[st]}</span>
          <span class="tag">第${g.gen}世代</span>
          ${hets.map(h => `<span class="tag het">het ${h}</span>`).join('')}
        </div>
        <details class="traits" id="traits-${g.id}"${openTraits[g.id] ? ' open' : ''}>
          <summary>この子の見た目の遺伝</summary>
          ${traitTable(g)}
        </details>
        <div class="bars">
          ${bar('おなか', g.hunger, g.hunger < 25 ? 'var(--warn)' : 'var(--accent)')}
          ${bar('きれい', g.clean, g.clean < 35 ? 'var(--warn)' : 'var(--info)')}
          ${bar('なれ度', g.tame, 'var(--female)')}
          ${bar('せいちょう', g.growth / GROWTH.max * 100, 'var(--good)', growSide)}
        </div>
        <p class="muted small">${st === 'adult' ? (g.growth >= GROWTH.max ? 'りっぱなおとなです' : 'おとなになりました。ペアリングできます') : `${STAGE_LABEL[st === 'baby' ? 'young' : 'adult']}まで あと ${Math.ceil(next - g.growth)}`}${g.hunger <= 30 ? ' ・ おなかが空いていると成長が止まります' : ''}</p>
      </div>

      <div class="actions sub">
        <button class="act ghost" data-action="pairMenu">ペアリング${block ? '' : ' OK'}</button>
        <button class="act ghost" data-action="album">アルバム</button>
        <button class="act ghost" data-action="editStart">もようがえ</button>
        <button class="act ghost" data-action="rehomeMenu">里親に出す</button>
      </div>
      <p class="tip"><b>まめちしき</b>${TIPS[tipIndex]}</p>`}`);
  }

  function renderEggs() {
    const now = Date.now();
    const temp = TEMPS.find(t => t.t === S.incTemp) || TEMPS[1];
    const gravids = S.geckos.filter(g => g.gravid);
    const full = S.eggs.length + 2 > EGG_CAP;
    const eggs = S.eggs.slice().sort((a, b) => a.hatchAt - b.hatchAt).map(e => {
      const ready = now >= e.hatchAt;
      const p = clamp((now - e.laidAt) / (e.hatchAt - e.laidAt) * 100);
      return `<div class="egg-card${ready ? ' ready' : ''}">
        <div class="egg-art">${A.egg()}</div>
        <div class="egg-meta">
          <b>${esc(e.mom)} × ${esc(e.dad)}</b>
          <small class="muted">${e.temp}℃ ・ 第${e.gen}世代</small>
          ${ready ? `<button class="act primary sm" data-action="hatch" data-id="${e.id}">ふ化させる</button>`
            : `<span class="meter"><i style="--v:${p.toFixed(1)}%;--c:var(--accent)"></i></span><small class="muted">あと${fmtLeft(e.hatchAt - now)}</small>`}
        </div></div>`;
    }).join('');
    setHTML($('#view-eggs'), `
      <h2 class="h2">インキュベーター <small class="muted">${S.eggs.length} / ${EGG_CAP}</small></h2>
      <div class="card">
        <div class="label" id="tempLabel">温度（次に産まれる卵から）</div>
        <div class="seg" role="radiogroup" aria-labelledby="tempLabel">${TEMPS.map(t => `<button role="radio" aria-checked="${t.t === S.incTemp}" class="${t.t === S.incTemp ? 'on' : ''}" data-action="temp" data-t="${t.t}"><b>${t.label}</b><small>${t.note}</small></button>`).join('')}</div>
        <p class="muted small">レオパは卵の温度で性別が決まります。${temp.label}だと約${temp.mins}分でふ化します。</p>
      </div>
      ${gravids.length ? `<div class="card soft">${gravids.map(g => `<div>♀ ${esc(g.name)} が抱卵中 ・ ${full ? 'インキュベーターが空くのを待っています' : `産卵まで あと${fmtLeft(g.gravid.layAt - now)}`}</div>`).join('')}</div>` : ''}
      ${eggs ? `<div class="egg-grid">${eggs}</div>` : `<div class="card empty"><div class="egg-art">${A.egg()}</div><p>まだ卵はありません。<br>アダルトのオスとメスを「ペアリング」してみよう。</p></div>`}
      ${S.eggs.some(e => now >= e.hatchAt) && S.geckos.length >= S.cases ? '<p class="notice">ケースがいっぱいです。ショップでケースを増やすか、里親に出してからふ化させよう。</p>' : ''}`);
  }

  let dexHTML = '';
  function renderDex() {
    const found = G.DEX.filter(d => S.dex[d.id]).length;
    const extra = Object.keys(S.names).filter(n => !G.DEX.some(d => d.name === n)).sort();
    const cards = G.DEX.map((d, i) => {
      const got = !!S.dex[d.id];
      const art = portrait({ genes: d.rep.genes, tang: d.rep.tang, poly: d.rep.poly, seed: 1000 + i * 7919 }, 'adult', got ? d.name : '');
      return `<div class="dex-card${got ? '' : ' locked'}"><div class="dex-art">${art}</div><b>${got ? esc(d.name) : '？？？'}</b><small class="muted">${esc(d.hint)}</small></div>`;
    }).join('');
    const html = `
      <h2 class="h2">モルフ図鑑 <small class="muted">${found} / ${G.DEX.length}</small></h2>
      ${albumList()}
      ${achSection()}
      <h3 class="h3">モルフ</h3>
      <div class="dex-grid">${cards}</div>
      ${extra.length ? `<h3 class="h3">これまでに出会ったモルフ名 <small class="muted">${extra.length}種</small></h3><div class="tags">${extra.map(n => `<span class="tag">${esc(n)}</span>`).join('')}</div>` : ''}
      <div class="card guide">
        <h3 class="h3">遺伝のきほん</h3>
        <p><b>劣性</b>（アルビノ・エクリプス・ブリザード）：両親から1つずつ、合わせて2つ受け継ぐと見た目に出ます。1つだけ持っている子は「het（ヘテロ）」と呼び、見た目は変わりませんが子どもに伝えられます。</p>
        <p><b>共優性</b>（マックスノー）：1つで見た目に出て、2つそろうと「スーパー」になります。</p>
        <p><b>見た目の遺伝</b>（タンジェリン度・斑点の量や大きさ・頭の斑点・しっぽのオレンジ・ラベンダー・模様の乱れ）：子は両親の平均くらいになり、1匹ずつばらつきます。同じモルフ名でも見た目は1匹ずつちがいます。望む特徴の強い子を選んで掛けあわせ続けると、ハイポやキャロットテールなどの血統が作れます。</p>
      </div>`;
    if (html !== dexHTML) { setHTML($('#view-dex'), html); dexHTML = html; }
  }

  function renderShop() {
    const now = Date.now();
    const offers = S.offers.map((o, i) => {
      const morph = nameOf(o);
      const hets = G.hets(o.genes);
      return `<div class="offer">
        <div class="offer-art">${portrait(o, stageOf(o), morph)}</div>
        <div class="offer-main">
          <b>${esc(morph)}</b>
          <small class="muted">${o.sex === 'M' ? '♂ オス' : '♀ メス'} ・ ${STAGE_LABEL[stageOf(o)]}</small>
          ${hets.length ? `<small class="het-line">${hets.map(h => 'het ' + h).join(' / ')}</small>` : ''}
          ${unseen(o) ? '<small class="new-line">図鑑にまだいない</small>' : ''}
          ${traitTable(o, true)}
          <button class="act primary sm" data-action="buyGecko" data-i="${i}" ${S.coins < o.price || S.geckos.length >= S.cases ? 'disabled' : ''}>${o.price} コインでおむかえ</button>
        </div></div>`;
    }).join('');
    setHTML($('#view-shop'), `
      <h2 class="h2">ショップ</h2>
      ${ordersSection(now)}
      <h3 class="h3">ごはん</h3>
      <div class="list">${Object.entries(FOODS).map(([k, F]) => `
        <button class="row" data-action="buyFood" data-kind="${k}" ${S.coins < F.price ? 'disabled' : ''}>
          <span class="row-art">${A.food(k)}</span>
          <span class="row-main"><b>${F.name} ${F.pack}匹</b><small>いま ${S.food[k]}匹 ・ ${F.desc}</small></span>
          <span class="row-side price">${F.price}</span>
        </button>`).join('')}</div>
      ${interiorShop()}
      <h3 class="h3">ケース <small class="muted">${S.geckos.length} / ${S.cases} 使用中</small></h3>
      <div class="list">
        <button class="row" data-action="buyCase" ${S.cases >= CASE_MAX || S.coins < casePrice() ? 'disabled' : ''}>
          <span class="row-main"><b>${S.cases >= CASE_MAX ? 'これ以上は増やせません' : 'ケースを1つ増やす'}</b><small>1匹ずつ別のケースで暮らします（最大${CASE_MAX}）</small></span>
          ${S.cases >= CASE_MAX ? '' : `<span class="row-side price">${casePrice()}</span>`}
        </button>
      </div>
      <h3 class="h3">おむかえ <small class="muted">次の入荷まで ${fmtLeft(S.offersAt - now)}</small></h3>
      ${offers ? `<div class="offers">${offers}</div>` : '<p class="muted">売り切れです。次の入荷をお待ちください。</p>'}
      <p class="muted small">コインは、お世話・ふ化・里親に出すことでもらえます。</p>
      <div class="danger-zone"><button class="act ghost sm" data-action="resetMenu">はじめからあそぶ</button></div>`);
  }

  function welcome() {
    openSheet(`<div class="welcome">
      <p class="eyebrow">ようこそ</p>
      <h3 class="logo-big">レオパといっしょ</h3>
      <p>レオパ（ヒョウモントカゲモドキ）との暮らしをはじめましょう。まずは近くの爬虫類ショップへ、いっしょに暮らす子をむかえに行きます。</p>
      <ul class="howto">
        <li><b>ごはん・おそうじ・ふれあう</b>で毎日お世話。アプリを閉じていても時間は流れます。</li>
        <li>アダルトになったら<b>ペアリング</b>。卵の温度で性別が変わります。</li>
        <li>いろいろなモルフを生み出して<b>図鑑</b>を埋めよう。</li>
        <li>この世界のレオパは病気にならず、ずっと元気です。お世話をわすれても、しょんぼりするだけ。</li>
      </ul>
      <button class="act primary" data-action="${S.geckos.length ? 'welcomeDone' : 'starterList'}">${S.geckos.length ? 'はじめる' : 'ショップへ行く'}</button></div>`);
  }
  // ---- はじめてのおむかえ（2匹までプレゼント）
  function starterList() {
    const picked = S.geckos.length;
    const want = picked === 1 ? (S.geckos[0].sex === 'M' ? 'F' : 'M') : null;
    openSheet(`<p class="eyebrow">爬虫類ショップ「ヤモリ堂」</p>
      <h3 class="sheet-title">${picked ? 'もう1匹、えらべます' : 'いっしょに暮らす子をえらぼう'}</h3>
      <p class="muted small">${picked ? `ペアリングには♂と♀が必要です。${want === 'F' ? 'メス' : 'オス'}をえらぶと、あとで赤ちゃんが見られます。` : 'はじめての2匹までは、お店からのプレゼントです。1匹ずつ顔も模様もちがいます。'}</p>
      <div class="offers">${S.starters.map((o, i) => `<div class="offer">
        <div class="offer-art">${portrait(o, 'young', nameOf(o))}</div>
        <div class="offer-main">
          <b>${esc(nameOf(o))}</b>
          <small class="muted">${o.sex === 'M' ? '♂ オス' : '♀ メス'} ・ ヤング</small>
          <small>${esc(o.note)}</small>
          ${traitTable(o, true)}
          <button class="act primary sm" data-action="starterPick" data-i="${i}">この子にする</button>
        </div></div>`).join('')}</div>
      ${picked ? '<button class="act wide" data-action="starterDone">1匹でだいじょうぶ</button>' : ''}`);
  }
  Object.assign(ACTIONS, {
    starterList,
    starterPick(t) {
      const o = S.starters[Number(t.dataset.i)];
      if (!o || S.geckos.length >= 2) return;
      S.starters.splice(Number(t.dataset.i), 1);
      const g = newGecko({ name: unusedName(), sex: o.sex, genes: o.genes, tang: o.tang, poly: o.poly, growth: o.growth, hunger: 65 });
      g.seed = o.seed;
      S.geckos.push(g);
      S.selected = g.id;
      register(g);
      memo(g, '爬虫類ショップ「ヤモリ堂」からおむかえした', true);
      save();
      renderView();
      openSheet(`<div class="reveal">
        <div class="reveal-art">${portrait(g, 'young', nameOf(g))}</div>
        <p class="eyebrow">おむかえしました</p>
        <h3 class="morph big">${esc(nameOf(g))}</h3>
        <p class="muted">${g.sex === 'M' ? '♂ オス' : '♀ メス'} ・ ${esc(o.note)}</p>
        <form id="renameForm" data-id="${g.id}" data-next="starter" class="rename">
          <label for="renameInput">この子の名前をつけてあげよう</label>
          <input id="renameInput" value="${esc(g.name)}" maxlength="10" autocomplete="off">
          <button class="act primary" type="submit">この名前にする</button>
        </form></div>`);
    },
    starterDone() {
      S.welcomed = true;
      S.starters = [];
      closeSheet();
      switchView('case');
      toast('ケースにおむかえしました。ごはんをあげてみよう');
      save();
    },
  });

  // ======================================================
  // 目標：今日のおせわ・ブリーダー依頼・実績
  // ======================================================
  const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  const DAILY = [
    { key: 'fed', label: 'ごはんをあげる', need: 3 },
    { key: 'cleaned', label: 'おそうじ（フンひろいも）', need: 1 },
    { key: 'handled', label: 'ふれあう', need: 2 },
  ];
  function dailyState() {
    if (!S.daily || S.daily.day !== todayKey()) {
      const streak = S.daily && S.daily.claimed && S.daily.day === yesterdayKey() ? (S.daily.streak || 0) : 0;
      S.daily = { day: todayKey(), fed: 0, cleaned: 0, handled: 0, claimed: false, streak };
    }
    return S.daily;
  }
  function yesterdayKey() { const d = new Date(Date.now() - 86400000); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }
  function daily(key) {
    const d = dailyState();
    const was = DAILY.every(t => d[t.key] >= t.need);
    d[key] = (d[key] || 0) + 1;
    if (!was && !d.claimed && DAILY.every(t => d[t.key] >= t.need)) toast('今日のおせわ達成！ごほうびを受け取れます');
  }
  function dailyReward(d) { return 20 + Math.min(6, d.streak) * 5; }
  function dailyCard() {
    const d = dailyState();
    const done = DAILY.every(t => d[t.key] >= t.need);
    return `<div class="card daily">
      <div class="daily-head"><b>今日のおせわ</b>${d.streak ? `<span class="pill good">${d.streak}日連続</span>` : ''}</div>
      <div class="daily-list">${DAILY.map(t => `<span class="daily-item${d[t.key] >= t.need ? ' done' : ''}">${t.label} <b>${Math.min(d[t.key], t.need)}/${t.need}</b></span>`).join('')}</div>
      ${d.claimed ? '<p class="muted small">今日のごほうびは受け取りずみ。また明日！</p>'
        : `<button class="act ${done ? 'primary' : ''} sm" data-action="claimDaily" ${done ? '' : 'disabled'}>ごほうび ${dailyReward(d)}コイン＋コオロギ5匹</button>`}
    </div>`;
  }

  // ---- ブリーダー依頼：条件に合う子をゆずると報酬がもらえる
  const ORDER_MORPHS = [
    ['ハイイエロー', 0.1], ['マックスノー', 0.2], ['トレンパーアルビノ', 0.35], ['マックスノー トレンパーアルビノ', 0.5],
    ['エクリプス', 0.45], ['スーパーマックスノー', 0.55], ['ハイポ', 0.55], ['キャロットテール', 0.5],
    ['タンジェリン', 0.6], ['ジャングル', 0.6], ['ラベンダー', 0.55], ['スーパーハイポ', 0.85], ['ストライプ', 0.85],
  ];
  const ORDER_TRAITS = [
    { key: 'tang', vals: [45, 55, 65, 75], label: v => `タンジェリン度${v}以上`, test: (g, v) => g.tang >= v, diff: v => (v - 35) / 45 },
    { key: 'spots', vals: [40, 30, 22, 14], label: v => `斑点の量${v}以下`, test: (g, v) => g.poly.spots <= v, diff: v => (50 - v) / 40 },
    { key: 'carrot', vals: [30, 45, 60], label: v => `しっぽのオレンジ${v}以上`, test: (g, v) => g.poly.carrot >= v, diff: v => v / 70 },
    { key: 'lav', vals: [45, 60, 75], label: v => `ラベンダー${v}以上`, test: (g, v) => g.poly.lav >= v, diff: v => v / 85 },
    { key: 'head', vals: [35, 20, 10], label: v => `頭の斑点${v}以下`, test: (g, v) => g.poly.head <= v, diff: v => (60 - v) / 55 },
  ];
  const BUYERS = ['はじめてレオパを飼う学生さん', '爬虫類ショップ「ヤモリ堂」', '地元のブリーダーさん', '繁殖を始めたい家族', '即売会に出るブリーダー', '動物ふれあい施設'];
  function makeOrder(now) {
    const o = { id: 'o' + (S.nextId++), buyer: pick(BUYERS), sex: Math.random() < 0.45 ? pick(['M', 'F']) : null, adult: Math.random() < 0.35, until: now + 18 * HOUR };
    let diff;
    if (Math.random() < 0.45) {
      const t = pick(ORDER_TRAITS), v = pick(t.vals);
      o.kind = 'trait'; o.key = t.key; o.val = v; o.what = t.label(v); diff = t.diff(v);
    } else {
      const [name, d] = pick(ORDER_MORPHS);
      o.kind = 'morph'; o.id2 = G.DEX.find(x => x.name === name).id; o.what = name; diff = d;
    }
    o.reward = Math.round((50 + diff * 220) * (o.sex ? 1.15 : 1) * (o.adult ? 1.5 : 1) / 5) * 5;
    return o;
  }
  function orderText(o) {
    return `${o.what}${o.sex ? `の${o.sex === 'M' ? 'オス' : 'メス'}` : ''}${o.adult ? '（アダルト）' : ''}`;
  }
  function fits(o, g) {
    if (o.sex && g.sex !== o.sex) return false;
    if (o.adult && stageOf(g) !== 'adult') return false;
    if (g.gravid) return false;
    if (o.kind === 'morph') return G.dexMatches(g.genes, g.tang, g.poly).includes(o.id2);
    return ORDER_TRAITS.find(t => t.key === o.key).test(g, o.val);
  }
  function refreshOrders(now) {
    S.orders = (S.orders || []).filter(o => o.until > now);
    while (S.orders.length < 3) S.orders.push(makeOrder(now));
  }
  function ordersSection(now) {
    return `<h3 class="h3">ブリーダーからの依頼 <small class="muted">条件に合う子をゆずると報酬</small></h3>
      <div class="orders">${S.orders.map((o, i) => {
        const n = S.geckos.filter(g => fits(o, g)).length;
        return `<div class="order">
          <div class="order-main"><small class="muted">${esc(o.buyer)}</small><b>${esc(orderText(o))}</b>
          <small class="muted">あと${fmtLeft(o.until - now)} ・ ${n ? `条件に合う子 ${n}匹` : 'いま条件に合う子はいません'}</small></div>
          <button class="act ${n ? 'primary' : ''} sm" data-action="orderMenu" data-i="${i}" ${n ? '' : 'disabled'}>${o.reward} コイン</button>
        </div>`;
      }).join('')}</div>`;
  }

  // ---- 実績
  const ACH = [
    { id: 'h1', label: 'はじめてのふ化', reward: 30, test: () => S.stats.hatched >= 1 },
    { id: 'h10', label: '10匹ふ化させる', reward: 120, test: () => S.stats.hatched >= 10 },
    { id: 'h30', label: '30匹ふ化させる', reward: 350, test: () => S.stats.hatched >= 30 },
    { id: 'd5', label: '図鑑を5種類うめる', reward: 60, test: () => dexCount() >= 5 },
    { id: 'd10', label: '図鑑を10種類うめる', reward: 180, test: () => dexCount() >= 10 },
    { id: 'd16', label: '図鑑を16種類うめる', reward: 400, test: () => dexCount() >= 16 },
    { id: 'dall', label: '図鑑をすべてうめる', reward: 1500, test: () => dexCount() >= G.DEX.length },
    { id: 'o1', label: 'はじめての依頼達成', reward: 40, test: () => (S.stats.orders || 0) >= 1 },
    { id: 'o10', label: '依頼を10回達成', reward: 250, test: () => (S.stats.orders || 0) >= 10 },
    { id: 'tame', label: 'なれ度100の子を育てる', reward: 60, test: () => S.geckos.some(g => g.tame >= 100) },
    { id: 'gen5', label: '第5世代の子が生まれる', reward: 200, test: () => S.geckos.some(g => g.gen >= 5) },
    { id: 'shtctb', label: 'SHTCTB を生み出す', reward: 800, test: () => !!S.dex.SHTCTB },
    { id: 'streak7', label: '7日連続で今日のおせわ', reward: 200, test: () => (S.daily && S.daily.streak >= 7) },
  ];
  const dexCount = () => G.DEX.filter(d => S.dex[d.id]).length;
  function claimableAch() { S.ach = S.ach || {}; return ACH.filter(a => !S.ach[a.id] && a.test()); }
  function checkAch() {
    S.achSeen = S.achSeen || {};
    for (const a of claimableAch()) if (!S.achSeen[a.id]) { S.achSeen[a.id] = true; toast(`実績「${a.label}」達成！図鑑で受け取れます`); }
  }
  function achSection() {
    S.ach = S.ach || {};
    const got = ACH.filter(a => S.ach[a.id]).length;
    return `<h3 class="h3">実績 <small class="muted">${got} / ${ACH.length}</small></h3>
      <div class="ach-list">${ACH.map(a => {
        const done = !!S.ach[a.id], ok = !done && a.test();
        return `<div class="ach${done ? ' done' : ''}"><span>${esc(a.label)}</span>${done ? '<small class="muted">受け取りずみ</small>'
          : `<button class="act ${ok ? 'primary' : ''} sm" data-action="claimAch" data-id="${a.id}" ${ok ? '' : 'disabled'}>${a.reward}</button>`}</div>`;
      }).join('')}</div>`;
  }
  Object.assign(ACTIONS, {
    claimDaily() {
      const d = dailyState();
      if (d.claimed || !DAILY.every(t => d[t.key] >= t.need)) return;
      const r = dailyReward(d);
      d.claimed = true;
      d.streak = (d.streak || 0) + 1;
      S.coins += r;
      S.food.cricket += 5;
      sfx('coin');
      toast(`ごほうび ${r}コインとコオロギ5匹を受け取りました`);
      checkAch(); renderView(); save();
    },
    orderMenu(t) {
      const o = S.orders[Number(t.dataset.i)];
      if (!o) return;
      const list = S.geckos.filter(g => fits(o, g));
      openSheet(`<h3 class="sheet-title">${esc(o.buyer)}の依頼</h3>
        <p>${esc(orderText(o))}をさがしています。ゆずると <b>${o.reward} コイン</b>。</p>
        <div class="list">${list.map(g => `<button class="row" data-action="deliver" data-i="${t.dataset.i}" data-id="${g.id}" ${S.geckos.length <= 1 ? 'disabled' : ''}>
          <span class="row-art">${A.swatch(g)}</span>
          <span class="row-main"><b>${esc(g.name)} ${sexMark(g)}</b><small>${esc(nameOf(g))} ・ ${STAGE_LABEL[stageOf(g)]}</small></span>
          <span class="row-side">ゆずる</span></button>`).join('')}</div>
        ${S.geckos.length <= 1 ? '<p class="muted small">さいごの1匹はゆずれません。</p>' : ''}`);
    },
    deliver(t) {
      const i = Number(t.dataset.i), o = S.orders[i];
      const g = S.geckos.find(x => x.id === t.dataset.id);
      if (!o || !g || !fits(o, g) || S.geckos.length <= 1) return;
      memo(g, `${o.buyer}のもとへ旅立った`);
      S.geckos = S.geckos.filter(x => x !== g);
      if (S.selected === g.id) S.selected = S.geckos[0].id;
      S.coins += o.reward;
      S.stats.orders = (S.stats.orders || 0) + 1;
      S.orders.splice(i, 1, makeOrder(Date.now()));
      closeSheet();
      sfx('coin');
      toast(`${g.name}は${o.buyer}のもとへ。報酬 ${o.reward}コイン！`);
      checkAch(); renderView(); save();
    },
    claimAch(t) {
      const a = ACH.find(x => x.id === t.dataset.id);
      S.ach = S.ach || {};
      if (!a || S.ach[a.id] || !a.test()) return;
      S.ach[a.id] = true;
      S.coins += a.reward;
      sfx('coin');
      toast(`実績「${a.label}」の報酬 ${a.reward}コイン`);
      dexHTML = '';
      renderView(); save();
    },
  });

  // ======================================================
  // インテリア：ショップで買って、ケースごとにもようがえ
  // ======================================================
  const MAX_DECOR = 7;
  let editing = null; // { sel: 家具の番号 | null, place: 置く家具の種類 | null }
  const decorOf = g => { if (!g.decor) g.decor = L3.DEFAULT_DECOR.map(d => Object.assign({}, d)); return g.decor; };
  function setEditing(e) {
    editing = e;
    if (tank) tank.setEdit(e ? { sel: e.sel } : null);
    renderView();
  }
  function decorOk(g, x, z, t, skip) {
    const r = L3.DECOR[t].r;
    const TK = L3.TANK;
    if (Math.abs(x) > TK.hw - r - 0.1 || z < -TK.hd + r + 0.1 || z > TK.hd - r - 0.1) return 'ケースのはしに寄りすぎです';
    if (Math.hypot(x - 5.4, z + 3.8) < r + 0.7) return 'そこはトイレの場所です';
    for (let i = 0; i < decorOf(g).length; i++) {
      if (i === skip) continue;
      const d = decorOf(g)[i];
      if (Math.hypot(x - d.x, z - d.z) < r + L3.DECOR[d.t].r - 0.25) return 'ほかの家具と重なっています';
    }
    return '';
  }
  function floorTap(x, z) {
    const g = selected();
    if (!g || !editing) return;
    const list = decorOf(g);
    if (editing.place) {
      if (list.length >= MAX_DECOR) { toast(`1つのケースに置けるのは${MAX_DECOR}個までです`); return; }
      const err = decorOk(g, x, z, editing.place);
      if (err) { toast(err); return; }
      list.push({ t: editing.place, x: +x.toFixed(2), z: +z.toFixed(2), rot: 0 });
      S.decorInv[editing.place]--;
      sfx('tap');
      toast(`${L3.DECOR[editing.place].name}を置きました`);
      setEditing({ sel: list.length - 1, place: null });
    } else if (editing.sel != null) {
      const d = list[editing.sel];
      const err = decorOk(g, x, z, d.t, editing.sel);
      if (err) { toast(err); return; }
      d.x = +x.toFixed(2); d.z = +z.toFixed(2);
      setEditing({ sel: editing.sel, place: null });
    }
    save();
  }
  function decorTap(i) { if (editing) setEditing({ sel: i, place: null }); }
  function editPanel(g) {
    const list = decorOf(g);
    const inv = Object.entries(S.decorInv).filter(([, n]) => n > 0);
    const sel = editing.sel != null ? list[editing.sel] : null;
    const hint = editing.place ? `${L3.DECOR[editing.place].name}を置く場所を、ケースの床でタップしてね`
      : sel ? `${L3.DECOR[sel.t].name}を選択中。床をタップすると動かせます`
      : 'ケースの家具をタップして選ぶか、下から置く家具をえらんでね';
    return `<div class="card edit-panel">
      <div class="gc-head"><b>もようがえ中</b><small class="muted">${list.length} / ${MAX_DECOR} 個</small></div>
      <p class="muted small">${hint}</p>
      ${sel ? `<div class="actions"><button class="act sm" data-action="rotateDecor">向きを変える</button><button class="act sm" data-action="storeDecor">しまう</button></div>` : ''}
      <div class="label">持っている家具</div>
      ${inv.length ? `<div class="decor-inv">${inv.map(([t, n]) => `<button class="chip${editing.place === t ? ' on' : ''}" data-action="pickDecor" data-t="${t}">${L3.DECOR[t].name} ×${n}</button>`).join('')}</div>`
        : '<p class="muted small">しまった家具や、ショップで買った家具がここに並びます。</p>'}
      <button class="act primary wide" data-action="editDone">もようがえをおわる</button>
    </div>`;
  }
  function interiorShop() {
    return `<h3 class="h3">インテリア <small class="muted">買った家具は「もようがえ」で置けます</small></h3>
      <div class="list">${Object.entries(L3.DECOR).map(([t, d]) => `
        <button class="row" data-action="buyDecor" data-t="${t}" ${S.coins < d.price ? 'disabled' : ''}>
          <span class="row-main"><b>${d.name}</b><small>${d.desc}${S.decorInv[t] ? ` ・ 手持ち ${S.decorInv[t]}` : ''}</small></span>
          <span class="row-side price">${d.price}</span>
        </button>`).join('')}</div>`;
  }
  Object.assign(ACTIONS, {
    editStart() { if (selected()) setEditing({ sel: null, place: null }); },
    editDone() { setEditing(null); save(); },
    pickDecor(t) { setEditing({ sel: null, place: editing && editing.place === t.dataset.t ? null : t.dataset.t }); },
    rotateDecor() {
      const g = selected(); const d = g && editing && decorOf(g)[editing.sel];
      if (!d) return;
      d.rot = ((d.rot || 0) + Math.PI / 2) % (Math.PI * 2);
      renderView(); save();
    },
    storeDecor() {
      const g = selected(); if (!g || !editing || editing.sel == null) return;
      const [d] = decorOf(g).splice(editing.sel, 1);
      S.decorInv[d.t] = (S.decorInv[d.t] || 0) + 1;
      toast(`${L3.DECOR[d.t].name}をしまいました`);
      setEditing({ sel: null, place: null }); save();
    },
    buyDecor(t) {
      const d = L3.DECOR[t.dataset.t];
      if (!d || S.coins < d.price) { toast('コインが足りません'); return; }
      S.coins -= d.price;
      S.decorInv[t.dataset.t] = (S.decorInv[t.dataset.t] || 0) + 1;
      sfx('buy');
      toast(`${d.name}を買いました。ケースの「もようがえ」で置けます`);
      renderView(); save();
    },
  });

  // ======================================================
  // 成長記録アルバム
  // 節目（おむかえ・成長・脱皮・産卵など）は、そのときの見た目を覚えておいて写真を撮り直す。
  // 「写真をとる」ではケースの今の様子を JPEG で残す（1匹あたり最大 12 枚）。
  // ======================================================
  const MAX_PHOTOS = 12;
  function albumOf(g) {
    S.albums = S.albums || {};
    const a = S.albums[g.id] || (S.albums[g.id] = { name: g.name, sex: g.sex, entries: [] });
    a.name = g.name; a.sex = g.sex; a.morph = nameOf(g);
    return a;
  }
  function memo(g, text, withLook) {
    const e = { t: Date.now(), text };
    if (withLook) e.look = { genes: Object.assign({}, g.genes), tang: g.tang, poly: Object.assign({}, g.poly), seed: g.seed, stage: stageOf(g) };
    albumOf(g).entries.push(e);
  }
  const fmtDate = t => { const d = new Date(t); return `${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const ageText = g => { const d = Math.floor((Date.now() - g.born) / 86400000); return d < 1 ? 'きょう' : `${d}日目`; };
  function openAlbum(id) {
    const a = S.albums && S.albums[id];
    if (!a) return;
    const g = S.geckos.find(x => x.id === id);
    const photos = a.entries.filter(e => e.img).length;
    openSheet(`<p class="eyebrow">成長記録アルバム</p>
      <h3 class="sheet-title">${esc(a.name)} <span class="sex ${a.sex}">${a.sex === 'M' ? '♂' : '♀'}</span></h3>
      <p class="muted small">${esc(a.morph || '')}${g ? ` ・ いっしょに暮らして ${ageText(g)}` : ' ・ 旅立ちました'}</p>
      ${g ? `<button class="act primary" data-action="snapPhoto" data-id="${id}" ${photos >= MAX_PHOTOS ? 'disabled' : ''}>いまの様子を写真にとる（${photos}/${MAX_PHOTOS}）</button>` : ''}
      <ol class="album">${a.entries.slice().reverse().map((e, i) => {
        const idx = a.entries.length - 1 - i;
        const pic = e.img ? `<img src="${e.img}" alt="">` : e.look ? portrait(e.look, e.look.stage, '') : '';
        return `<li class="album-item${e.img ? ' photo' : ''}">
          ${pic ? `<div class="album-pic">${pic}</div>` : ''}
          <div class="album-text"><small class="muted">${fmtDate(e.t)}</small><span>${esc(e.text)}</span>
          ${e.img ? `<button class="link-btn" data-action="delPhoto" data-id="${id}" data-i="${idx}">この写真を消す</button>` : ''}</div>
        </li>`;
      }).join('')}</ol>`);
  }
  function albumList() {
    const all = Object.entries(S.albums || {});
    if (!all.length) return '';
    return `<h3 class="h3">思い出アルバム <small class="muted">${all.length}匹</small></h3>
      <div class="decor-inv">${all.map(([id, a]) => `<button class="chip" data-action="album" data-id="${id}">${esc(a.name)} <span class="sex ${a.sex}">${a.sex === 'M' ? '♂' : '♀'}</span>${S.geckos.some(g => g.id === id) ? '' : ' <small class="muted">旅立ち</small>'}</button>`).join('')}</div>`;
  }
  Object.assign(ACTIONS, {
    album(t) { openAlbum(t.dataset.id || S.selected); },
    snapPhoto(t) {
      const g = S.geckos.find(x => x.id === t.dataset.id);
      if (!g || !tank) return;
      const a = albumOf(g);
      if (a.entries.filter(e => e.img).length >= MAX_PHOTOS) return;
      closeSheet();
      if (view !== 'case' || S.selected !== g.id) { S.selected = g.id; switchView('case'); }
      // シートが閉じて画面が落ちついてから撮る
      setTimeout(() => {
        let img;
        try { img = tank.snapshot(); } catch (e) { toast('写真をとれませんでした'); return; }
        a.entries.push({ t: Date.now(), text: `${stageOf(g) === 'baby' ? 'ベビー' : stageOf(g) === 'young' ? 'ヤング' : 'アダルト'}のころの一枚`, img });
        sfx('tap');
        try { save(); } catch (e) { /* 保存がいっぱいでも遊べる */ }
        toast('アルバムに写真を追加しました');
        openAlbum(g.id);
      }, 450);
    },
    delPhoto(t) {
      const a = S.albums && S.albums[t.dataset.id];
      const i = Number(t.dataset.i);
      if (!a || !a.entries[i] || !a.entries[i].img) return;
      a.entries.splice(i, 1);
      save();
      openAlbum(t.dataset.id);
    },
  });

  // ---------- 効果音（その場で合成するので音声ファイルはいらない）
  let actx = null;
  function sfx(kind) {
    if (S && S.mute) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
    } catch (e) { return; }
    const t = actx.currentTime;
    const tone = (f, d, type, vol, at, slide) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(f, t + (at || 0));
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + (at || 0) + d);
      g.gain.setValueAtTime(0.0001, t + (at || 0));
      g.gain.exponentialRampToValueAtTime(vol || 0.15, t + (at || 0) + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (at || 0) + d);
      o.connect(g).connect(actx.destination);
      o.start(t + (at || 0));
      o.stop(t + (at || 0) + d + 0.03);
    };
    const noise = (d, vol, at, freq) => {
      const buf = actx.createBuffer(1, Math.floor(actx.sampleRate * d), actx.sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length);
      const src = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
      src.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq || 2600; g.gain.value = vol;
      src.connect(f).connect(g).connect(actx.destination);
      src.start(t + (at || 0));
    };
    ({
      tap: () => tone(880, 0.08, 'triangle', 0.1, 0, 1320),
      eat: () => { noise(0.06, 0.5, 0, 2200); noise(0.05, 0.4, 0.09, 2800); noise(0.05, 0.3, 0.19, 2400); },
      coin: () => { tone(1320, 0.09, 'square', 0.05); tone(1760, 0.2, 'square', 0.05, 0.08); },
      buy: () => { tone(660, 0.1, 'triangle', 0.1); tone(990, 0.16, 'triangle', 0.1, 0.08); },
      crack: () => noise(0.09, 0.7, 0, 1600),
      hatch: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.28, 'triangle', 0.12, i * 0.1)),
      lay: () => tone(420, 0.25, 'sine', 0.12, 0, 640),
    })[kind]?.();
  }
  Object.assign(ACTIONS, {
    toggleSound() { S.mute = !S.mute; if (!S.mute) sfx('tap'); renderView(); save(); },
  });

  // ---------- 起動
  function tick() {
    const now = Date.now();
    simulate(now);
    refreshOffers(now);
    refreshOrders(now);
    checkAch();
    renderView();
    save();
  }

  S = load();
  if (!S) freshState();
  initTank();
  // 3D モデルが読みこめたら、レオパを差しかえる
  if (L3.supported && L3.loadModel) L3.loadModel('assets/gecko.glb').then(ok => { if (ok) { dexHTML = ''; renderView(); } });
  tick();
  switchView('case');
  setInterval(tick, 5000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); else tick(); });
  if (!S.welcomed) { if (!S.geckos.length && !(S.starters && S.starters.length)) S.starters = makeStarters(); if (S.geckos.length && S.starters && S.starters.length) starterList(); else welcome(); }

  if ('serviceWorker' in navigator && /^(https:|http:\/\/localhost)/.test(location.href)) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* プレビュー環境などでは使えない */ });
  }
})();
