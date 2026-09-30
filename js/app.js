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
      geckos: [], eggs: [], dex: {}, names: {}, selected: null, offers: [], offersAt: 0,
      lastTick: Date.now(), nextId: 1, welcomed: false, stats: { hatched: 0, rehomed: 0 },
    };
    // どちらも斑点がやや少なく、しっぽに少しオレンジがある。選んでいけばハイポやキャロットテールをめざせる
    const a = newGecko({ name: 'レオ', sex: 'M', genes: { alb: 1 }, tang: 45, growth: 55, hunger: 60, poly: { spots: 38, blotch: 40, head: 45, carrot: 30, lav: 25, aberrant: 20 } });
    const b = newGecko({ name: 'もち', sex: 'F', genes: { snow: 1, alb: 1 }, tang: 22, growth: 55, hunger: 60, poly: { spots: 30, blotch: 55, head: 50, carrot: 22, lav: 40, aberrant: 30 } });
    S.geckos.push(a, b);
    S.selected = a.id;
    register(a); register(b);
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
    if (st2 !== st) toast(`${g.name}が${STAGE_LABEL[st2]}になりました！`);
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
    toast(`${g.name}が卵を2個産みました！インキュベーターに移しました`);
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
      onTapGecko() { const g = selected(); if (g && g.tame >= 40) tank.hearts(1); },
      onTapPoop() { ACTIONS.poop(); },
    });
  }
  function sceneMount() {
    const g = selected();
    if (tankGid && (!g || tankGid !== g.id)) flushFoods();
    tankGid = g ? g.id : null;
    $('#tankEmpty').hidden = !!g;
    if (!tank) return;
    tank.setGecko(g ? lookOf(g) : null);
    tank.setPoops(g ? g.poop : 0);
    tank.setDirty(!!g && g.clean < 35);
    tank.setNight(isNight());
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
    save();
    renderView();
    const morph = nameOf(g);
    const hets = G.hets(g.genes);
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
  }

  // ---------- 操作
  const ACTIONS = {
    tab(t) { switchView(t.dataset.view); },
    select(t) { S.selected = t.dataset.id; tipIndex = (tipIndex + 1) % TIPS.length; renderView(); },
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
      g.tame = clamp(g.tame + 6);
      S.coins += 1;
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
      S.geckos = S.geckos.filter(x => x !== g);
      S.coins += reward;
      S.stats.rehomed++;
      S.selected = S.geckos[0].id;
      closeSheet();
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
      <div class="actions">
        <button class="act primary" data-action="feedMenu">ごはん</button>
        <button class="act" data-action="clean">おそうじ</button>
        <button class="act" data-action="handle">ふれあう</button>
      </div>
      ${g.shedUntil ? '<button class="act wide mist" data-action="mist">しっとりケアで脱皮を手伝う</button>' : ''}
      <div class="actions sub">
        <button class="act ghost" data-action="pairMenu">ペアリング${block ? '' : ' OK'}</button>
        <button class="act ghost" data-action="rehomeMenu">里親に出す</button>
      </div>
      <p class="tip"><b>まめちしき</b>${TIPS[tipIndex]}</p>`);
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
      <h3 class="h3">ごはん</h3>
      <div class="list">${Object.entries(FOODS).map(([k, F]) => `
        <button class="row" data-action="buyFood" data-kind="${k}" ${S.coins < F.price ? 'disabled' : ''}>
          <span class="row-art">${A.food(k)}</span>
          <span class="row-main"><b>${F.name} ${F.pack}匹</b><small>いま ${S.food[k]}匹 ・ ${F.desc}</small></span>
          <span class="row-side price">${F.price}</span>
        </button>`).join('')}</div>
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
      <p>2匹のレオパ（ヒョウモントカゲモドキ）がやってきました。<b>レオ</b>はオス、<b>もち</b>はメス。どちらもアルビノの遺伝子をかくし持っています。</p>
      <ul class="howto">
        <li><b>ごはん・おそうじ・ふれあう</b>で毎日お世話。アプリを閉じていても時間は流れます。</li>
        <li>アダルトになったら<b>ペアリング</b>。卵の温度で性別が変わります。</li>
        <li>いろいろなモルフを生み出して<b>図鑑</b>を埋めよう。</li>
        <li>この世界のレオパは病気にならず、ずっと元気です。お世話をわすれても、しょんぼりするだけ。</li>
      </ul>
      <button class="act primary" data-action="welcomeDone">はじめる</button></div>`);
  }

  // ---------- 起動
  function tick() {
    const now = Date.now();
    simulate(now);
    refreshOffers(now);
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
  if (!S.welcomed) welcome();

  if ('serviceWorker' in navigator && /^(https:|http:\/\/localhost)/.test(location.href)) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* プレビュー環境などでは使えない */ });
  }
})();
