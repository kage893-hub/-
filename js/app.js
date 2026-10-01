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
  // 1倍速＝実際のレオパの成長（ベビーからアダルトまで約9か月）。速さはゲーム中に選べる
  const GROWTH = { perHour: 0.0216, young: 50, adult: 140, max: 260, shedEvery: 12 };
  const DAYMS = 24 * HOUR;
  const SPEEDS = [
    { x: 1, name: '1倍速', note: '実際のレオパの成長速度', cost: 0 },
    { x: 3, name: '3倍速', note: 'おすすめの速度', cost: 0 },
    { x: 12, name: '12倍速', note: 'ブリーダーモード', cost: 300 },
  ];
  const speedX = () => (S && S.speed) || 3;
  // 実際の日数をゲーム内の時間に直す（抱卵・ふ化・おやすみも成長と同じ速さで進む）
  const realDays = d => d * DAYMS / speedX();
  const EGG_CAP = 12, CASE_MAX = 12;

  const FOODS = {
    cricket: { name: 'コオロギ', hunger: 15, growth: 3, price: 5, pack: 10, desc: '定番のごはん。ぴょんぴょん跳ねる' },
    dubia: { name: 'デュビア', hunger: 25, growth: 5, price: 8, pack: 5, desc: '栄養たっぷり。動きがゆっくりで食べやすい' },
    worm: { name: 'ミルワーム', hunger: 18, growth: 8, price: 4, pack: 5, desc: 'みんな大好き。脂肪が多いのでおやつに' },
  };
  // 卵の温度で性別と日数が変わる（温度依存性決定）
  const TEMPS = [
    { t: 27, label: '27℃', note: 'メスが多い', days: 75, pMale: 0.1 },
    { t: 29.5, label: '29.5℃', note: 'オスメス半々', days: 58, pMale: 0.5 },
    { t: 32, label: '32℃', note: 'オスが多い', days: 40, pMale: 0.9 },
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
    if (m >= 1440) { const d = Math.floor(m / 1440), h = Math.round((m % 1440) / 60); return `${d}日${h ? h + '時間' : ''}`; }
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
    // 自動の記録についていた見本写真は使わなくなったので消す
    if (s.albums) for (const k in s.albums) for (const e of s.albums[k].entries || []) delete e.look;
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
    movePhotosOut(s);
    if (!s.tut) s.tut = { step: 99 }; // 前から遊んでいる人にはガイドを出さない
    s.decorInv = s.decorInv || {};
    return s;
  }
  // 保存は操作が落ちついてからまとめて1回（アプリを閉じるときはすぐ保存）
  let saveTimer = null;
  // 控えから戻すときや、ほかの画面（別のタブ・ホーム画面のアプリ）が新しく保存したときは、
  // この画面の古いデータで上書きしないように保存を止める
  let saveLocked = false, saveFailShown = false;
  const STAMP_KEY = 'leopa-save-stamp';
  const INSTANCE = Math.random().toString(36).slice(2);
  const readStamp = () => { try { return JSON.parse(localStorage.getItem(STAMP_KEY) || 'null'); } catch (e) { return null; } };
  let lastStamp = (readStamp() || { at: 0 }).at;
  function otherSavedNewer() {
    const st = readStamp();
    return !!(st && st.id !== INSTANCE && st.at > lastStamp);
  }
  function reloadForNewer() {
    saveLocked = true;
    if (document.hidden) return;
    toast('ほかの画面で進めたデータがあるので、読みこみなおします');
    setTimeout(() => location.reload(), 1200);
  }
  function saveNow() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    if (saveLocked || !S) return;
    if (otherSavedNewer()) { reloadForNewer(); return; }
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(S));
      lastStamp = Date.now();
      localStorage.setItem(STAMP_KEY, JSON.stringify({ id: INSTANCE, at: lastStamp }));
      saveFailShown = false;
    } catch (e) {
      // 容量いっぱいなど。だまって失敗すると進みが消えてしまうので、一度だけ知らせる
      if (!saveFailShown) { saveFailShown = true; toast('セーブできませんでした。アルバムの写真を減らすか、「セーブデータの控え」をとってください'); }
    }
  }
  window.__leopaSave = () => ({ INSTANCE, lastStamp, stamp: readStamp(), saveLocked }); // 動作確認用
  window.addEventListener('storage', e => { if (e.key === STAMP_KEY && otherSavedNewer()) reloadForNewer(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && saveLocked && otherSavedNewer()) location.reload(); });
  function save() { if (!saveTimer) saveTimer = setTimeout(saveNow, 1500); }
  window.addEventListener('pagehide', () => saveNow());
  // アルバムの写真は、ふだんのデータとは別に1枚ずつしまう（保存を軽くするため）
  const PHOTO_KEY = id => 'leopa-photo-' + id;
  function putPhoto(dataUrl) {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    localStorage.setItem(PHOTO_KEY(id), dataUrl);
    return id;
  }
  function getPhoto(e) { if (e.img) return e.img; try { return e.pid ? localStorage.getItem(PHOTO_KEY(e.pid)) : null; } catch (err) { return null; } }
  function dropPhoto(e) { try { if (e.pid) localStorage.removeItem(PHOTO_KEY(e.pid)); } catch (err) { /* noop */ } }
  // 前の版でデータの中に入れていた写真を、別の場所へ移す
  function movePhotosOut(s) {
    for (const a of Object.values(s.albums || {})) for (const e of a.entries) {
      if (!e.img) continue;
      try { e.pid = putPhoto(e.img); delete e.img; } catch (err) { break; }
    }
  }

  function newGecko(o) {
    return {
      id: 'g' + (S.nextId++), name: o.name, sex: o.sex,
      genes: G.normGenes(o.genes || {}), tang: o.tang === undefined ? 20 : o.tang, poly: G.normPoly(o.poly),
      growth: o.growth || 0, hunger: o.hunger === undefined ? 70 : o.hunger, clean: 100, tame: o.tame || 10,
      poop: 0, poopAt: 0, shedUntil: 0, gravid: null, restUntil: 0, handledAt: 0,
      seed: Math.floor(Math.random() * 1e9), gen: o.gen || 1, born: Date.now(), adopted: Date.now(), growth0: o.growth || 0,
      hatched: !!o.hatched, birthday: o.hatched ? Date.now() : Date.now() - estAgeDays(o.growth || 0) * 86400000, birthEst: !o.hatched,
    };
  }
  function freshState() {
    S = {
      v: 2, coins: 60, cases: 4, incTemp: 29.5, food: { cricket: 20, dubia: 3, worm: 3 },
      tut: { step: 0 }, geckos: [], eggs: [], dex: {}, names: {}, decorInv: { grass: 1 }, decorV3: true, selected: null, offers: [], offersAt: 0,
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
  // 家系図用：親の情報を写しておく（里親に出したあとでもたどれるように）。祖父母までで止める
  function snap(g, depth) {
    if (!g) return null;
    return {
      name: g.name, sex: g.sex, genes: Object.assign({}, g.genes), tang: g.tang, poly: Object.assign({}, g.poly), seed: g.seed, gen: g.gen,
      parents: depth > 0 && g.parents ? { mom: trimSnap(g.parents.mom, depth - 1), dad: trimSnap(g.parents.dad, depth - 1) } : null,
    };
  }
  function trimSnap(x, depth) {
    if (!x) return null;
    return Object.assign({}, x, { parents: depth > 0 && x.parents ? { mom: trimSnap(x.parents.mom, depth - 1), dad: trimSnap(x.parents.dad, depth - 1) } : null });
  }
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
    if (!S.speed) S.speed = 3;
    const dtH = (now - S.lastTick) / HOUR;
    if (dtH > 0) {
      for (const g of S.geckos) {
        const fedH = Math.max(0, Math.min(dtH, (g.hunger - 30) / RATE.hunger));
        g.hunger = clamp(g.hunger - RATE.hunger * dtH);
        g.clean = clamp(g.clean - RATE.clean * dtH);
        // おなかが空いている時間が長いと、しっぽの栄養を使う
        const hungryH = Math.max(0, dtH - fedH);
        g.cond = clamp((g.cond == null ? 55 : g.cond) - hungryH * 0.6 * speedX() + (fedH > 0 && g.cond < 50 ? fedH * 0.1 * speedX() : 0));
        if (fedH > 0) grow(g, fedH * GROWTH.perHour * speedX() * heatInfo(heatOf(g)).growth, now);
      }
      S.lastTick = now;
      for (const g of S.geckos) {
        recordWeight(g, now); checkMilestones(g);
        if (!g.weekAt) g.weekAt = now;
        else if (now - g.weekAt >= 7 * DAYMS) { g.weekAt = now; memo(g, `1週間の記録：体重 ${weightOf(g)}g ・ ${STAGE_LABEL[stageOf(g)]}`, true); }
      }
    }
    for (const g of S.geckos) {
      if (g.poopAt && now >= g.poopAt) { g.poop = Math.min(3, g.poop + 1); g.clean = clamp(g.clean - 10); g.poopAt = 0; mile(g, 'poop', 'はじめてのフンをした（元気なしるし！）', false); }
      if (g.shedUntil && now >= g.shedUntil) finishShed(g);
      if (g.gravid && now >= g.gravid.layAt) layEggs(g, now);
    }
  }
  function grow(g, amt, now) {
    if (g.growth >= GROWTH.max) return;
    const before = g.growth, st = stageOf(g);
    g.growth = Math.min(GROWTH.max, g.growth + amt);
    if (Math.floor(before / GROWTH.shedEvery) < Math.floor(g.growth / GROWTH.shedEvery) && !g.shedUntil) {
      g.shedUntil = now + 40 * MIN; g.shedDur = 40 * MIN;
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
        laidAt: now, hatchAt: now + realDays(temp.days), mom: g.name, dad: dad.name, pmom: snap(g, 1), pdad: trimSnap(Object.assign({ sex: 'M' }, dad), 1),
        gen: Math.max(g.gen, dad.gen || 1) + 1,
      });
    }
    g.gravid = null;
    g.restUntil = now + realDays(14);
    sfx('lay');
    toast(`${g.name}が卵を2個産みました！インキュベーターに移しました`);
    memo(g, `${dad.name}とのあいだに、卵を2個産んだ`);
    g.clutches = (g.clutches || 0) + 1;
    if (g.clutches === 1) mile(g, 'mom', 'はじめて卵を産んで、お母さんになった', true);
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
  // 今週の特別入荷：1週間に1匹だけ、ふだんは並ばない組み合わせの子が来る
  const weekKey = now => Math.floor((now + 3 * DAYMS) / (7 * DAYMS));
  const SPECIALS = [
    { genes: { snow: 1, alb: 2, ecl: 2 }, note: 'マックスノー×アルビノ×エクリプスの豪華な組み合わせ' },
    { genes: { bliz: 2, alb: 1 }, note: '模様のないブリザード' },
    { genes: { snow: 2, ecl: 2 }, note: '真っ黒な目のスーパーマックスノー エクリプス' },
    { genes: { alb: 2 }, tang: 82, poly: { carrot: 65, spots: 10 }, note: '選び抜かれたオレンジの血統' },
    { genes: {}, tang: 30, poly: { lav: 85, spots: 20 }, note: 'ラベンダーがとても濃い血統' },
    { genes: { ecl: 1, bliz: 1 }, poly: { aberrant: 85 }, note: '模様が大きく乱れた一点もの（het つき）' },
  ];
  function refreshSpecial(now) {
    const wk = weekKey(now);
    if (S.special && S.special.week === wk) return;
    const sp = SPECIALS[wk % SPECIALS.length];
    const o = randomOffer();
    o.genes = G.normGenes(sp.genes);
    if (sp.tang != null) o.tang = sp.tang;
    Object.assign(o.poly, sp.poly || {});
    o.growth = 60;
    o.price = Math.round(valueOf(o) * 1.15);
    S.special = { week: wk, offer: o, note: sp.note, sold: false };
  }
  function specialCard() {
    const sp = S.special;
    if (!sp) return '';
    const left = (weekKey(Date.now()) + 1) * 7 * DAYMS - 3 * DAYMS - Date.now();
    if (sp.sold) return `<div class="card special sold"><b>今週の特別入荷</b><p class="muted small">今週の子はおむかえ済みです。次の特別入荷まで あと${fmtLeft(left)}</p></div>`;
    const o = sp.offer, morph = nameOf(o);
    return `<div class="offer special">
        <div class="offer-art" data-action="viewOffer" data-i="sp">${portrait(o, stageOf(o), morph)}</div>
        <div class="offer-main">
          <span class="pill new">今週の特別入荷 ・ あと${fmtLeft(left)}</span>
          <b>${esc(morph)}</b>
          <small class="muted">${o.sex === 'M' ? '♂ オス' : '♀ メス'} ・ ${STAGE_LABEL[stageOf(o)]} ・ ${esc(sp.note)}</small>
          ${traitTable(o, true)}
          <button class="act sm" data-action="viewOffer" data-i="sp">じっくり見る</button>
          <button class="act primary sm" data-action="buyGecko" data-i="sp" ${S.coins < o.price || S.geckos.length >= S.cases ? 'disabled' : ''}>${o.price} コインでおむかえ</button>
        </div></div>`;
  }
  const offerAt = i => i === 'sp' ? (S.special && !S.special.sold ? S.special.offer : null) : S.offers[Number(i)];
  function takeOffer(i) { if (i === 'sp') S.special.sold = true; else S.offers.splice(Number(i), 1); }
  function refreshOffers(now) {
    refreshSpecial(now);
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
    killViewer();
    const f = $('#sheetBody input, #sheetBody button');
    if (f) setTimeout(() => f.focus(), 50);
  }
  let viewer = null;
  function killViewer() { if (viewer) { try { viewer.destroy(); } catch (e) {} viewer = null; } }
  function closeSheet() { killViewer(); $('#sheet').hidden = true; $('#sheetBody').innerHTML = ''; }

  // ======================================================
  // ケースの中（3D）
  // ======================================================
  let tank = null;
  let tankGid = null;

  // しっぽの太さ（-0.15 ほっそり 〜 +0.35 ぽっちゃり）
  const condOf = g => (g.cond == null ? 55 : g.cond);
  const fatOf = g => clamp((condOf(g) - 55) / 120, -0.15, 0.35);
  function tankCondition(g) {
    if (!tank || !tank.setShed) return;
    tank.setShed(g && g.shedUntil ? shedProgress(g, Date.now()) : null);
    tank.setFat(g ? fatOf(g) : 0);
  }
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
    tank.setCage(g ? cageOf(g) : null);
    tank.setDecor(g ? decorOf(g) : []);
    tank.setPoops(g ? g.poop : 0);
    tank.setDirty(!!g && g.clean < 35);
    tankCondition(g);
    tank.setClock(clockNow(), seasonNow());
    if (g && tank.setHeat) tank.setHeat(heatOf(g));
    const th = $('.thermo');
    if (th) th.innerHTML = `<span class="t-when">${SEASON_JA[seasonNow()]}の${timeJa(clockNow())}</span><span class="t-temps"><span class="t-hot">暖かい側 ${g ? heatOf(g) : 32}℃</span> ／ <span class="t-cool">涼しい側 ${coolTemp()}℃</span></span>`;
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
  // 脱皮の進み具合（0：白くなりはじめ → 0.6：脱ぎはじめ → 1：おわり）
  function shedProgress(g, now) { if (!g.shedUntil) return -1; const d = g.shedDur || 40 * MIN; return clamp(1 - (g.shedUntil - now) / d, 0, 1); }
  function finishShed(g) {
    g.shedUntil = 0; g.misted = false;
    g.sheds = (g.sheds || 0) + 1;
    if (g.sheds === 1) g.mile = Object.assign(g.mile || {}, { shed1: Date.now() });
    g.tame = clamp(g.tame + 2);
    memo(g, '脱皮が完了。脱いだ皮はぱくっと食べた');
    if (g.id === S.selected) toast(`${g.name}の脱皮が終わりました。つやつや！`);
  }
  function applyEat(g, kind) {
    mile(g, 'eat', `はじめての${FOODS[kind].name}をぱくっと食べた`, true);
    const F = FOODS[kind];
    g.hunger = clamp(g.hunger + F.hunger);
    // しっぽの栄養：ミルワームは脂肪が多いので、たくさんあげるとぽっちゃりに
    g.cond = clamp((g.cond == null ? 55 : g.cond) + ({ cricket: 1.2, dubia: 1.6, worm: 3.2 })[kind] - (g.cond > 70 && kind !== 'worm' ? 0.6 : 0));
    grow(g, F.growth * (GROWTH.perHour / 6) * speedX() * heatInfo(heatOf(g)).growth, Date.now());
    g.tame = clamp(g.tame + 1);
    S.coins += 1;
    daily('fed');
    // はじめてのお世話ガイド中は、フンを早めに出して待たせない
    if (!g.poopAt) g.poopAt = Date.now() + (tutStep() === 1 ? 20000 : 2 * MIN);
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

  // ---------- ヒーター（ケースごと）
  const HEAT_MIN = 28, HEAT_MAX = 36;
  const heatOf = g => g.heat || 32;
  function coolTemp() {
    const base = { spring: 25, summer: 27, autumn: 25, winter: 22 }[seasonNow()];
    return base - (isNight() ? 2 : 0);
  }
  function heatInfo(t) {
    if (t <= 29) return { cls: 'info', label: '寒い', growth: 0.55, text: '寒すぎます。消化がゆっくりで、成長がかなり遅くなります' };
    if (t === 30) return { cls: 'info', label: '少し寒い', growth: 0.8, text: '少し寒いみたい。成長がやや遅くなります' };
    if (t <= 33) return { cls: 'good', label: 'ちょうどいい', growth: 1.15, text: 'ちょうどいい温度。よく消化して、成長が少し早くなります' };
    if (t === 34) return { cls: 'warn', label: '少し暑い', growth: 0.8, text: '少し暑いみたい。涼しい側にいることが多く、食欲が落ちぎみです' };
    return { cls: 'warn', label: '暑い', growth: 0.55, text: '暑すぎます。隠れ家にこもりがちで、成長がかなり遅くなります' };
  }
  function heaterSheet() {
    const g = selected();
    if (!g) return;
    const t = heatOf(g), info = heatInfo(t);
    openSheet(`<h3 class="sheet-title">ヒーターの温度</h3>
      <p class="muted small">ケースの右側をパネルヒーターで温めて、暖かい側と涼しい側を作っています。レオパは自分で居心地のいい場所へ移動します。暖かい側は 31〜33℃ がおすすめです。</p>
      <div class="heat-ctl">
        <button class="act" data-action="heatDown" ${t <= HEAT_MIN ? 'disabled' : ''} aria-label="温度を下げる">−</button>
        <div class="heat-val"><small class="muted">暖かい側</small><b>${t}℃</b><span class="pill ${info.cls}">${info.label}</span></div>
        <button class="act" data-action="heatUp" ${t >= HEAT_MAX ? 'disabled' : ''} aria-label="温度を上げる">＋</button>
      </div>
      <p class="small">${info.text}</p>
      <p class="muted small">涼しい側は部屋の温度（いまは ${coolTemp()}℃）。季節と時間帯で変わります。</p>
      <button class="act primary" data-action="closeSheet">とじる</button>`);
  }

  function statusOf(g, now) {
    if (g.gravid) return { cls: 'pink', text: S.eggs.length + 2 > EGG_CAP ? '抱卵中・インキュベーター満杯' : `抱卵中 あと${fmtLeft(g.gravid.layAt - now)}` };
    if (g.shedUntil) return { cls: 'info', text: '脱皮中' };
    if (heatOf(g) <= 30) return { cls: 'info', text: 'ちょっと寒そう' };
    if (heatOf(g) >= 34) return { cls: 'warn', text: 'ちょっと暑そう' };
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
    const g = newGecko({ name: unusedName(), sex: e.sex, genes: e.genes, tang: e.tang, poly: e.poly, growth: 0, hunger: 60, gen: e.gen, hatched: true });
    g.parents = e.pmom ? { mom: e.pmom, dad: e.pdad } : { mom: { name: e.mom, sex: 'F' }, dad: { name: e.dad, sex: 'M' } };
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
      const tw = S.feedMode === 'tw';
      openSheet(`<h3 class="sheet-title">ごはんをあげる</h3>
        <div class="seg two" role="radiogroup" aria-label="あげかた">
          <button role="radio" aria-checked="${!tw}" class="${tw ? '' : 'on'}" data-action="feedMode" data-m="drop"><b>ケースに入れる</b><small>自分でつかまえる</small></button>
          <button role="radio" aria-checked="${tw}" class="${tw ? 'on' : ''}" data-action="feedMode" data-m="tw"><b>ピンセットで</b><small>目の前でゆらしてあげる</small></button>
        </div>
        ${full ? `<p class="notice">${esc(g.name)}はおなかいっぱいみたい。また少したってから。</p>` : ''}
        <div class="list">${Object.entries(FOODS).map(([k, F]) => `
          <button class="row" data-action="feed" data-kind="${k}" ${full || !S.food[k] ? 'disabled' : ''}>
            <span class="row-art">${A.food(k)}</span>
            <span class="row-main"><b>${F.name}</b><small>${F.desc}</small></span>
            <span class="row-side">のこり ${S.food[k]}</span>
          </button>`).join('')}</div>
        <p class="muted small">なくなったらショップで買えます。</p>`);
    },
    feedMode(t) { S.feedMode = t.dataset.m; save(); ACTIONS.feedMenu(); },
    feed(t) {
      const g = selected();
      const k = t.dataset.kind;
      if (!g || !S.food[k]) return;
      if (g.hunger + pendingHunger() >= 90) { toast('おなかいっぱいみたい'); return; }
      S.food[k]--;
      closeSheet();
      if (tank && S.feedMode === 'tw') {
        tank.startTweezers(k);
        if (!S.twHint) { S.twHint = true; toast('ケースの中を指でなぞって、ピンセットをゆらしてみよう'); }
      } else if (tank) tank.spawnFood(k);
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
      mile(g, 'hand', 'はじめて手の上に乗ってくれた', true, `${g.name}が手の上に乗ってくれました`);
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
      // しっとりさせると、すぐに脱ぎはじめる（脱ぎおわるまで2分半くらい）
      const now = Date.now(), peel = 150000;
      if (shedProgress(g, now) < 0.6) { g.shedDur = peel / 0.4; g.shedUntil = now + peel; }
      g.misted = true;
      toast('しっとりして、脱ぎはじめました。そっと見守ってね');
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
      mom.gravid = { layAt: now + realDays(28), dad: snap(dad, 1) };
      dad.restUntil = now + realDays(3);
      closeSheet();
      toast(`ペアリング成功！${mom.name}は約${fmtLeft(realDays(28))}後に卵を産みます`);
      renderView();
      save();
    },
    // お別れの確認（里親・ブリーダー依頼 共通）
    farewell(g, to, reward, btnAttrs) {
      const days = Math.max(0, Math.floor((Date.now() - (g.adopted || g.born)) / DAYMS));
      const memories = (S.albums && S.albums[g.id] ? S.albums[g.id].entries.length : 0);
      openSheet(`<div class="farewell">
        <p class="eyebrow">おわかれの前に</p>
        <div class="reveal-art">${portrait(g, stageOf(g), nameOf(g))}</div>
        <h3 class="morph big">${esc(g.name)} ${sexMark(g)}</h3>
        <p class="muted">${esc(nameOf(g))} ・ ${STAGE_LABEL[stageOf(g)]} ・ ${weightOf(g)}g</p>
        <div class="farewell-days"><span>いっしょに過ごした日々</span><b>${days ? days + '日' : 'きょう1日'}</b><small>アルバムの思い出 ${memories}件</small></div>
        <p>${esc(g.name)}は <b>${esc(to)}</b> のもとへ旅立ちます。お礼に <b>${reward} コイン</b> もらえます。</p>
        <p class="notice">一度送り出すと、${esc(g.name)}はもう戻ってきません。本当におわかれしますか？</p>
        <p class="muted small">図鑑の記録とアルバムは残ります。</p>
        <div class="actions"><button class="act primary" data-action="closeSheet">やっぱりやめる</button><button class="act ghost" ${btnAttrs}>おわかれする</button></div>
      </div>`);
    },
    rehomeMenu() {
      const g = selected();
      if (!g) return;
      if (S.geckos.length <= 1) { toast('さいごの1匹は手放せません'); return; }
      if (g.gravid) { toast('抱卵中は里親に出せません'); return; }
      ACTIONS.farewell(g, 'やさしい飼い主さん', Math.round(valueOf(g) * 0.8), `data-action="rehome" data-id="${g.id}"`);
    },
    rehome(t) {
      const g = S.geckos.find(x => x.id === t.dataset.id) || selected();
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
    dexTab(t) { S.dexTab = t.dataset.tab; renderView(); window.scrollTo(0, 0); },
    showMenu(t) {
      const lv = SHOW_LEVELS[Number(t.dataset.lv)], day = todayKey(), th = themeOf(lv, day);
      if (!lv) return;
      const list = S.geckos.map(g => {
        const why = showBlock(g, day), sc = showScore(g, th, day);
        return `<button class="row" data-action="showEnter" data-lv="${t.dataset.lv}" data-id="${g.id}" ${why ? 'disabled' : ''}>
          <span class="row-art">${A.swatch(g)}</span>
          <span class="row-main"><b>${esc(g.name)} ${sexMark(g)}</b><small>${esc(nameOf(g))} ・ ${STAGE_LABEL[stageOf(g)]}${why ? ' ・ ' + why : ''}</small></span>
          <span class="row-side show-stars" aria-label="部門の評価">${why ? '' : stars(sc.base)}</span></button>`;
      }).join('');
      openSheet(`<p class="eyebrow">${lv.mark} ・ ${lv.name}</p>
        <h3 class="sheet-title">${th.name}にエントリー</h3>
        <p class="muted small">審査のポイント：${th.point}。★はこの部門での見た目の評価です。</p>
        <div class="list">${list}</div>
        <button class="act" data-action="closeSheet">やめる</button>`);
    },
    showEnter(t) {
      const lvI = Number(t.dataset.lv), lv = SHOW_LEVELS[lvI], day = todayKey(), th = themeOf(lv, day);
      const g = S.geckos.find(x => x.id === t.dataset.id);
      if (!g || !lv || showBlock(g, day)) return;
      g.showDay = day;
      const me = showScore(g, th, day);
      // ライバルは、大会の格に合わせた点数
      const r = prngApp(strHash(day + lv.id + g.id + 'rivals'));
      const rivals = [0, 1, 2, 3].map(() => {
        const z = (r() + r() + r() - 1.5) * 2;
        return { name: `${RIVALS[Math.floor(r() * RIVALS.length)]}の「${RNAMES[Math.floor(r() * RNAMES.length)]}」`, total: Math.round(lv.mean + z * 6) };
      });
      const all = rivals.concat([{ name: g.name, total: me.total, me: true }]).sort((a, b) => b.total - a.total || (a.me ? -1 : 1));
      const rank = all.findIndex(x => x.me) + 1;
      const coins = rank === 1 ? lv.reward : rank === 2 ? Math.round(lv.reward * 0.3) : rank === 3 ? 5 : 0;
      S.coins += coins;
      if (rank === 1) { S.showRec = S.showRec || {}; S.showRec[lv.id] = (S.showRec[lv.id] || 0) + 1; memo(g, `${lv.name}の${th.name}で優勝した！`, true); }
      else if (rank <= 3) memo(g, `${lv.name}の${th.name}で${rank}位になった`);
      const d = new Date();
      S.shows = (S.shows || []).concat([{ name: g.name, rank, score: me.total, lv: lv.name, theme: th.name, coins, date: `${d.getMonth() + 1}/${d.getDate()}` }]).slice(-30);
      save();
      const comment = me.base >= 80 ? 'この部門の特徴がとてもよく出ています' : me.base >= 60 ? '部門の特徴がしっかり出ています' : me.base >= 40 ? '特徴はひかえめ。血統を重ねるともっと伸びそう' : 'この部門とは少し相性がよくないかも';
      const cond = me.cond >= 15 ? 'コンディションは最高です' : me.cond >= 9 ? 'コンディションも良好' : 'お世話をしてから出ると、もっと点が伸びます';
      openSheet(`<div class="show-judge"><p class="eyebrow">${lv.name} ・ ${th.name}</p><span class="spinner big" aria-hidden="true"></span><p class="muted">審査員がじっくり見ています……</p></div>`);
      setTimeout(() => {
        sfx(rank === 1 ? 'hatch' : 'coin');
        openSheet(`<div class="show-result">
          <p class="eyebrow">${lv.name} ・ ${th.name}</p>
          <h3 class="morph big">${rank === 1 ? '優勝！' : `${rank}位`}</h3>
          <div class="reveal-art">${portrait(g, stageOf(g), nameOf(g))}</div>
          <ol class="show-rank">${all.map((x, i) => `<li class="${x.me ? 'me' : ''}"><span>${i + 1}位</span><b>${esc(x.name)}</b><small>${x.total}点</small></li>`).join('')}</ol>
          <div class="show-break"><span>見た目 <b>${Math.round(me.base * 0.85)}</b></span><span>お世話 <b>${me.cond >= 0 ? '+' : ''}${me.cond}</b></span><span>当日の調子 <b>${me.luck >= 0 ? '+' : ''}${me.luck}</b></span></div>
          <p class="small">審査員より：「${comment}。${cond}」</p>
          ${coins ? `<p><b>${coins} コイン</b>もらいました！</p>` : '<p class="muted small">今回は入賞ならず。また明日チャレンジしよう</p>'}
          <button class="act primary" data-action="closeSheet">とじる</button>
        </div>`);
        renderView();
      }, 1700);
    },
    buyCage(t) {
      const kind = t.dataset.kind, id = t.dataset.id;
      const v = (kind === 'size' ? L3.CAGE_SIZES : L3.CAGE_THEMES)[id];
      const own = cageOwn(), g = selected();
      if (!v) return;
      if (!own[id]) {
        if (S.coins < v.price) { toast('コインが足りません'); return; }
        S.coins -= v.price; own[id] = 1; sfx('buy');
        toast(g ? `${v.name}を買って、${g.name}のケースに使いました` : `${v.name}を買いました`);
      } else if (g) toast(`${g.name}のケースを${v.name}にしました`);
      if (g) applyCage(g, kind, id);
      if (t.closest && t.closest('#sheet')) closeSheet();
      renderView(); save();
    },
    setCageOpt(t) {
      const g = selected();
      if (!g || !cageOwn()[t.dataset.id]) return;
      applyCage(g, t.dataset.kind, t.dataset.id);
      renderView(); save();
    },
    shopTab(t) { S.shopTab = t.dataset.tab; renderView(); const v = $('#view-shop'); if (v) v.scrollTop = 0; window.scrollTo(0, 0); },
    candle(t) {
      const e = S.eggs.find(x => x.id === t.dataset.id);
      if (!e) return;
      const p = clamp((Date.now() - e.laidAt) / (e.hatchAt - e.laidAt), 0, 1);
      const sc = 0.25 + p * 0.85, veins = Math.min(1, p * 3);
      const c = A.colors(e.genes, e.tang, 'adult');
      const stageText = p < 0.12 ? '赤い血管がうっすら見えはじめました。中で命が育っています'
        : p < 0.4 ? '小さな影が見えます。ときどき、ぴくっと動きました'
        : p < 0.7 ? 'からだの形がわかるくらいに育ちました。しっぽを丸めています'
        : p < 0.95 ? `大きくなって、卵いっぱいに。模様がうっすら……「${esc(G.morphName(e.genes, e.tang, e.poly))}」っぽい？`
        : 'もうすぐ出てきそう！ 殻の内側でもぞもぞしています';
      openSheet(`<p class="eyebrow">${esc(e.mom)} × ${esc(e.dad)} の卵</p>
        <h3 class="sheet-title">ライトで照らしてみた</h3>
        <svg class="candle" viewBox="0 0 160 170" role="img" aria-label="ライトで照らした卵">
          <defs><radialGradient id="cgl" cx="50%" cy="55%" r="60%"><stop offset="0" stop-color="#FFF4C8"/><stop offset=".65" stop-color="#F6BF63"/><stop offset="1" stop-color="#B9702A"/></radialGradient>
          <radialGradient id="chalo" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="rgba(255,200,110,.55)"/><stop offset="1" stop-color="rgba(255,200,110,0)"/></radialGradient></defs>
          <rect width="160" height="170" rx="18" fill="#1D1914"/>
          <circle cx="80" cy="88" r="78" fill="url(#chalo)"/>
          <ellipse cx="80" cy="88" rx="44" ry="58" fill="url(#cgl)"/>
          <g stroke="#B5462E" stroke-width="1.3" fill="none" opacity="${(veins * 0.7).toFixed(2)}">
            <path d="M80 92 C 66 80 58 66 54 52"/><path d="M80 92 C 96 84 104 70 110 60"/><path d="M80 92 C 70 104 64 118 60 128"/><path d="M80 92 C 92 106 100 116 106 124"/><path d="M62 70 C 54 74 48 82 44 88"/><path d="M98 76 C 106 80 112 88 116 96"/>
          </g>
          ${p >= 0.12 ? `<g transform="translate(80 92) scale(${sc.toFixed(2)})" opacity="${Math.min(0.85, 0.3 + p).toFixed(2)}">
            <path d="M-6 -4 C 22 -10 26 20 4 24 C -14 27 -22 12 -12 6" stroke="${p > 0.7 ? c.spot : '#6B3A18'}" stroke-opacity=".6" stroke-width="12" fill="none" stroke-linecap="round"/>
            <ellipse cx="-12" cy="-12" rx="12" ry="10" fill="#6B3A18" fill-opacity=".6"/>
            ${p > 0.4 ? '<circle cx="-15" cy="-14" r="3.2" fill="#2A1508" fill-opacity=".8"/>' : ''}
          </g>` : ''}
        </svg>
        <div class="bars">${bar('育ち具合', p * 100, 'var(--accent)', Math.round(p * 100) + '%')}</div>
        <p>${stageText}</p>
        <p class="muted small">${e.temp}℃ ・ ふ化まで あと${fmtLeft(Math.max(0, e.hatchAt - Date.now()))}</p>
        <button class="act primary" data-action="closeSheet">とじる</button>`);
      bonusDone('candle');
    },
    setSpeed(t) {
      const v = SPEEDS.find(x => x.x === Number(t.dataset.x));
      if (!v) return;
      if (v.cost && !S.speedOpen) {
        if (S.coins < v.cost) { toast('コインが足りません'); return; }
        S.coins -= v.cost; S.speedOpen = true;
      }
      S.speed = v.x;
      toast(`せいちょうの速さを${v.name}にしました`);
      renderView(); save();
    },
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
    viewOffer(t) {
      const i = t.dataset.i, o = offerAt(i);
      if (!o) return;
      const morph = nameOf(o), hets = G.hets(o.genes), st = stageOf(o);
      const w = weightOf(Object.assign({}, o, { hunger: 70 }));
      const can = S.coins >= o.price && S.geckos.length < S.cases;
      openSheet(`<div class="viewer-sheet">
        <p class="eyebrow">この子を見てみよう</p>
        <h3 class="morph big">${esc(morph)}</h3>
        <div class="viewer3d" id="offerViewer">${L3.supported ? '' : portrait(o, st, morph)}</div>
        ${L3.supported ? `<div class="viewer-btns">${[['face', '顔'], ['body', '全身'], ['side', '横'], ['top', '上']].map(([k, n]) => `<button class="chip" data-action="viewAngle" data-v="${k}">${n}</button>`).join('')}</div><p class="muted tiny">ドラッグで回転・ピンチで拡大</p>` : ''}
        <p class="muted">${o.sex === 'M' ? '♂ オス' : '♀ メス'} ・ ${STAGE_LABEL[st]} ・ 体重 約${w}g</p>
        ${hets.length ? `<p class="het-line">${hets.map(h => 'het ' + h).join(' / ')}</p>` : ''}
        ${unseen(o) ? '<p class="new-line">図鑑にまだいない</p>' : ''}
        ${traitTable(o, false)}
        <div class="sheet-actions">
          <button class="act primary" data-action="buyGecko" data-i="${i}" ${can ? '' : 'disabled'}>${o.price} コインでおむかえ</button>
          <button class="act" data-action="closeSheet">もどる</button>
        </div></div>`);
      const el = $('#offerViewer');
      if (L3.supported && el) {
        viewer = L3.createViewer(el, { genes: G.normGenes(o.genes), tang: o.tang, poly: o.poly, seed: o.seed || 1, stage: st });
      }
    },
    viewGecko(t) {
      const g = S.geckos.find(x => x.id === t.dataset.id);
      if (!g) return;
      const morph = nameOf(g), hets = G.hets(g.genes), st = stageOf(g);
      openSheet(`<div class="viewer-sheet">
        <p class="eyebrow">${esc(g.name)} ${g.sex === 'M' ? '♂' : '♀'}</p>
        <h3 class="morph big">${esc(morph)}</h3>
        <div class="viewer3d" id="offerViewer">${L3.supported ? '' : portrait(g, st, morph)}</div>
        ${L3.supported ? `<div class="viewer-btns">${[['face', '顔'], ['body', '全身'], ['side', '横'], ['top', '上']].map(([k, n]) => `<button class="chip" data-action="viewAngle" data-v="${k}">${n}</button>`).join('')}</div><p class="muted tiny">ドラッグで回転・ピンチで拡大</p>` : ''}
        <p class="muted">${STAGE_LABEL[st]} ・ ${ageDays(g)}日目 ・ 体重 ${weightOf(g)}g ・ 第${g.gen}世代</p>
        ${hets.length ? `<p class="het-line">${hets.map(h => 'het ' + h).join(' / ')}</p>` : ''}
        ${traitTable(g)}
        <h4 class="h4">家系図</h4>
        ${familyTree(g)}
        <div class="sheet-actions"><button class="act" data-action="closeSheet">とじる</button></div></div>`);
      const el = $('#offerViewer');
      if (L3.supported && el) viewer = L3.createViewer(el, { genes: G.normGenes(g.genes), tang: g.tang, poly: g.poly, seed: g.seed || 1, stage: st, gravid: !!g.gravid });
      bonusDone('view');
    },
    viewAngle(t) { if (viewer) viewer.view(t.dataset.v); },
    buyGecko(t) {
      const i = t.dataset.i;
      const o = offerAt(i);
      if (!o) return;
      if (S.geckos.length >= S.cases) { toast('空いているケースがありません'); return; }
      if (S.coins < o.price) { toast('コインが足りません'); return; }
      S.coins -= o.price;
      takeOffer(i);
      const g = newGecko({ name: unusedName(), sex: o.sex, genes: o.genes, tang: o.tang, poly: o.poly, growth: o.growth, hunger: 70 });
      g.seed = o.seed;
      S.geckos.push(g);
      const fresh = register(g);
      memo(g, 'ショップからおむかえした', true);
      S.selected = g.id;
      sfx('buy');
      save();
      renderView();
      // 名前をつけてから、ケースへ
      openSheet(`<div class="reveal">
        <div class="reveal-art">${portrait(g, stageOf(g), nameOf(g))}</div>
        ${fresh.length ? `<span class="pill new">図鑑に新しく登録：${fresh.map(esc).join('・')}</span>` : ''}
        <p class="eyebrow">おむかえしました</p>
        <h3 class="morph big">${esc(nameOf(g))}</h3>
        <p class="muted">${g.sex === 'M' ? '♂ オス' : '♀ メス'} ・ ${STAGE_LABEL[stageOf(g)]}</p>
        <form id="renameForm" data-id="${g.id}" data-goto="1" class="rename">
          <label for="renameInput">この子の名前をつけてあげよう</label>
          <input id="renameInput" value="${esc(g.name)}" maxlength="10" autocomplete="off">
          <button class="act primary" type="submit">この名前にする</button>
        </form></div>`);
    },
    resetMenu() {
      openSheet(`<h3 class="sheet-title">はじめからあそぶ</h3>
        <p>今のレオパ・卵・図鑑・コインがすべて消えます。元には戻せません。</p>
        <div class="actions"><button class="act" data-action="closeSheet">やめる</button><button class="act danger" data-action="reset">消してはじめから</button></div>`);
    },
    reset() {
      if (tank) tank.takeFoods();
      tankGid = null;
      try { Object.keys(localStorage).filter(k => k.startsWith('leopa-photo-')).forEach(k => localStorage.removeItem(k)); } catch (e) { /* noop */ }
      freshState();
      closeSheet();
      saveNow();
      switchView('case');
      welcome();
    },
    welcomeDone() { S.welcomed = true; save(); closeSheet(); },
  };
  function casePrice() { return 30 + 20 * (S.cases - 4); }

  document.addEventListener('click', ev => {
    const t = ev.target.closest('[data-action]');
    if (!t || t.disabled) return;
    // 押したときの小さな手ごたえ（対応している端末だけ）
    if (t.classList.contains('act') && navigator.vibrate) { try { navigator.vibrate(8); } catch (e) { /* noop */ } }
    const fn = ACTIONS[t.dataset.action];
    if (fn) { ev.preventDefault(); fn(t, ev); }
  });
  // ---------- ギフトコード（コードそのものはソースに書かず、ハッシュで照合する）
  const GIFTS = {
    yqq9dl: { id: 'tomato', coins: 300, text: 'コイン300枚' },
  };
  const giftNorm = v => v.normalize('NFKC').trim().toUpperCase().replace(/\s+/g, '').replace(/[\u3041-\u3096]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60));
  const giftHash = v => { let x = 2166136261; for (const c of v) { x ^= c.codePointAt(0); x = Math.imul(x, 16777619) >>> 0; } return x.toString(36); };
  function giftSheet(msg) {
    openSheet(`<h3 class="sheet-title">ギフトコード</h3>
      <p class="small">お知らせなどで配られたギフトコードを入力すると、プレゼントが受け取れます。ひらがな・カタカナどちらでも大丈夫です。</p>
      <form id="giftForm" class="rename">
        <label for="giftInput">ギフトコード</label>
        <input id="giftInput" maxlength="30" autocomplete="off" autocapitalize="characters" placeholder="コードを入力">
        <button class="act primary" type="submit">受け取る</button>
      </form>
      ${msg ? `<p class="notice">${msg}</p>` : ''}
      <button class="act" data-action="closeSheet">とじる</button>`);
  }
  ACTIONS.giftMenu = () => giftSheet();
  document.addEventListener('submit', ev => {
    if (ev.target.id !== 'giftForm') return;
    ev.preventDefault();
    const v = giftNorm($('#giftInput').value);
    if (!v) return;
    const gift = GIFTS[giftHash(v)];
    S.gifts = S.gifts || {};
    if (!gift) { giftSheet('コードがちがうようです。もう一度たしかめてね'); return; }
    if (S.gifts[gift.id]) { giftSheet('このギフトコードは受け取りずみです'); return; }
    S.gifts[gift.id] = Date.now();
    S.coins += gift.coins || 0;
    closeSheet();
    sfx('hatch');
    toast(`ギフトを受け取りました！ ${gift.text}`);
    renderView(); save();
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

  let lastCoins = null;
  function coinPop(n) {
    const box = $('#coins');
    if (!box) return;
    box.classList.remove('bump'); void box.offsetWidth; box.classList.add('bump');
    const f = document.createElement('span');
    f.className = 'coin-pop';
    f.textContent = '+' + n;
    box.appendChild(f);
    setTimeout(() => f.remove(), 1100);
  }
  function renderView() {
    setHTML($('#soundBtn'), S.mute ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l4 6M21 9l-4 6"/></svg><span class="sr">音をオンにする</span>' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg><span class="sr">音をオフにする</span>');
    setHTML($('#musicBtn'), `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>${S.musicOff ? '<path d="M3 3l18 18"/>' : ''}</svg><span class="sr">${S.musicOff ? '音楽をオンにする' : '音楽をオフにする'}</span>`);
    setHTML($('#coins'), `<span class="coin" aria-hidden="true"></span><b>${S.coins}</b><span class="sr">コイン</span>`);
    if (lastCoins != null && S.coins > lastCoins) coinPop(S.coins - lastCoins);
    lastCoins = S.coins;
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
    if (!g) { setHTML($('#caseInfo'), ''); setHTML($('#tankName'), ''); return; }
    const st = stageOf(g);
    const morph = nameOf(g);
    const hets = G.hets(g.genes);
    const status = statusOf(g, now);
    const next = st === 'baby' ? GROWTH.young : st === 'young' ? GROWTH.adult : GROWTH.max;
    const growSide = g.growth >= GROWTH.max ? 'MAX' : Math.floor(g.growth);
    const block = pairBlock(g, now);
    setHTML($('#tankName'), `<b>${esc(g.name)}</b><span class="sex ${g.sex}">${sexMark(g)}</span><span class="pill ${status.cls}">${status.text}</span>`);
    setHTML($('#caseInfo'), `
      ${editing ? editPanel(g) : `<div class="actions">
        <button class="act primary care${tutGlow('feed')}" data-action="feedMenu">ごはん</button>
        <button class="act care${tutGlow('clean')}" data-action="clean">おそうじ</button>
        <button class="act care${tutGlow('handle')}" data-action="handle">ふれあう</button>
      </div>
      ${tutCoach()}
      ${g.shedUntil ? '<button class="act wide mist" data-action="mist">しっとりケアで脱皮をうながす</button>' : ''}
      ${installCard()}
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
          <span class="tag">${weightOf(g)}g</span>
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
        ${weightCard(g)}
        ${healthCard(g)}
        ${datesCard(g)}
        <p class="muted small">${st === 'adult' ? (g.growth >= GROWTH.max ? 'りっぱなおとなです' : 'おとなになりました。ペアリングできます') : `${STAGE_LABEL[st === 'baby' ? 'young' : 'adult']}まで あと${fmtLeft((next - g.growth) / (GROWTH.perHour * speedX() * heatInfo(heatOf(g)).growth) * HOUR)}ほど（ごはんを食べていれば）`}${g.hunger <= 30 ? ' ・ おなかが空いていると成長が止まります' : ''}</p>
      </div>

      <div class="actions sub">
        <button class="act ghost" data-action="viewGecko" data-id="${g.id}">くわしく見る</button>
        <button class="act ghost" data-action="pairMenu">ペアリング${block ? '' : ' OK'}</button>
        <button class="act ghost" data-action="camera">カメラで撮る</button>
        <button class="act ghost" data-action="album">アルバム</button>
        <button class="act ghost" data-action="editStart">もようがえ</button>
        <button class="act ghost" data-action="rehomeMenu">里親に出す</button>
      </div>
      <p class="tip"><b>まめちしき</b><span>${TIPS[tipIndex]}</span></p>`}`);
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
            : `<span class="meter"><i style="--v:${p.toFixed(1)}%;--c:var(--accent)"></i></span><small class="muted">あと${fmtLeft(e.hatchAt - now)}</small><button class="act ghost sm" data-action="candle" data-id="${e.id}">ライトで見る</button>`}
        </div></div>`;
    }).join('');
    setHTML($('#view-eggs'), `
      <h2 class="h2">インキュベーター <small class="muted">${S.eggs.length} / ${EGG_CAP}</small></h2>
      <div class="card">
        <div class="label" id="tempLabel">温度（次に産まれる卵から）</div>
        <div class="seg" role="radiogroup" aria-labelledby="tempLabel">${TEMPS.map(t => `<button role="radio" aria-checked="${t.t === S.incTemp}" class="${t.t === S.incTemp ? 'on' : ''}" data-action="temp" data-t="${t.t}"><b>${t.label}</b><small>${t.note}</small></button>`).join('')}</div>
        <p class="muted small">レオパは卵の温度で性別が決まります。${temp.label}だと約${fmtLeft(realDays(temp.days))}でふ化します（いまは${speedX()}倍速）。</p>
      </div>
      ${gravids.length ? `<div class="card soft">${gravids.map(g => `<div>♀ ${esc(g.name)} が抱卵中 ・ ${full ? 'インキュベーターが空くのを待っています' : `産卵まで あと${fmtLeft(g.gravid.layAt - now)}`}</div>`).join('')}</div>` : ''}
      ${eggs ? `<div class="egg-grid">${eggs}</div>` : `<div class="card empty"><div class="egg-art">${A.egg()}</div><p>まだ卵はありません。<br>アダルトのオスとメスを「ペアリング」してみよう。</p></div>`}
      ${S.eggs.some(e => now >= e.hatchAt) && S.geckos.length >= S.cases ? '<p class="notice">ケースがいっぱいです。ショップでケースを増やすか、里親に出してからふ化させよう。</p>' : ''}`);
  }

  let dexHTML = '';

  // ======================================================
  // 品評会：その日の部門で審査。1匹につき1日1回まで
  // ======================================================
  const SHOW_LEVELS = [
    { id: 'local', name: '町の品評会', mark: '初級', mean: 46, reward: 30, note: 'はじめての出場にぴったり' },
    { id: 'region', name: '地方大会', mark: '中級', mean: 62, reward: 60, note: '血統のいい子がそろう' },
    { id: 'nation', name: '全国大会', mark: '上級', mean: 77, reward: 100, note: 'トップブリーダーの子が集まる' },
  ];
  const P0 = x => (x.poly || {});
  const SHOW_THEMES = [
    { id: 'orange', name: 'オレンジ部門', point: 'タンジェリン度の高さと、しっぽのオレンジ', score: x => x.tang * 0.65 + P0(x).carrot * 0.35 },
    { id: 'hypo', name: 'すっきり部門', point: '体と頭の斑点が少なく、すっきりしていること', score: x => (100 - P0(x).spots) * 0.6 + (100 - P0(x).head) * 0.4 },
    { id: 'pattern', name: 'パターン部門', point: '模様の乱れと、斑点の迫力', score: x => P0(x).aberrant * 0.6 + P0(x).blotch * 0.4 },
    { id: 'lav', name: 'ラベンダー部門', point: 'ラベンダー色の濃さ（黄色はひかえめに）', score: x => P0(x).lav * 0.8 + (100 - x.tang) * 0.2 },
    { id: 'mono', name: 'モノトーン部門', point: 'マックスノーなどの白と黒のコントラスト', score: x => Math.min(100, (x.genes.snow ? 45 : 0) + (x.genes.snow === 2 ? 15 : 0) + (x.genes.ecl === 2 ? 10 : 0) + (100 - x.tang) * 0.3 + (x.genes.bliz === 2 ? 10 : 0)) },
    { id: 'rare', name: '総合部門', point: '珍しいモルフかどうかと、全体のバランス', score: x => Math.min(100, 30 + ['alb', 'ecl', 'bliz'].reduce((n, k) => n + (x.genes[k] === 2 ? 16 : 0), 0) + x.genes.snow * 9 + Math.max(x.tang, P0(x).carrot, 100 - P0(x).spots, P0(x).aberrant, P0(x).lav) * 0.3) },
  ];
  const RIVALS = ['ヤモリ堂', '荒野レプタイルズ', 'ひだまりブリーダーズ', 'しっぽ工房', 'みかん畑ファーム', 'ガラス屋さん', 'ナイトゲッコー', 'さばくのおうち', 'こもれびレプ', 'ぷにぷに舎'];
  const RNAMES = ['コハク', 'ネロ', 'ルビー', 'ソラ', 'マシュ', 'カカオ', 'ユキ', 'ヒノキ', 'モモ', 'ジン', 'アオ', 'キナ', 'レモ', 'ハク'];
  const strHash = str => { let h = 2166136261; for (const c of str) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };
  const themeOf = (lv, day) => SHOW_THEMES[(strHash(day + lv.id) >>> 3) % SHOW_THEMES.length];
  // コンディション：おなか・きれい・なれ度・体の大きさ
  function showCond(g) {
    return (g.hunger >= 60 ? 5 : g.hunger >= 35 ? 2 : 0) + (g.clean >= 60 ? 5 : g.clean >= 35 ? 2 : 0) + Math.min(5, g.tame / 20) + Math.min(5, g.growth / GROWTH.max * 5) + (stageOf(g) === 'young' ? -12 : 0);
  }
  function showScore(g, th, day) {
    const base = clamp(th.score(g), 0, 100);
    const r = prngApp(strHash(day + g.id + th.id));
    const luck = (r() - 0.5) * 8;
    return { base: Math.round(base), cond: Math.round(showCond(g)), luck: Math.round(luck), total: Math.round(base * 0.85 + showCond(g) + luck) };
  }
  function prngApp(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function showBlock(g, day) {
    if (stageOf(g) === 'baby') return 'ベビーはまだ出られません';
    if (g.showDay === day) return '今日はもう出場しました';
    return '';
  }
  const stars = v => '★★★★★☆☆☆☆☆'.slice(5 - Math.max(1, Math.min(5, Math.round(v / 20))), 10 - Math.max(1, Math.min(5, Math.round(v / 20))));
  function showPage() {
    const day = todayKey();
    const rec = S.showRec || {};
    const cards = SHOW_LEVELS.map((lv, i) => {
      const th = themeOf(lv, day);
      return `<div class="card show-card lv${i}">
        <div class="show-head"><span class="pill ${['good', 'info', 'pink'][i]}">${lv.mark}</span><b>${lv.name}</b><span class="row-side price">${lv.reward}</span></div>
        <p class="show-theme">今日の部門：<b>${th.name}</b></p>
        <p class="muted small">審査のポイント：${th.point}</p>
        <p class="muted small">${lv.note} ・ 優勝 ${lv.reward}コイン / 2位 ${Math.round(lv.reward * 0.3)}コイン</p>
        <button class="act primary sm" data-action="showMenu" data-lv="${i}">エントリーする</button>
      </div>`;
    }).join('');
    const hist = (S.shows || []).slice(-8).reverse();
    return `<p class="muted small">毎日、大会ごとに審査される部門がかわります。育てた子の「らしさ」と、ふだんのお世話（おなか・きれい・なれ度・体の大きさ）で審査されます。同じ子が出られるのは1日1回まで。</p>
      ${cards}
      <h3 class="h3">これまでの成績</h3>
      <div class="show-rec">${SHOW_LEVELS.map(lv => `<div><small>${lv.name}</small><b>${(rec[lv.id] || 0)}</b><small>回優勝</small></div>`).join('')}</div>
      ${hist.length ? `<div class="list">${hist.map(h => `<div class="row static"><span class="row-main"><b>${esc(h.name)} ・ ${h.rank}位</b><small>${esc(h.lv)} ${esc(h.theme)} ・ ${h.score}点 ・ ${esc(h.date)}</small></span><span class="row-side">${h.rank === 1 ? '<span class="pill good">優勝</span>' : h.coins ? '+' + h.coins : ''}</span></div>`).join('')}</div>` : '<p class="muted small">まだ出場していません。</p>'}
      <div class="card guide"><h3 class="h3">品評会のコツ</h3>
        <p>部門ごとに見られる特徴がちがいます。オレンジ部門ならタンジェリン度としっぽのオレンジが高い子、すっきり部門なら斑点の少ない子が有利です。</p>
        <p>ふだんのお世話も点数に入ります。ごはんとおそうじをすませて、なれ度の高い子で出場しよう。ヤングも出られますが、アダルトのほうが有利です。</p>
        <p>上の大会で勝つには、目的の特徴を強めるように何代もブリードして、血統を作っていくのが近道です。</p></div>`;
  }
  function renderDex() {
    const found = G.DEX.filter(d => S.dex[d.id]).length;
    const extra = Object.keys(S.names).filter(n => !G.DEX.some(d => d.name === n)).sort();
    const cards = G.DEX.map((d, i) => {
      const got = !!S.dex[d.id];
      const art = portrait({ genes: d.rep.genes, tang: d.rep.tang, poly: d.rep.poly, seed: 1000 + i * 7919 }, 'adult', got ? d.name : '');
      return `<div class="dex-card${got ? '' : ' locked'}"><div class="dex-art">${art}</div><b>${esc(d.name)}</b><small class="muted">${esc(d.hint)}</small></div>`;
    }).join('');
    const dtab = S.dexTab || 'dex';
    const dtabs = `<div class="shop-tabs three" role="tablist">${[['dex', '図鑑'], ['show', '品評会'], ['rec', '実績']].map(([k, n]) => `<button role="tab" aria-selected="${dtab === k}" class="${dtab === k ? 'on' : ''}" data-action="dexTab" data-tab="${k}">${n}</button>`).join('')}</div>`;
    if (dtab === 'rec') {
      const html = `<h2 class="h2">実績・アルバム</h2>${dtabs}${albumList()}${achSection()}`;
      if (html !== dexHTML) { setHTML($('#view-dex'), html); dexHTML = html; }
      return;
    }
    if (dtab === 'show') {
      const html = `<h2 class="h2">品評会</h2>${dtabs}${showPage()}`;
      if (html !== dexHTML) { setHTML($('#view-dex'), html); dexHTML = html; }
      return;
    }
    const html = `
      <h2 class="h2">モルフ図鑑 <small class="muted">${found} / ${G.DEX.length}</small></h2>
      ${dtabs}
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
        <div class="offer-art" data-action="viewOffer" data-i="${i}">${portrait(o, stageOf(o), morph)}</div>
        <div class="offer-main">
          <b>${esc(morph)}</b>
          <small class="muted">${o.sex === 'M' ? '♂ オス' : '♀ メス'} ・ ${STAGE_LABEL[stageOf(o)]}</small>
          ${hets.length ? `<small class="het-line">${hets.map(h => 'het ' + h).join(' / ')}</small>` : ''}
          ${unseen(o) ? '<small class="new-line">図鑑にまだいない</small>' : ''}
          ${traitTable(o, true)}
          <button class="act sm" data-action="viewOffer" data-i="${i}">じっくり見る</button>
          <button class="act primary sm" data-action="buyGecko" data-i="${i}" ${S.coins < o.price || S.geckos.length >= S.cases ? 'disabled' : ''}>${o.price} コインでおむかえ</button>
        </div></div>`;
    }).join('');
    const tab = S.shopTab || 'leopa';
    const TABS = [['leopa', 'レオパ'], ['food', 'ごはん'], ['interior', 'インテリア'], ['other', 'そのほか']];
    const tabs = `<div class="shop-tabs" role="tablist">${TABS.map(([k, n]) => `<button role="tab" aria-selected="${tab === k}" class="${tab === k ? 'on' : ''}" data-action="shopTab" data-tab="${k}">${n}</button>`).join('')}</div>`;
    const sec = {
      leopa: () => `<h3 class="h3">おむかえ <small class="muted">次の入荷まで ${fmtLeft(S.offersAt - now)}</small></h3>
      ${specialCard()}
      ${offers ? `<div class="offers">${offers}</div>` : '<p class="muted">売り切れです。次の入荷をお待ちください。</p>'}
      <p class="muted small">コインは、お世話・ふ化・里親に出すことでもらえます。</p>
      ${ordersSection(now)}`,
      food: () => `<h3 class="h3">ごはん</h3>
      <div class="list">${Object.entries(FOODS).map(([k, F]) => `
        <button class="row" data-action="buyFood" data-kind="${k}" ${S.coins < F.price ? 'disabled' : ''}>
          <span class="row-art">${A.food(k)}</span>
          <span class="row-main"><b>${F.name} ${F.pack}匹</b><small>いま ${S.food[k]}匹 ・ ${F.desc}</small></span>
          <span class="row-side price">${F.price}</span>
        </button>`).join('')}</div>`,
      interior: () => `${cageShop()}${interiorShop()}`,
      other: () => `${speedShop()}
      <h3 class="h3">ケース <small class="muted">${S.geckos.length} / ${S.cases} 使用中</small></h3>
      <div class="list">
        <button class="row" data-action="buyCase" ${S.cases >= CASE_MAX || S.coins < casePrice() ? 'disabled' : ''}>
          <span class="row-main"><b>${S.cases >= CASE_MAX ? 'これ以上は増やせません' : 'ケースを1つ増やす'}</b><small>1匹ずつ別のケースで暮らします（最大${CASE_MAX}）</small></span>
          ${S.cases >= CASE_MAX ? '' : `<span class="row-side price">${casePrice()}</span>`}
        </button>
      </div>
      <h3 class="h3">せってい</h3>
      <div class="danger-zone">${isStandalone() || inFrame ? '' : '<button class="act ghost sm" data-action="installMenu">ホーム画面に追加</button>'}<button class="act ghost sm" data-action="giftMenu">ギフトコード</button><button class="act ghost sm" data-action="notifyMenu">おしらせ通知</button><button class="act ghost sm" data-action="backup">セーブデータの控え</button><button class="act ghost sm" data-action="resetMenu">はじめからあそぶ</button></div>`,
    };
    setHTML($('#view-shop'), `<h2 class="h2">ショップ</h2>${tabs}${(sec[tab] || sec.leopa)()}`);
    if (tab === 'interior') fillThumbs();
  }

  function welcome() {
    openSheet(`<div class="welcome">
      <p class="eyebrow">ようこそ</p>
      <h3 class="logo-big"><picture><source srcset="assets/logo.webp" type="image/webp"><img src="assets/logo.png" alt="レオパといっしょ" width="720" height="178"></picture></h3>
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
  const BONUS = [
    { key: 'photo', label: 'カメラで1枚撮る' },
    { key: 'view', label: '「くわしく見る」でじっくり観察する' },
    { key: 'album', label: 'アルバムをふりかえる' },
    { key: 'candle', label: '卵をライトで照らして見る', eggs: true },
  ];
  function bonusDone(key) {
    const d = dailyState();
    if (d.bonus !== key || d.bonusDone) return;
    d.bonusDone = true; S.coins += 15;
    setTimeout(() => toast('今日のおねがい達成！ 15コイン'), 300);
    save();
  }
  function dailyState() {
    if (!S.daily || S.daily.day !== todayKey()) {
      const streak = S.daily && S.daily.claimed && S.daily.day === yesterdayKey() ? (S.daily.streak || 0) : 0;
      const day = todayKey();
      const pool = BONUS.filter(b => !b.eggs || S.eggs.length);
      let h = 0; for (const c of day) h = (h * 31 + c.charCodeAt(0)) >>> 0;
      S.daily = { day, fed: 0, cleaned: 0, handled: 0, claimed: false, streak, bonus: pool[h % pool.length].key, bonusDone: false };
    }
    return S.daily;
  }
  function yesterdayKey() { const d = new Date(Date.now() - 86400000); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }
  // ---- はじめてのお世話ガイド（ごはん → おそうじ → ふれあう）
  const TUT = [
    { key: 'fed', btn: 'feed', text: 'まずは「ごはん」をあげてみよう。コオロギを入れると、レオパが追いかけて食べます' },
    { key: 'cleaned', btn: 'clean', text: '食べてしばらくすると、ケースの隅にフンが出ます。フンをタップするか「おそうじ」できれいにしよう' },
    { key: 'handled', btn: 'handle', text: 'さいごに「ふれあう」で手に乗せてみよう。なれ度が上がります' },
  ];
  const tutStep = () => (S.tut && S.tut.step < TUT.length ? S.tut.step : -1);
  const tutGlow = btn => { const i = tutStep(); return i >= 0 && TUT[i].btn === btn ? ' glow' : ''; };
  function tutCoach() {
    const i = tutStep();
    if (i < 0) return '';
    return `<div class="coach" style="--arrow:${['16.6%', '50%', '83.3%'][i]}"><span class="coach-step">はじめてのお世話 ${i + 1} / ${TUT.length}</span><p>${TUT[i].text}</p></div>`;
  }
  function tutAdvance(key) {
    const i = tutStep();
    if (i < 0 || TUT[i].key !== key) return;
    S.tut.step++;
    if (S.tut.step >= TUT.length) {
      S.coins += 30;
      S.food.cricket += 10;
      setTimeout(() => { sfx('hatch'); toast('はじめてのお世話、できました！ごほうび 30コインとコオロギ10匹'); }, 400);
    }
  }
  function daily(key) {
    tutAdvance(key);
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
      ${d.bonus ? (b => b ? `<div class="daily-bonus${d.bonusDone ? ' done' : ''}"><span>今日のおねがい</span><b>${b.label}</b><small>${d.bonusDone ? '達成！' : '15コイン'}</small></div>` : '')(BONUS.find(x => x.key === d.bonus)) : ''}
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
        <div class="list">${list.map(g => `<button class="row" data-action="deliverMenu" data-i="${t.dataset.i}" data-id="${g.id}" ${S.geckos.length <= 1 ? 'disabled' : ''}>
          <span class="row-art">${A.swatch(g)}</span>
          <span class="row-main"><b>${esc(g.name)} ${sexMark(g)}</b><small>${esc(nameOf(g))} ・ ${STAGE_LABEL[stageOf(g)]}</small></span>
          <span class="row-side">ゆずる</span></button>`).join('')}</div>
        ${S.geckos.length <= 1 ? '<p class="muted small">さいごの1匹はゆずれません。</p>' : ''}`);
    },
    deliverMenu(t) {
      const o = S.orders[Number(t.dataset.i)], g = S.geckos.find(x => x.id === t.dataset.id);
      if (!o || !g || !fits(o, g) || S.geckos.length <= 1) return;
      ACTIONS.farewell(g, o.buyer, o.reward, `data-action="deliver" data-i="${t.dataset.i}" data-id="${g.id}"`);
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
  // ---- ケージの大きさ・見た目（買うと持ち物になり、もようがえでケースごとに選べる）
  const cageOf = g => { if (!g.cage) g.cage = { size: 'std', theme: 'glass' }; return g.cage; };
  const cageDims = g => L3.CAGE_SIZES[cageOf(g).size] || L3.CAGE_SIZES.std;
  const cageOwn = () => { if (!S.cageOwn) S.cageOwn = { std: 1, glass: 1 }; return S.cageOwn; };
  function applyCage(g, kind, id) {
    const c = cageOf(g);
    if (kind === 'size') {
      c.size = id;
      // 小さくしたときは、はみ出した家具を内側へ寄せる
      const TK = cageDims(g);
      for (const d of decorOf(g)) {
        const r = L3.DECOR[d.t].r + 0.15;
        d.x = clamp(d.x, -TK.hw + r, TK.hw - r); d.z = clamp(d.z, -TK.hd + r, TK.hd - r);
      }
    } else c.theme = id;
  }
  function cageShop() {
    const own = cageOwn(), g = selected();
    const row = (kind, id, v) => {
      const has = own[id], on = g && cageOf(g)[kind] === id;
      return itemCard(kind, id, v, has ? (on ? '使用中' : '持っている') : String(v.price), on);
    };
    return `<h3 class="h3">ケージの大きさ <small class="muted">${g ? `${esc(g.name)}のケースに使います` : ''}</small></h3>
      <div class="item-grid">${Object.entries(L3.CAGE_SIZES).map(([id, v]) => row('size', id, v)).join('')}</div>
      <h3 class="h3">ケージの見た目</h3>
      <div class="item-grid">${Object.entries(L3.CAGE_THEMES).map(([id, v]) => row('theme', id, v)).join('')}</div>
      <p class="muted small">一度買えば、どのケースでも使えます。ケースごとの切りかえは「もようがえ」からもできます。</p>`;
  }
  function decorOk(g, x, z, t, skip) {
    const r = L3.DECOR[t].r;
    const TK = cageDims(g);
    if (Math.abs(x) > TK.hw - r - 0.1 || z < -TK.hd + r + 0.1 || z > TK.hd - r - 0.1) return 'ケースのはしに寄りすぎです';
    if (Math.hypot(x - (TK.hw - 1.1), z - (-TK.hd + 0.7)) < r + 0.7) return 'そこはトイレの場所です';
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
      <div class="label">ケージ</div>
      <div class="decor-inv">${Object.entries(L3.CAGE_SIZES).filter(([id]) => cageOwn()[id]).map(([id, v]) => `<button class="chip${cageOf(g).size === id ? ' on' : ''}" data-action="setCageOpt" data-kind="size" data-id="${id}">${v.name}</button>`).join('')}</div>
      <div class="decor-inv">${Object.entries(L3.CAGE_THEMES).filter(([id]) => cageOwn()[id]).map(([id, v]) => `<button class="chip${cageOf(g).theme === id ? ' on' : ''}" data-action="setCageOpt" data-kind="theme" data-id="${id}">${v.name}</button>`).join('')}</div>
      <div class="label">持っている家具</div>
      ${inv.length ? `<div class="decor-inv">${inv.map(([t, n]) => `<button class="chip${editing.place === t ? ' on' : ''}" data-action="pickDecor" data-t="${t}">${L3.DECOR[t].name} ×${n}</button>`).join('')}</div>`
        : '<p class="muted small">しまった家具や、ショップで買った家具がここに並びます。</p>'}
      <button class="act primary wide" data-action="editDone">もようがえをおわる</button>
    </div>`;
  }
  function famNode(x, role, cls) {
    if (!x) return `<div class="fam-node unknown ${cls}"><small>${role}</small><b>？</b><small>わからない</small></div>`;
    const known = x.genes;
    return `<div class="fam-node ${cls}"><small>${role}</small><b>${known ? A.swatch(x) : ''}${esc(x.name)}</b><small>${known ? esc(nameOf(x)) : ''}</small></div>`;
  }
  function familyTree(g) {
    if (!g.parents) return `<p class="muted small">${g.hatched ? '親の記録がありません（記録を始める前に生まれた子です）' : 'ショップからおむかえした子なので、親はわかりません。この子から新しい家系が始まります'}</p>`;
    const { mom, dad } = g.parents, gp = p => (p && p.parents) || {};
    return `<div class="family">
      ${famNode(g, 'この子', 'me')}
      ${famNode(dad, '父 ♂', 'p1')}${famNode(mom, '母 ♀', 'p2')}
      ${famNode(gp(dad).dad, '父方の祖父', 'g1')}${famNode(gp(dad).mom, '父方の祖母', 'g2')}${famNode(gp(mom).dad, '母方の祖父', 'g3')}${famNode(gp(mom).mom, '母方の祖母', 'g4')}
    </div>`;
  }
  function speedShop() {
    return `<h3 class="h3">せいちょうの速さ <small class="muted">ごはん・抱卵・ふ化の進み方もかわります</small></h3>
      <div class="list">${SPEEDS.map(v => {
        const open = !v.cost || S.speedOpen;
        const on = speedX() === v.x;
        return `<button class="row${on ? ' on' : ''}" data-action="setSpeed" data-x="${v.x}" ${on || (!open && S.coins < v.cost) ? 'disabled' : ''}>
          <span class="row-main"><b>${v.name}${on ? '（いま）' : ''}</b><small>${v.note}</small></span>
          ${open ? '' : `<span class="row-side price">${v.cost}</span>`}
        </button>`;
      }).join('')}</div>`;
  }
  // 見本写真：撮りおわっていればそのまま、まだなら後で1枚ずつ撮って差しこむ
  function thumb(kind, id, cls) {
    if (!L3.supported) return `<span class="item-img ${cls || ''} none"></span>`;
    const url = L3.itemPhotoReady(kind, id);
    return `<img class="item-img ${cls || ''}" alt="" ${url ? `src="${url}"` : `data-thumb="${kind}|${id}"`}>`;
  }
  let thumbBusy = false;
  function fillThumbs() {
    if (thumbBusy) return;
    const img = document.querySelector('img[data-thumb]:not([src])');
    if (!img) return;
    thumbBusy = true;
    setTimeout(() => {
      const [kind, id] = img.dataset.thumb.split('|');
      let url = '';
      try { url = L3.itemPhoto(kind, id); } catch (e) { /* 撮れなくても続ける */ }
      document.querySelectorAll(`img[data-thumb="${kind}|${id}"]`).forEach(el => { if (url) el.src = url; else el.removeAttribute('data-thumb'); });
      thumbBusy = false;
      fillThumbs();
    }, 40);
  }
  function itemCard(kind, id, v, side, on) {
    return `<button class="item-card${on ? ' on' : ''}" data-action="itemPreview" data-kind="${kind}" data-id="${id}">
      ${thumb(kind, id)}
      <b>${v.name}</b>
      <span class="item-side ${/^\d+$/.test(side) ? 'price' : ''}">${side}</span>
    </button>`;
  }
  function interiorShop() {
    return `<h3 class="h3">家具 <small class="muted">買った家具は「もようがえ」で置けます</small></h3>
      <div class="item-grid">${Object.entries(L3.DECOR).map(([t, d]) => itemCard('decor', t, d, String(d.price))).join('')}</div>`;
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
    itemPreview(t) {
      const kind = t.dataset.kind, id = t.dataset.id;
      const v = kind === 'decor' ? L3.DECOR[id] : (kind === 'size' ? L3.CAGE_SIZES : L3.CAGE_THEMES)[id];
      if (!v) return;
      const g = selected();
      let info = '', btn = '';
      if (kind === 'decor') {
        info = `${S.decorInv[id] ? `手持ち ${S.decorInv[id]}個 ・ ` : ''}${v.shelter ? 'もぐって眠れるシェルター' : 'ケースに置ける家具'}`;
        btn = `<button class="act primary" data-action="buyDecor" data-t="${id}" ${S.coins < v.price ? 'disabled' : ''}>${v.price} コインで買う</button>`;
      } else {
        const has = cageOwn()[id], on = g && cageOf(g)[kind] === id;
        info = kind === 'size' ? '同じ大きさのレオパと並べた見本です' : 'レギュラーサイズの見本です';
        btn = on ? '<button class="act" disabled>いまのケースで使用中</button>'
          : has ? `<button class="act primary" data-action="buyCage" data-kind="${kind}" data-id="${id}">${g ? `${esc(g.name)}のケースに使う` : '使う'}</button>`
          : `<button class="act primary" data-action="buyCage" data-kind="${kind}" data-id="${id}" ${S.coins < v.price ? 'disabled' : ''}>${v.price} コインで買う${g ? `（${esc(g.name)}のケースに使う）` : ''}</button>`;
      }
      openSheet(`<div class="item-preview">
        ${thumb(kind, id, 'big')}
        <h3 class="sheet-title">${v.name}</h3>
        <p>${v.desc}</p>
        <p class="muted small">${info}</p>
        <div class="sheet-actions">${btn}<button class="act" data-action="closeSheet">とじる</button></div>
      </div>`);
      fillThumbs();
    },
    buyDecor(t) {
      const d = L3.DECOR[t.dataset.t];
      if (!d || S.coins < d.price) { toast('コインが足りません'); return; }
      S.coins -= d.price;
      S.decorInv[t.dataset.t] = (S.decorInv[t.dataset.t] || 0) + 1;
      sfx('buy');
      toast(`${d.name}を買いました。ケースの「もようがえ」で置けます`);
      if (t.closest && t.closest('#sheet')) closeSheet();
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
    // 自動の記録には写真をつけない（写真はカメラで撮ったものだけ）
    albumOf(g).entries.push(e);
  }
  const fmtDate = t => { const d = new Date(t); return `${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const ageText = g => { const d = Math.floor((Date.now() - g.born) / 86400000); return d < 1 ? 'きょう' : `${d}日目`; };
  function openAlbum(id) {
    const g = S.geckos.find(x => x.id === id);
    // アルバムができる前から暮らしている子は、ここでアルバムを作る
    if (g && !(S.albums && S.albums[id])) { memo(g, 'アルバムをはじめた', true); save(); }
    const a = S.albums && S.albums[id];
    if (!a) { toast('アルバムが見つかりませんでした'); return; }
    const photos = a.entries.filter(e => e.img || e.pid).length;
    openSheet(`<p class="eyebrow">成長記録アルバム</p>
      <h3 class="sheet-title">${esc(a.name)} <span class="sex ${a.sex}">${a.sex === 'M' ? '♂' : '♀'}</span></h3>
      <p class="muted small">${esc(a.morph || '')}${g ? ` ・ いっしょに暮らして ${ageText(g)}` : ' ・ 旅立ちました'}</p>
      ${g ? `<button class="act primary" data-action="snapPhoto" data-id="${id}" ${photos >= MAX_PHOTOS ? 'disabled' : ''}>いまの様子を写真にとる（${photos}/${MAX_PHOTOS}）</button>` : ''}
      <ol class="album">${a.entries.slice().reverse().map((e, i) => {
        const idx = a.entries.length - 1 - i;
        const src = getPhoto(e);
        const pic = src ? `<img src="${src}" alt="">` : '';
        return `<li class="album-item${src ? ' photo' : ''}">
          ${pic ? `<div class="album-pic">${pic}</div>` : ''}
          <div class="album-text"><small class="muted">${fmtDate(e.t)}</small><span>${esc(e.text)}</span>
          ${src ? `<button class="link-btn" data-action="delPhoto" data-id="${id}" data-i="${idx}">この写真を消す</button>` : ''}</div>
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
    album(t) { openAlbum(t.dataset.id || S.selected); bonusDone('album'); },
    snapPhoto(t) {
      const g = S.geckos.find(x => x.id === t.dataset.id);
      if (!g || !tank) return;
      bonusDone('photo');
      const a = albumOf(g);
      if (a.entries.filter(e => e.img || e.pid).length >= MAX_PHOTOS) return;
      closeSheet();
      if (view !== 'case' || S.selected !== g.id) { S.selected = g.id; switchView('case'); }
      // シートが閉じて画面が落ちついてから撮る
      setTimeout(() => {
        let img;
        try { img = tank.snapshot(); } catch (e) { toast('写真をとれませんでした'); return; }
        let pid;
        try { pid = putPhoto(img); } catch (err) { toast('保存できる写真がいっぱいです。いらない写真を消してね'); return; }
        a.entries.push({ t: Date.now(), text: `${stageOf(g) === 'baby' ? 'ベビー' : stageOf(g) === 'young' ? 'ヤング' : 'アダルト'}のころの一枚`, pid });
        sfx('tap');
        try { save(); } catch (e) { /* 保存がいっぱいでも遊べる */ }
        toast('アルバムに写真を追加しました');
        openAlbum(g.id);
      }, 450);
    },
    delPhoto(t) {
      const a = S.albums && S.albums[t.dataset.id];
      const i = Number(t.dataset.i);
      if (!a || !a.entries[i] || !(a.entries[i].img || a.entries[i].pid)) return;
      dropPhoto(a.entries[i]);
      a.entries.splice(i, 1);
      save();
      openAlbum(t.dataset.id);
    },
  });

  // ======================================================
  // セーブデータの書き出し・読み込み（控え）
  // 形式: "LEOPA1:" + 圧縮した JSON（base64）+ ":" + 検査用の数字
  // ======================================================
  function checksum(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
  async function gzipB64(text) {
    const bytes = new TextEncoder().encode(text);
    let out = bytes;
    if (window.CompressionStream) {
      const cs = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
      out = new Uint8Array(await new Response(cs).arrayBuffer());
    }
    let bin = ''; for (let i = 0; i < out.length; i += 8192) bin += String.fromCharCode.apply(null, out.subarray(i, i + 8192));
    return { b64: btoa(bin), gz: !!window.CompressionStream };
  }
  async function ungzipB64(b64, gz) {
    while (b64.length % 4) b64 += '=';
    const bin = atob(b64), bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    if (!gz) return new TextDecoder().decode(bytes);
    const ds = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new TextDecoder().decode(await new Response(ds).arrayBuffer());
  }
  async function exportSave() {
    saveNow();
    const photos = {};
    for (const a of Object.values(S.albums || {})) for (const e of a.entries) if (e.pid) { const d = getPhoto(e); if (d) photos[e.pid] = d; }
    const json = JSON.stringify({ app: 'leopa', at: Date.now(), save: S, photos });
    const { b64, gz } = await gzipB64(json);
    // 「+」「/」「=」はアプリによって変わりやすいので、使わない形にする
    const safe = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return 'LEOPA2:' + (gz ? 'g' : 'p') + ':' + safe + ':' + checksum(safe);
  }
  // 読みこんで中身をたしかめる（まだ上書きしない）
  // メモ帳やメッセージアプリを通すと、全角の「：」に変わったり、前後に別の文字や改行・見えない文字が
  // 入ったり、「+」が空白に変わったりするので、できるだけ元に戻してから読む
  async function parseBackup(raw) {
    const norm = String(raw || '').normalize('NFKC').replace(/[\u200B-\u200D\u2060\uFEFF]/g, '');
    const cands = [norm.replace(/\s+/g, ''), norm.replace(/ /g, '+').replace(/\s+/g, '')];
    let found = null, broken = false;
    for (const text of cands) {
      const m = text.match(/LEOPA[12]:([gp]):([A-Za-z0-9+/=_-]+):([0-9a-z]+)/i);
      if (!m) continue;
      const kind = m[1].toLowerCase(), b64 = m[2], sum = m[3].toLowerCase();
      if (checksum(b64) !== sum) { broken = true; continue; }
      found = { kind, b64 };
      break;
    }
    if (!found) {
      if (broken) throw new Error('文字が一部こわれています。もう一度コピーしてみてください');
      if (/LEOPA/i.test(norm)) throw new Error('文字が途中で切れているようです。最後までコピーできているか確かめてください');
      if (/[A-Za-z0-9+/_-]{200,}/.test(norm)) throw new Error('控えの先頭（LEOPA…）が欠けているようです。「コピーする」ボタンで全部をコピーしてください');
      throw new Error('「レオパといっしょ」の控えではないようです');
    }
    let obj;
    try { obj = JSON.parse(await ungzipB64(found.b64.replace(/-/g, '+').replace(/_/g, '/'), found.kind === 'g')); } catch (e) { throw new Error('控えをひらけませんでした'); }
    if (!obj || obj.app !== 'leopa' || !obj.save || !Array.isArray(obj.save.geckos) || !(obj.save.v === 1 || obj.save.v === 2)) throw new Error('この控えは読みこめません');
    return obj;
  }
  let pendingBackup = null;
  function backupSheet(msg) {
    openSheet(`<p class="eyebrow">セーブデータ</p>
      <h3 class="sheet-title">控えをとる・もどす</h3>
      <p class="muted small">レオパ・卵・図鑑・家具・アルバムの写真まで、ぜんぶ1つの文字にして控えをとれます。アイコンを入れ直すときや、機種変更のときに、そのまま復元できます。</p>
      ${msg ? `<p class="notice">${esc(msg)}</p>` : ''}
      <button class="act primary" data-action="bkExport">控えをつくる</button>
      <div id="bkOut"></div>
      <div class="label" style="margin-top:6px">控えからもどす</div>
      <textarea id="bkIn" class="bk-text" rows="3" placeholder="コピーした控えの文字をここに貼りつけ" spellcheck="false" autocomplete="off"></textarea>
      <div class="actions"><button class="act" data-action="bkCheck">この文字を確かめる</button><button class="act" data-action="bkFile">ファイルをえらぶ</button></div>
      <input type="file" id="bkFile" accept=".txt,.leopa,text/plain" hidden>
      <div id="bkPreview"></div>
      <button class="act ghost" data-action="closeSheet">とじる</button>`);
    const f = $('#bkFile');
    if (f) f.addEventListener('change', async () => { const file = f.files[0]; if (file) { $('#bkIn').value = (await file.text()).trim(); ACTIONS.bkCheck(); } });
  }
  function bkPreview(obj) {
    const sv = obj.save, n = Object.keys(obj.photos || {}).length;
    const at = obj.at ? new Date(obj.at) : null;
    return `<div class="card bk-card"><b>この控えの中身</b>
      <div class="bk-rows"><span>レオパ</span><b>${sv.geckos.length}匹</b><span>コイン</span><b>${sv.coins || 0}</b><span>図鑑</span><b>${G.DEX.filter(d => (sv.dex || {})[d.id]).length} / ${G.DEX.length}</b><span>アルバムの写真</span><b>${n}枚</b>${at ? `<span>控えをとった日</span><b>${at.getMonth() + 1}月${at.getDate()}日 ${at.getHours()}:${String(at.getMinutes()).padStart(2, '0')}</b>` : ''}</div>
      <p class="notice">もどすと、<b>いまのデータはこの控えで置きかわります</b>。いまのデータを残したいときは、先に「控えをつくる」でとっておいてください。</p>
      <button class="act danger" data-action="bkRestore">この控えでもどす</button></div>`;
  }
  Object.assign(ACTIONS, {
    backup() { backupSheet(); },
    async bkExport() {
      const out = $('#bkOut');
      out.innerHTML = '<p class="muted small">作っています…</p>';
      let text;
      try { text = await exportSave(); } catch (e) { out.innerHTML = '<p class="notice">控えをつくれませんでした</p>'; return; }
      const kb = Math.round(text.length / 1024);
      out.innerHTML = `<textarea id="bkOutText" class="bk-text" rows="3" readonly spellcheck="false">${text}</textarea>
        <p class="muted small">${kb >= 1024 ? (kb / 1024).toFixed(1) + 'MB' : kb + 'KB'}・レオパ ${S.geckos.length}匹ぶん。長い文字なので、メモ帳やメッセージアプリに貼って、とっておいてね。iPhone は「ファイルに保存」→ 共有メニューの「"ファイル"に保存」で、保存する場所を選べます。</p>
        <div class="actions"><button class="act" data-action="bkCopy">コピーする</button><button class="act" data-action="bkSave">ファイルに保存</button></div>`;
      window._bkText = text;
    },
    async bkCopy() {
      const text = window._bkText;
      if (!text) return;
      try { await navigator.clipboard.writeText(text); toast('コピーしました'); return; } catch (e) { /* 下で選択にきりかえ */ }
      const ta = $('#bkOutText');
      if (ta) { ta.focus(); ta.select(); try { document.execCommand('copy'); toast('コピーしました'); return; } catch (e) { /* noop */ } }
      toast('文字を長押しして、コピーしてください');
    },
    bkSave() {
      const text = window._bkText;
      if (!text) return;
      const d = new Date();
      const name = `leopa-save-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.txt`;
      // iPhone などは共有メニューから「"ファイル"に保存」を選ぶのがいちばん確実（ホーム画面のアプリでも動く）
      let file = null;
      try { file = new File([text], name, { type: 'text/plain' }); } catch (e) { /* 古いブラウザ */ }
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: 'レオパといっしょ の控え' })
          .then(() => toast('控えのファイルを保存しました'))
          .catch(e => { if (e && e.name !== 'AbortError') toast('保存できませんでした。「コピーする」を使ってください'); });
        return;
      }
      try {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
        a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        toast('ファイルを保存しました（ダウンロードの中）');
      } catch (e) { toast('ファイルにできませんでした。コピーを使ってください'); }
    },
    bkFile() { const f = $('#bkFile'); if (f) f.click(); },
    async bkCheck() {
      const box = $('#bkPreview');
      try { pendingBackup = await parseBackup($('#bkIn').value); box.innerHTML = bkPreview(pendingBackup); }
      catch (e) { pendingBackup = null; box.innerHTML = `<p class="notice">${esc(e.message)}</p>`; }
    },
    async bkRestore() {
      const obj = pendingBackup;
      if (!obj) return;
      try {
        // この画面の保存を止めてから置きかえる（閉じるときの自動保存で、戻したデータが上書きされないように）
        saveLocked = true;
        if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
        // 写真を先に戻してから、本体を置きかえる（途中で失敗したら、いまのデータは変えない）
        const old = Object.keys(localStorage).filter(k => k.startsWith('leopa-photo-'));
        const keep = {};
        for (const k of old) keep[k] = localStorage.getItem(k);
        try {
          old.forEach(k => localStorage.removeItem(k));
          for (const [pid, data] of Object.entries(obj.photos || {})) localStorage.setItem(PHOTO_KEY(pid), data);
          localStorage.setItem(SAVE_KEY, JSON.stringify(obj.save));
        } catch (e) {
          Object.keys(localStorage).filter(k => k.startsWith('leopa-photo-')).forEach(k => localStorage.removeItem(k));
          for (const [k, v] of Object.entries(keep)) { try { localStorage.setItem(k, v); } catch (err) { /* noop */ } }
          throw e;
        }
        lastStamp = Date.now();
        localStorage.setItem(STAMP_KEY, JSON.stringify({ id: INSTANCE, at: lastStamp }));
        location.reload();
      } catch (e) {
        saveLocked = false;
        toast('もどせませんでした（保存できる量をこえたかもしれません）。いまのデータはそのままです');
      }
    },
  });

  // ======================================================
  // 体重（グラム）
  // 成長に合わせて、ベビー 3g → ヤング 20g → アダルト 45〜70g。個体差・性別・おなか・しっぽ・抱卵で変わる。
  // ======================================================
  function bodyBase(g) {
    const t = clamp(g.growth / GROWTH.max, 0, 1);
    // 成長のS字カーブ（ベビーは小さく、ヤングで伸び、おとなでゆるやかに）
    const curve = t < 0.19 ? 3 + (t / 0.19) * 7 : t < 0.54 ? 10 + ((t - 0.19) / 0.35) * 20 : 30 + Math.pow((t - 0.54) / 0.46, 0.8) * 26;
    const sexMul = g.sex === 'M' ? 1.12 : 0.94;
    const seedMul = 0.92 + (Math.abs(g.seed || 0) % 1000) / 1000 * 0.16; // 個体差 ±8%
    return curve * sexMul * seedMul;
  }
  function weightOf(g) {
    let w = bodyBase(g);
    w *= 0.93 + (g.hunger / 100) * 0.1;
    w *= 0.92 + condOf(g) / 100 * 0.16;                       // しっぽの栄養（ほっそり〜ぽっちゃり）                       // おなかが空くと軽く、満腹だと少し重く
    if (g.gravid) w *= 1.18;                                   // 卵のぶん
    return Math.round(w * 10) / 10;
  }
  function weightLog(g) {
    const log = g.wlog || (g.wlog = []);
    return log;
  }
  // 1日1回、その日の体重を記録する（同じ日は上書き）
  function recordWeight(g, now) {
    const day = new Date(now); const key = `${day.getFullYear()}-${day.getMonth() + 1}-${day.getDate()}`;
    const log = weightLog(g), w = weightOf(g);
    if (log.length && log[log.length - 1].d === key) log[log.length - 1].w = w;
    else { log.push({ d: key, t: now, w }); if (log.length > 90) log.shift(); }
  }
  function weightChart(g) {
    const log = weightLog(g).slice(-30);
    const cur = weightOf(g);
    if (log.length < 2) return '';
    const pts = log.concat([{ t: Date.now(), w: cur, now: true }]);
    const W = 300, H = 90, pad = 8;
    const ws = pts.map(p => p.w), lo = Math.min(...ws) * 0.9, hi = Math.max(...ws) * 1.08 + 0.1;
    const X = i => pad + (W - pad * 2) * (pts.length === 1 ? 0.5 : i / (pts.length - 1));
    const Y = w => H - pad - (H - pad * 2) * ((w - lo) / (hi - lo));
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(p.w).toFixed(1)}`).join(' ');
    const area = `${line} L${X(pts.length - 1).toFixed(1)} ${H - pad} L${X(0).toFixed(1)} ${H - pad} Z`;
    return `<svg class="wchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="体重の記録">
      <path d="${area}" fill="var(--accent)" opacity=".16"/><path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="${X(pts.length - 1).toFixed(1)}" cy="${Y(cur).toFixed(1)}" r="4" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/></svg>`;
  }
  // ======================================================
  // けんこうチェック：しっぽの太さ・体重の変化・食欲・脱皮・温度・ケースのきれいさ
  // ======================================================
  function healthCard(g) {
    const c = condOf(g), now = Date.now();
    const tail = c < 30 ? ['ほっそり', 'warn', 'ごはんを少し多めにあげよう'] : c < 45 ? ['すこし細め', 'info', 'コオロギやデュビアをしっかりあげよう'] : c <= 72 ? ['ちょうどいい', 'good', ''] : c <= 85 ? ['ぷっくり', 'good', 'しっぽに栄養がたっぷり'] : ['ぽっちゃり', 'warn', 'ミルワームはおやつ程度に。コオロギ中心がおすすめ'];
    const log = weightLog(g);
    const wk = log.length > 1 ? log[Math.max(0, log.length - 8)] : null;
    const dw = wk ? Math.round((weightOf(g) - wk.w) * 10) / 10 : null;
    const wtxt = dw == null ? ['記録中', 'muted'] : dw > 0.2 ? [`ふえている（+${dw}g）`, 'good'] : dw < -0.5 ? [`へっている（${dw}g）`, 'warn'] : ['安定', 'good'];
    const app = g.hunger >= 60 ? ['まんぷく', 'good'] : g.hunger >= 25 ? ['ふつう', 'good'] : ['おなかぺこぺこ', 'warn'];
    const sp = g.shedUntil ? shedProgress(g, now) : -1;
    const shed = sp < 0 ? [`順調（これまで${g.sheds || 0}回）`, 'good'] : sp < 0.6 ? ['もうすぐ脱皮（白っぽい）', 'info'] : ['いま脱皮中', 'info'];
    const h = heatInfo(heatOf(g));
    const heat = [h.label, h.cls === 'good' ? 'good' : 'warn'];
    const room = g.clean >= 60 && !g.poop ? ['きれい', 'good'] : g.clean >= 35 ? ['まあまあ', 'info'] : ['おそうじしよう', 'warn'];
    const rows = [['しっぽの太さ', tail], ['体重の変化（1週間）', wtxt], ['食欲', app], ['脱皮', shed], ['温度', heat], ['ケース', room]];
    const bad = rows.filter(r => r[1][1] === 'warn').length;
    const sum = bad === 0 ? 'とても元気です' : bad === 1 ? 'おおむね元気です' : 'ちょっと気にしてあげよう';
    const tips = [tail[2], app[1] === 'warn' ? 'ごはんをあげよう' : '', room[1] === 'warn' ? 'ケースをおそうじしよう' : '', heat[1] === 'warn' ? 'ヒーターの温度を見なおそう（暖かい側31〜33℃）' : ''].filter(Boolean);
    return `<details class="health"${openHealth[g.id] ? ' open' : ''} data-id="${g.id}">
      <summary><span>けんこうチェック</span><span class="pill ${bad ? 'warn' : 'good'}">${sum}</span></summary>
      <div class="health-rows">${rows.map(([k, [v, cls]]) => `<span>${k}</span><b class="hv ${cls}">${v}</b>`).join('')}</div>
      ${tips.length ? `<p class="small">アドバイス：${tips.join('。')}。</p>` : '<p class="muted small">このままの暮らしで大丈夫。</p>'}
    </details>`;
  }
  const openHealth = {};
  document.addEventListener('toggle', e => { const d = e.target; if (d.classList && d.classList.contains('health')) openHealth[d.dataset.id] = d.open; }, true);
  function weightCard(g) {
    const log = weightLog(g), cur = weightOf(g);
    const first = log.length ? log[0] : null;
    const prev = log.length > 1 ? log[log.length - 2].w : null;
    const diff = prev != null ? Math.round((cur - prev) * 10) / 10 : null;
    const st = stageOf(g);
    const guide = st === 'adult' ? (g.sex === 'M' ? '60〜80g' : '45〜65g') : st === 'young' ? '10〜30g' : '3〜10g';
    return `<div class="wbox"><div class="wmain"><small class="muted">体重</small><b>${cur}<small>g</small></b>
        ${diff != null && diff !== 0 ? `<span class="pill ${diff > 0 ? 'good' : 'warn'}">きのうより ${diff > 0 ? '＋' : ''}${diff}g</span>` : '<span class="pill">ふつう</span>'}</div>
      ${weightChart(g)}
      <p class="muted small">${first ? `はじめて量ったのは ${first.w}g。` : ''}${STAGE_LABEL[st]}の目安は ${guide} です。</p></div>`;
  }

  // ======================================================
  // カメラ：好きな角度にしてシャッター → 名前と日付つきの写真に。アルバムに残す／スマホに保存
  // ======================================================
  let shot = null; // { img(dataUrl), id }
  function cameraSheet(g) {
    const sc = $('#tank');
    if (tank) tank.setClose(true);
    const bar = $('#camBar');
    if (bar) bar.remove();
    const el = document.createElement('div');
    el.id = 'camBar';
    el.className = 'cam-bar';
    el.innerHTML = `<button class="act" data-action="camCancel">やめる</button><button class="shutter" data-action="camShoot" aria-label="シャッター"><span></span></button><div class="cam-hint">ドラッグで回して、2本の指で拡大。きまったら ◎</div>`;
    sc.appendChild(el);
    sc.scrollIntoView({ block: 'center', behavior: 'smooth' });
    sc.classList.add('camera-on');
    window._camGecko = g.id;
  }
  function camClose() {
    const bar = $('#camBar'); if (bar) bar.remove();
    const sc = $('#tank'); if (sc) sc.classList.remove('camera-on');
  }
  function stamp(dataUrl, g) {
    return new Promise(res => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const x = c.getContext('2d'); x.drawImage(img, 0, 0);
        const h = Math.round(c.height * 0.13);
        const grad = x.createLinearGradient(0, c.height - h * 1.4, 0, c.height);
        grad.addColorStop(0, 'rgba(30,22,10,0)'); grad.addColorStop(0.45, 'rgba(30,22,10,.55)'); grad.addColorStop(1, 'rgba(30,22,10,.8)');
        x.fillStyle = grad; x.fillRect(0, c.height - h * 1.4, c.width, h * 1.4);
        x.textBaseline = 'alphabetic'; x.fillStyle = '#FFFFFF';
        const d = new Date();
        const pad = Math.round(h * 0.34);
        x.font = `700 ${Math.round(h * 0.4)}px "Zen Maru Gothic","Hiragino Maru Gothic ProN",sans-serif`;
        x.fillText(`${g.name} ${g.sex === 'M' ? '♂' : '♀'}  ${weightOf(g)}g`, pad, c.height - h * 0.42);
        x.font = `500 ${Math.round(h * 0.26)}px "Zen Maru Gothic","Hiragino Maru Gothic ProN",sans-serif`;
        x.fillStyle = 'rgba(255,255,255,.85)';
        x.fillText(`${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}  レオパといっしょ`, pad, c.height - h * 0.12);
        res(c.toDataURL('image/jpeg', 0.85));
      };
      img.src = dataUrl;
    });
  }
  Object.assign(ACTIONS, {
    camera() { const g = selected(); if (!g || !tank) return; cameraSheet(g); },
    camCancel() { camClose(); if (tank) tank.setClose(false); },
    async camShoot() {
      const g = S.geckos.find(x => x.id === window._camGecko);
      if (!g || !tank) { camClose(); return; }
      let raw;
      try { raw = tank.snapshot(1200, false); } catch (e) { toast('写真をとれませんでした'); return; }
      camClose();
      tank.setClose(false);
      sfx('tap');
      const img = await stamp(raw, g);
      shot = { img, id: g.id };
      openSheet(`<p class="eyebrow">撮影</p><h3 class="sheet-title">いい写真がとれました</h3>
        <div class="shot-view"><img src="${img}" alt="${esc(g.name)}の写真"></div>
        <div class="actions"><button class="act primary" data-action="shotAlbum">アルバムに残す</button><button class="act" data-action="shotSave">スマホに保存</button></div>
        <button class="act ghost" data-action="closeSheet">とじる</button>`);
    },
    shotAlbum() {
      const g = S.geckos.find(x => x.id === (shot && shot.id)); if (!g) return;
      const a = albumOf(g);
      if (a.entries.filter(e => e.img || e.pid).length >= MAX_PHOTOS) { toast(`アルバムは${MAX_PHOTOS}枚までです。いらない写真を消してね`); return; }
      let pid;
      try { pid = putPhoto(shot.img); } catch (err) { toast('保存できる写真がいっぱいです'); return; }
      a.entries.push({ t: Date.now(), text: `${weightOf(g)}g のころの一枚`, pid });
      save(); toast('アルバムに残しました'); sfx('coin'); closeSheet();
    },
    async shotSave() {
      if (!shot) return;
      const g = S.geckos.find(x => x.id === shot.id);
      const name = `leopa-${(g ? g.name : 'photo')}-${Date.now()}.jpg`;
      try {
        const blob = await (await fetch(shot.img)).blob();
        const file = new File([blob], name, { type: 'image/jpeg' });
        // スマホなら共有メニュー（「画像を保存」を選べる）。使えないときは、ダウンロード
        if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'レオパといっしょ' }); return; }
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        toast('写真を保存しました（ダウンロードの中）');
      } catch (e) {
        if (e && e.name === 'AbortError') return;
        toast('保存できませんでした。写真を長押しして、保存してください');
      }
    },
  });

  // ======================================================
  // 誕生日・お迎え日・節目の記録
  // ======================================================
  const DAY = 86400000;
  const dkey = t => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  const fmtDay = t => { const d = new Date(t); return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`; };
  // 成長から、おおよその生後日数を逆算する（ショップの子は、いつ生まれたか分からないため）
  const estAgeDays = growth => Math.round(3 + growth * 1.2);
  function ensureDates(g) {
    if (!g.adopted) g.adopted = g.born || Date.now();
    if (!g.birthday) {
      // これまでの子：お迎え日の時点の成長から逆算（卵からかえった子は生後0日）
      g.birthday = g.hatched ? g.adopted : g.adopted - estAgeDays(g.growth0 != null ? g.growth0 : g.growth) * DAY;
      if (g.hatched == null && g.gen > 1) g.birthday = g.adopted;
      g.birthEst = !(g.gen > 1 || g.hatched);
    }
  }
  const yearsOld = g => { const b = new Date(g.birthday), n = new Date(); let y = n.getFullYear() - b.getFullYear(); if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) y--; return Math.max(0, y); };
  const livedDays = g => Math.max(0, Math.floor((Date.now() - g.adopted) / DAY));
  const ageDays = g => Math.max(0, Math.floor((Date.now() - g.birthday) / DAY));
  function ageLabel(g) {
    const d = ageDays(g);
    if (d < 60) return `生後${d}日`;
    const m = Math.floor(d / 30.4);
    return m < 12 ? `生後${m}か月` : `${Math.floor(m / 12)}歳${m % 12 ? m % 12 + 'か月' : ''}`;
  }
  function datesCard(g) {
    ensureDates(g);
    const next = nextAnniv(g);
    return `<div class="dates">
      <div><small class="muted">お迎え日</small><b>${fmtDay(g.adopted)}</b><span>いっしょに ${livedDays(g)} 日目</span></div>
      <div><small class="muted">${g.birthEst ? '誕生日（推定）' : '誕生日'}</small><b>${fmtDay(g.birthday)}</b><span>${ageLabel(g)}</span></div>
      ${next ? `<p class="muted small">${next}</p>` : ''}</div>`;
  }
  function nextAnniv(g) {
    const b = new Date(g.birthday); const now = new Date();
    let n = new Date(now.getFullYear(), b.getMonth(), b.getDate());
    if (n < new Date(now.getFullYear(), now.getMonth(), now.getDate())) n = new Date(now.getFullYear() + 1, b.getMonth(), b.getDate());
    const left = Math.round((n - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / DAY);
    return left === 0 ? '今日は誕生日です！' : left <= 30 ? `誕生日まであと ${left} 日` : '';
  }

  // ---- 節目：いちど記録したら二度と出ない（g.mile に覚える）
  const WEIGHT_MILES = [10, 20, 30, 50, 70];
  const DAY_MILES = [7, 30, 100, 365];
  function mile(g, id, text, withLook, toastText) {
    g.mile = g.mile || {};
    if (g.mile[id]) return false;
    g.mile[id] = Date.now();
    memo(g, text, withLook);
    if (toastText) toast(toastText);
    return true;
  }
  function checkMilestones(g) {
    ensureDates(g);
    const w = weightOf(g);
    for (const m of WEIGHT_MILES) if (w >= m) mile(g, 'w' + m, `体重が ${m}g をこえた！`, true, `${g.name}の体重が ${m}g をこえました`);
    const d = livedDays(g);
    for (const m of DAY_MILES) if (d >= m) mile(g, 'd' + m, `いっしょに暮らして ${m} 日になった`, true, `${g.name}と暮らして ${m} 日！`);
  }
  // 一日のはじめに、誕生日とお迎え記念日をお祝い
  function checkCelebrations() {
    const today = dkey(Date.now()), list = [];
    S.celebrated = S.celebrated || {};
    for (const g of S.geckos) {
      ensureDates(g);
      const b = new Date(g.birthday), n = new Date();
      if (b.getMonth() === n.getMonth() && b.getDate() === n.getDate() && yearsOld(g) >= 1 && S.celebrated[g.id + 'b' + n.getFullYear()] == null) {
        S.celebrated[g.id + 'b' + n.getFullYear()] = today;
        list.push({ g, title: `${g.name}、お誕生日おめでとう！`, sub: `${yearsOld(g)}歳になりました`, coins: 50 + 30 * yearsOld(g), memo: `${yearsOld(g)}歳の誕生日をむかえた` });
      }
      const d = livedDays(g);
      for (const [days, label, coins] of [[100, '100日', 40], [365, '1周年', 120], [730, '2周年', 200]]) {
        if (d === days && S.celebrated[g.id + 'a' + days] == null) {
          S.celebrated[g.id + 'a' + days] = today;
          list.push({ g, title: `${g.name}と暮らして${label}！`, sub: `お迎えしたのは ${fmtDay(g.adopted)}`, coins, memo: `お迎え${label}をお祝いした` });
        }
      }
    }
    return list;
  }
  function celebrate(list) {
    const c = list.shift();
    if (!c) return;
    S.coins += c.coins;
    memo(c.g, c.memo, true);
    window._celebQueue = list;
    sfx('hatch');
    openSheet(`<div class="party"><div class="confetti" aria-hidden="true">${Array.from({ length: 24 }, (_, i) => `<i style="--x:${(i * 41) % 100}%;--d:${(i % 6) * 0.25}s;--c:${['#E3A82B', '#E68FA8', '#82B4D0', '#82BE84'][i % 4]}"></i>`).join('')}</div>
      <div class="reveal-art">${portrait(c.g, stageOf(c.g), c.g.name)}</div>
      <h3 class="morph big">${esc(c.title)}</h3><p class="muted">${esc(c.sub)}</p>
      <p><b>お祝いに ${c.coins} コイン</b></p>
      <button class="act primary" data-action="celebNext">${list.length ? 'つぎへ' : 'ありがとう！'}</button></div>`);
    save();
  }
  Object.assign(ACTIONS, { celebNext() { closeSheet(); const q = window._celebQueue || []; if (q.length) setTimeout(() => celebrate(q), 250); } });

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
    toggleMusic() {
      S.musicOff = !S.musicOff;
      if (S.musicOff) window.LeopaMusic && LeopaMusic.stop(); else musicOn();
      toast(S.musicOff ? '音楽をオフにしました' : `音楽「${LeopaMusic.title}」をオンにしました`);
      renderView(); save();
    },
  });

  // ---------- BGM（最初に画面をさわったときから流れる。音量はひかえめ）
  const MUSIC_VOL = 0.45;
  // 時間帯ごとの曲：朝 5〜8時、昼 8〜16時、夕方 16〜19時、夜はそれ以外
  const songKey = () => { const h = clockNow(); return h >= 5 && h < 8 ? 'morning' : h >= 8 && h < 16 ? 'day' : h >= 16 && h < 19 ? 'evening' : 'night'; };
  function musicOn() { if (window.LeopaMusic && S && !S.musicOff && !document.hidden) LeopaMusic.start(MUSIC_VOL, songKey()); }
  // 画面が落ちついたころに、今の時間帯の曲をあらかじめ作っておく（最初のタップで待たないように）
  setTimeout(() => { if (window.LeopaMusic && !S.musicOff) LeopaMusic.preload(songKey()); }, 4000);
  document.addEventListener('pointerdown', musicOn, { passive: true });
  document.addEventListener('visibilitychange', () => { if (!window.LeopaMusic) return; if (document.hidden) LeopaMusic.stop(); else if (LeopaMusic.ctxUsed) musicOn(); });

  // ヒーターの操作
  Object.assign(ACTIONS, {
    heater: heaterSheet,
    heatUp() { const g = selected(); if (g && heatOf(g) < HEAT_MAX) { g.heat = heatOf(g) + 1; save(); renderView(); heaterSheet(); } },
    heatDown() { const g = selected(); if (g && heatOf(g) > HEAT_MIN) { g.heat = heatOf(g) - 1; save(); renderView(); heaterSheet(); } },
  });

  // ---------- 全画面でレオパを見る（スマホを横にしても見られる）
  const isFull = () => document.body.classList.contains('full-view');
  function setFull(on) {
    document.body.classList.toggle('full-view', on);
    const rot = $('#fullRotate');
    if (rot) rot.hidden = !(on && screen.orientation && screen.orientation.lock);
    if (on) {
      const el = document.documentElement;
      if (el.requestFullscreen && !document.fullscreenElement) el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    } else {
      if (screen.orientation && screen.orientation.unlock) try { screen.orientation.unlock(); } catch (e) { /* noop */ }
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    }
    window.scrollTo(0, 0);
  }
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && isFull()) setFull(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && isFull() && $('#sheet').hidden) setFull(false); });
  Object.assign(ACTIONS, {
    fullView() { setFull(!isFull()); },
    fullRotate(t) {
      const o = screen.orientation;
      if (!o || !o.lock) return;
      const land = /landscape/.test(o.type);
      o.lock(land ? 'portrait' : 'landscape').then(() => { t.textContent = land ? '横向き' : '縦向き'; }).catch(() => toast('この端末では、スマホを横にすると横画面になります'));
    },
  });

  // ---------- ホーム画面に追加する案内
  let installEvt = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (S) renderView(); });
  window.addEventListener('appinstalled', () => { installEvt = null; toast('ホーム画面に追加しました！'); if (S) { S.installHide = Infinity; save(); renderView(); } });
  const inFrame = (() => { try { return window.top !== window.self; } catch (e) { return true; } })();
  const isStandalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  const UA = navigator.userAgent;
  const isIOS = /iP(hone|ad|od)/.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1);
  function installCard() {
    if (inFrame || isStandalone() || !S.welcomed || tutStep() >= 0 || (S.installHide || 0) > Date.now()) return '';
    return `<div class="card install">
      <img src="icons/icon-192.png" alt="" width="48" height="48">
      <div><b>ホーム画面に追加しよう</b><small>アプリのように全画面で遊べて、通知も使えるようになります</small></div>
      <div class="install-btns"><button class="act primary sm" data-action="installMenu">追加する</button><button class="act ghost sm" data-action="installLater">あとで</button></div>
    </div>`;
  }
  function installSheet() {
    const step = (n, html) => `<li><span class="step-n">${n}</span><span>${html}</span></li>`;
    const share = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11H5v10h14V11h-1"/></svg>';
    const how = isIOS
      ? `<ol class="steps">${step(1, '<b>Safari</b> でこのページを開きます（ほかのアプリの中で開いているときは、Safari で開き直してね）')}${step(2, `画面の下（または上）にある <b>共有ボタン</b> ${share} をタップ`)}${step(3, 'メニューを下にスクロールして <b>「ホーム画面に追加」</b> をタップ')}${step(4, '右上の <b>「追加」</b> をタップしたら完成！')}</ol>`
      : `<ol class="steps">${step(1, '<b>Chrome</b> などのブラウザでこのページを開きます')}${step(2, '右上の <b>︙（メニュー）</b> をタップ')}${step(3, '<b>「ホーム画面に追加」</b> または <b>「アプリをインストール」</b> をタップ')}${step(4, '<b>「追加」</b>（インストール）をタップしたら完成！')}</ol>`;
    openSheet(`<h3 class="sheet-title">ホーム画面に追加する</h3>
      <p class="small">ホーム画面のアイコンから、アプリのように全画面で遊べます。電波がないところでも遊べて、通知も使えるようになります。</p>
      ${installEvt ? '<button class="act primary" data-action="installNow">いますぐ追加する</button><p class="muted small">うまくいかないときは、下の手順でも追加できます。</p>' : ''}
      ${how}
      <p class="muted small">セーブデータはそのまま引きつがれます（同じブラウザで開いたとき）。ブラウザを変えるときは「セーブデータの控え」で移してね。</p>
      <button class="act" data-action="closeSheet">とじる</button>`);
  }
  Object.assign(ACTIONS, {
    installMenu: installSheet,
    installNow() {
      if (!installEvt) { installSheet(); return; }
      const e = installEvt; installEvt = null;
      e.prompt();
      (e.userChoice || Promise.resolve()).then(() => { closeSheet(); renderView(); });
    },
    installLater() { S.installHide = Date.now() + 3 * DAYMS; save(); renderView(); },
  });

  // ---------- おしらせ（通知）と、留守のあいだのまとめ
  const canNotify = () => 'Notification' in window;
  function notify(tag, title, body) {
    if (!S.notify || !canNotify() || Notification.permission !== 'granted' || !document.hidden) return;
    const opt = { body, tag, icon: 'icons/icon-192.png', badge: 'icons/favicon-64.png' };
    if (navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.ready.then(r => r.showNotification(title, opt)).catch(() => {});
    else try { new Notification(title, opt); } catch (e) { /* noop */ }
  }
  function checkNotify(now) {
    S.nsent = S.nsent || {};
    for (const e of S.eggs) if (now >= e.hatchAt && !S.nsent[e.id]) { S.nsent[e.id] = 1; notify('egg', '卵がふ化しそう！', `${e.mom} × ${e.dad} の卵が、ふ化を待っています`); }
    for (const g of S.geckos) {
      const k = 'h' + g.id;
      if (g.hunger < 25) { if (!S.nsent[k]) { S.nsent[k] = 1; notify(k, `${g.name}がおなかぺこぺこ`, 'ごはんをあげに来てね'); } }
      else delete S.nsent[k];
    }
    for (const k of Object.keys(S.nsent)) if (k[0] === 'e' && !S.eggs.some(e => e.id === k)) delete S.nsent[k];
  }
  function awaySummary(since, now) {
    if (now - since < 20 * MIN || !S.welcomed) return;
    const out = [];
    const laid = S.eggs.filter(e => e.laidAt > since).length;
    if (laid) out.push(`卵が${laid}個産まれた`);
    const ready = S.eggs.filter(e => now >= e.hatchAt).length;
    if (ready) out.push(`${ready}個の卵がふ化を待っている`);
    const hungry = S.geckos.filter(g => g.hunger < 25).map(g => g.name);
    if (hungry.length) out.push(`${hungry.slice(0, 2).join('・')}${hungry.length > 2 ? 'たち' : ''}がおなかぺこぺこ`);
    const shed = S.geckos.filter(g => g.shedUntil).map(g => g.name);
    if (shed.length) out.push(`${shed[0]}${shed.length > 1 ? 'たち' : ''}が脱皮中`);
    if (out.length) setTimeout(() => toast('おかえりなさい！ ' + out.join('、')), 900);
  }
  function notifySheet() {
    const ok = canNotify(), perm = ok ? Notification.permission : 'unsupported';
    openSheet(`<h3 class="sheet-title">おしらせ通知</h3>
      <p class="small">卵がふ化しそうなときや、レオパのおなかが空いたときにお知らせします。</p>
      <p class="muted small">ブラウザのしくみ上、アプリを閉じてしばらくたつと通知が届かないことがあります（特に iPhone は、ホーム画面に追加したアプリでのみ使えます）。届かなかったぶんは、次に開いたときに「おかえりなさい」でまとめてお知らせします。</p>
      ${!ok ? '<p class="notice">この端末・ブラウザでは通知が使えません</p>'
        : perm === 'denied' ? '<p class="notice">通知がブロックされています。端末の設定から許可してください</p>'
        : isIOS && !isStandalone() ? '<p class="notice">iPhone では、先にホーム画面に追加すると通知が使えるようになります</p><button class="act primary" data-action="installMenu">ホーム画面に追加する方法</button>'
        : `<button class="act ${S.notify ? '' : 'primary'}" data-action="notifyToggle">${S.notify ? '通知をオフにする' : '通知をオンにする'}</button>`}
      <button class="act" data-action="closeSheet">とじる</button>`);
  }
  Object.assign(ACTIONS, {
    notifyMenu: notifySheet,
    notifyToggle() {
      if (S.notify) { S.notify = false; save(); notifySheet(); toast('通知をオフにしました'); return; }
      Notification.requestPermission().then(p => {
        S.notify = p === 'granted'; save(); notifySheet();
        toast(S.notify ? '通知をオンにしました' : '通知が許可されませんでした');
      });
    },
  });

  // ---------- 起動
  function tick() {
    const now = Date.now();
    simulate(now);
    tankCondition(selected());
    checkNotify(now);
    refreshOffers(now);
    refreshOrders(now);
    if (window.LeopaMusic) LeopaMusic.setSong(songKey());
    checkAch();
    renderView();
    // 裏に回っている画面は保存しない（前に出ている画面のデータを古いデータで上書きしないように）
    if (!document.hidden) save();
  }

  S = load();
  window.__leopaState = () => S; // 動作確認用
  // なくなった家具（コルクバーク）は代金をお返しする。シェルターが岩からテラコッタに変わったので1つプレゼント
  if (S && !S.decorV3) {
    S.decorV3 = true;
    let back = 0;
    for (const g of S.geckos) if (g.decor) { const n = g.decor.length; g.decor = g.decor.filter(d => L3.DECOR[d.t]); back += (n - g.decor.length) * 25; }
    for (const t of Object.keys(S.decorInv || {})) if (!L3.DECOR[t]) { back += (S.decorInv[t] || 0) * 25; delete S.decorInv[t]; }
    if (back) S.coins += back;
    if (S.geckos.length) S.decorInv.wet = (S.decorInv.wet || 0) + 1;
    S._decorNote = back;
  }
  window.__leopaTank = () => tank;
  if (!S) freshState();
  const awayFrom = S.lastTick;
  initTank();
  // 3D モデルが読みこめたら、レオパを差しかえる
  const hideLoading = () => { const el = $('#tankLoading'); if (el) el.classList.add('done'); };
  if (L3.supported && L3.loadKit) L3.loadKit('assets/decor-kit.bin').then(ok => { if (!ok) return; if (tank && tank.refreshDecor) tank.refreshDecor(); dexHTML = ''; const v = $('#view-shop'); if (v) v._html = ''; renderView(); });
  if (L3.supported && L3.loadModel) L3.loadModel('assets/gecko.glb').then(ok => { hideLoading(); if (ok) { dexHTML = ''; renderView(); } });
  else hideLoading();
  tick();
  awaySummary(awayFrom, Date.now());
  if (S._decorNote != null) { const b = S._decorNote; delete S._decorNote; if (S.geckos.length) setTimeout(() => toast(`家具が新しくなりました！ウェットシェルターを1つプレゼント${b ? `（コルクバークは${b}コインでお返ししました）` : ''}`), 1500); }
  setTimeout(() => { if (!S.welcomed || !S.geckos.length) return; const list = checkCelebrations(); if (list.length) celebrate(list); }, 2500);
  switchView('case');
  setInterval(tick, 5000);
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => { if (document.hidden) { hiddenAt = Date.now(); saveNow(); } else { tick(); if (hiddenAt) awaySummary(hiddenAt, Date.now()); } });
  if (!S.welcomed) { if (!S.geckos.length && !(S.starters && S.starters.length)) S.starters = makeStarters(); if (S.geckos.length && S.starters && S.starters.length) starterList(); else welcome(); }

  if ('serviceWorker' in navigator && /^(https:|http:\/\/localhost)/.test(location.href)) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* プレビュー環境などでは使えない */ });
  }
})();
