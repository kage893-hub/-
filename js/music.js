/* レオパといっしょ — BGM（朝・昼・夕方・夜の4曲）
 * 音楽ファイルを使わず、その場で音を合成する。時間帯が変わると、ゆっくり曲が入れかわる。
 */
(function (root) {
  'use strict';

  const midi = n => 440 * Math.pow(2, (n - 69) / 12);
  const _ = null;

  // ---------- 曲
  const SONGS = {
    // 朝：ト長調。高めのカリンバで、目覚めの明るさ
    morning: {
      title: 'おはようの日だまり', bpm: 84, lead: 'kalimba', leadVol: 0.12, padVol: 0.022, padCut: 1100, bassVol: 0.12, arpVol: 0.03, sparkle: true,
      chords: [{ root: 43, notes: [62, 67, 71, 74] }, { root: 40, notes: [59, 62, 64, 67] }, { root: 36, notes: [59, 64, 67, 71] }, { root: 38, notes: [57, 62, 66, 69] }],
      melody: [
        [79, _, 76, _, 74, _, 76, _], [74, _, 71, _, _, _, 69, _], [71, _, 74, _, 76, _, 74, 71], [69, _, _, _, _, _, _, _],
        [74, 76, 79, _, 76, _, 74, _], [71, _, 74, _, 71, _, 67, _], [69, _, 71, _, 74, _, 76, _], [74, _, _, _, 69, _, _, _],
        [67, _, 71, _, 74, _, 79, _], [76, _, 74, _, 76, _, _, _], [72, _, 76, _, 79, _, 76, _], [78, _, 76, _, 74, _, _, _],
        [79, _, 81, _, 79, _, 76, _], [74, _, 76, _, 71, _, _, _], [72, _, 71, _, 69, _, 74, _], [79, _, _, _, _, _, _, _],
      ],
    },
    // 昼：ハ長調。木琴で、のんびりお昼寝
    day: {
      title: '砂のうえのお昼寝', bpm: 72, lead: 'marimba', leadVol: 0.14, padVol: 0.028, padCut: 900, bassVol: 0.16, arpVol: 0.035, sparkle: true,
      chords: [{ root: 48, notes: [60, 64, 67, 71] }, { root: 45, notes: [57, 60, 64, 67] }, { root: 41, notes: [57, 60, 64, 65] }, { root: 43, notes: [59, 62, 64, 67] }],
      melody: [
        [76, _, 74, 72, _, _, 74, _], [72, _, 69, _, _, _, _, _], [69, _, 72, 74, _, 76, _, _], [74, _, _, _, 67, _, _, _],
        [76, _, 79, _, 76, 74, _, _], [72, _, 74, _, 69, _, _, _], [72, _, 69, 67, _, _, 69, _], [72, _, _, _, _, _, _, _],
        [79, _, _, 76, _, _, 74, _], [76, _, 72, _, _, _, _, _], [69, _, _, 72, _, 74, _, _], [76, _, 74, _, _, _, _, _],
        [72, _, 74, _, 76, _, 79, _], [81, _, _, _, 79, _, 76, _], [74, _, 72, _, 74, _, _, _], [72, _, _, _, _, _, _, _],
      ],
    },
    // 夕方：ヘ長調。やわらかいピアノで、少しせつなく
    evening: {
      title: 'オレンジのガラス越し', bpm: 64, lead: 'piano', leadVol: 0.11, padVol: 0.03, padCut: 750, bassVol: 0.15, arpVol: 0.03, sparkle: false,
      chords: [{ root: 41, notes: [57, 60, 64, 65] }, { root: 38, notes: [57, 60, 62, 65] }, { root: 46, notes: [58, 62, 65, 69] }, { root: 36, notes: [58, 60, 64, 67] }],
      melody: [
        [72, _, _, 69, _, _, 67, _], [65, _, _, _, 67, _, _, _], [69, _, _, 70, _, 69, 67, _], [67, _, _, _, _, _, _, _],
        [72, _, 74, _, 72, _, 69, _], [69, _, 67, _, 65, _, _, _], [62, _, 65, _, 67, _, 69, _], [67, _, _, _, _, _, _, _],
        [77, _, _, 76, _, _, 74, _], [72, _, _, _, 69, _, _, _], [70, _, 69, _, 67, _, 65, _], [67, _, _, _, 64, _, _, _],
        [65, _, 69, _, 72, _, 74, _], [72, _, _, 69, _, _, 67, _], [65, _, _, _, 64, _, _, _], [65, _, _, _, _, _, _, _],
      ],
    },
    // 夜：イ短調寄り。オルゴールで、静かに見守る
    night: {
      title: '月あかりのシェルター', bpm: 56, lead: 'musicbox', leadVol: 0.07, padVol: 0.024, padCut: 600, bassVol: 0.11, arpVol: 0, sparkle: false,
      chords: [{ root: 45, notes: [57, 60, 64, 67] }, { root: 41, notes: [57, 60, 64, 65] }, { root: 48, notes: [60, 64, 67, 71] }, { root: 40, notes: [59, 62, 64, 67] }],
      melody: [
        [76, _, _, _, 72, _, _, _], [74, _, _, 72, _, _, _, _], [69, _, _, _, 72, _, _, _], [71, _, _, _, _, _, _, _],
        [76, _, _, 79, _, _, 76, _], [74, _, _, _, _, _, _, _], [72, _, _, 74, _, _, 72, _], [71, _, _, _, _, _, _, _],
        [81, _, _, _, 79, _, _, _], [76, _, _, _, 77, _, _, _], [72, _, _, 76, _, _, 79, _], [71, _, _, _, _, _, _, _],
        [69, _, _, 72, _, _, 76, _], [77, _, _, _, 76, _, _, _], [74, _, _, 71, _, _, _, _], [69, _, _, _, _, _, _, _],
      ],
    },
  };

  // ---------- 楽器
  function voice(ctx, out, t, f, vel, partials, decay, type) {
    for (const [ratio, amp, dec] of partials) {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vel * amp, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (dec || decay));
      const o = ctx.createOscillator();
      o.type = type || 'sine';
      o.frequency.value = f * ratio;
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + (dec || decay) + 0.05);
    }
  }
  const LEADS = {
    marimba: (ctx, out, t, f, v) => voice(ctx, out, t, f, v, [[1, 1], [3.93, 0.35, 0.12]], 1.1),
    kalimba: (ctx, out, t, f, v) => voice(ctx, out, t, f * 2, v, [[1, 1], [5.4, 0.18, 0.08], [2.01, 0.15, 0.3]], 0.9),
    piano: (ctx, out, t, f, v) => {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 2400;
      lp.connect(out);
      voice(ctx, lp, t, f, v, [[1, 1], [2, 0.3, 0.9], [3, 0.12, 0.5]], 2.2, 'triangle');
    },
    musicbox: (ctx, out, t, f, v) => voice(ctx, out, t, f * 2, v, [[1, 1], [2.76, 0.3, 0.5], [5.4, 0.12, 0.2]], 2.4),
  };
  function pad(ctx, out, t, notes, dur, song) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = song.padCut; lp.Q.value = 0.3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(song.padVol, t + 1.2);
    g.gain.setValueAtTime(song.padVol, t + dur - 0.8);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.4);
    lp.connect(g).connect(out);
    for (const n of notes) {
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = midi(n);
        o.detune.value = det;
        o.connect(lp);
        o.start(t); o.stop(t + dur + 0.5);
      }
    }
  }
  function bass(ctx, out, t, f, vol) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    const o = ctx.createOscillator();
    o.type = 'sine'; o.frequency.value = f;
    o.connect(g).connect(out);
    o.start(t); o.stop(t + 1.7);
  }
  function makeReverb(ctx, secs) {
    const len = Math.floor(ctx.sampleRate * secs);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    const cv = ctx.createConvolver();
    cv.buffer = buf;
    return cv;
  }
  let revCache = null;
  function makeBus(ctx, dest, volume) {
    const master = ctx.createGain();
    master.gain.value = volume;
    const dry = ctx.createGain(); dry.gain.value = 0.8;
    const wet = ctx.createGain(); wet.gain.value = 0.38;
    if (!revCache || revCache.context !== ctx) revCache = makeReverb(ctx, 2.8);
    dry.connect(master);
    wet.connect(master);
    master.connect(dest);
    const input = ctx.createGain();
    input.connect(dry);
    const send = ctx.createGain();
    input.connect(send);
    send.connect(revCache);
    revCache.connect(wet);
    return { input, master };
  }

  const BAR = 8; // 1小節 = 8分音符 8 つ
  function playStep(ctx, out, song, step, t) {
    const total = song.melody.length * BAR;
    const s = step % total;
    const bar = Math.floor(s / BAR), pos = s % BAR;
    const ch = song.chords[bar % song.chords.length];
    const stepSec = 60 / song.bpm / 2;
    if (pos === 0) {
      pad(ctx, out, t, ch.notes, stepSec * BAR, song);
      bass(ctx, out, t, midi(ch.root), song.bassVol);
    }
    if (pos === 4 && song.lead !== 'musicbox') bass(ctx, out, t, midi(ch.root + 7), song.bassVol * 0.8);
    const n = song.melody[bar][pos];
    if (n) LEADS[song.lead](ctx, out, t + (Math.random() - 0.5) * 0.012, midi(n), song.leadVol * (0.9 + Math.random() * 0.2));
    if (song.sparkle && pos === 6 && bar % 4 === 3) LEADS.marimba(ctx, out, t, midi(ch.notes[3] + 24), 0.04);
    if (song.arpVol && pos % 2 === 1) LEADS.marimba(ctx, out, t, midi(ch.notes[(pos >> 1) % 4]), song.arpVol);
  }

  // ---------- 再生（曲が変わるときは、前の曲をフェードアウトしながら次の曲をフェードイン）
  let ctx = null, cur = null, timer = null, vol = 0.45, wantKey = 'day';
  function makePlayer(key) {
    const song = SONGS[key];
    const bus = makeBus(ctx, ctx.destination, 0);
    bus.master.gain.setValueAtTime(0, ctx.currentTime);
    bus.master.gain.linearRampToValueAtTime(vol, ctx.currentTime + 2.5);
    return { key, song, bus, step: 0, nextT: ctx.currentTime + 0.15 };
  }
  function fadeOut(p) {
    const g = p.bus.master.gain;
    g.cancelScheduledValues(ctx.currentTime);
    g.setValueAtTime(g.value, ctx.currentTime);
    g.linearRampToValueAtTime(0, ctx.currentTime + 2.5);
    setTimeout(() => { try { p.bus.master.disconnect(); } catch (e) { /* noop */ } }, 6000);
  }
  function pump() {
    if (!cur) return;
    const stepSec = 60 / cur.song.bpm / 2;
    while (cur.nextT < ctx.currentTime + 0.4) {
      playStep(ctx, cur.bus.input, cur.song, cur.step++, cur.nextT);
      cur.nextT += stepSec;
    }
  }
  function start(volume, key) {
    if (volume != null) vol = volume;
    if (key) wantKey = key;
    try { ctx = ctx || new (root.AudioContext || root.webkitAudioContext)(); } catch (e) { return false; }
    if (ctx.state === 'suspended') ctx.resume();
    api.ctxUsed = true;
    if (timer && cur && cur.key === wantKey) return true;
    if (cur) fadeOut(cur);
    cur = makePlayer(wantKey);
    if (!timer) timer = setInterval(pump, 100);
    return true;
  }
  function setSong(key) {
    if (!SONGS[key] || key === wantKey) return;
    wantKey = key;
    if (timer) start();
  }
  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    if (cur) { fadeOut(cur); cur = null; }
  }
  const playing = () => !!timer;

  // 試聴用：曲の一部をオフラインで書き出す
  async function render(seconds, sampleRate, key) {
    const Off = root.OfflineAudioContext || root.webkitOfflineAudioContext;
    const off = new Off(1, Math.floor(sampleRate * seconds), sampleRate);
    const song = SONGS[key || 'day'];
    const b = makeBus(off, off.destination, 0.9);
    const stepSec = 60 / song.bpm / 2;
    for (let i = 0, t = 0.05; t < seconds - 1.5; i++, t += stepSec) playStep(off, b.input, song, i, t);
    return off.startRendering();
  }

  const api = { start, stop, setSong, playing, render, songs: SONGS, get title() { return SONGS[wantKey].title; }, ctxUsed: false };
  root.LeopaMusic = api;
})(typeof window !== 'undefined' ? window : globalThis);
