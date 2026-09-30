/* レオパといっしょ — BGM「砂のうえのお昼寝」
 * 音楽ファイルを使わず、その場で音を合成する。
 * 木琴（マリンバ）のメロディ、やわらかい和音、ぽつぽつとしたベース。72 BPM、16 小節でくり返す。
 */
(function (root) {
  'use strict';

  const BPM = 72;
  const STEP = 60 / BPM / 2; // 8分音符ひとつぶんの秒数
  const BAR = 8;             // 1小節 = 8分音符 8 つ
  const midi = n => 440 * Math.pow(2, (n - 69) / 12);

  // 和音進行（4小節でひとまわり）：Cmaj7 → Am7 → Fmaj7 → G6
  const CHORDS = [
    { root: 48, notes: [60, 64, 67, 71] },
    { root: 45, notes: [57, 60, 64, 67] },
    { root: 41, notes: [57, 60, 64, 65] },
    { root: 43, notes: [59, 62, 64, 67] },
  ];
  // メロディ（ドレミソラの5音。null は休み）。8小節×2 で16小節
  const _ = null;
  const MELODY = [
    [76, _, 74, 72, _, _, 74, _], [72, _, 69, _, _, _, _, _], [69, _, 72, 74, _, 76, _, _], [74, _, _, _, 67, _, _, _],
    [76, _, 79, _, 76, 74, _, _], [72, _, 74, _, 69, _, _, _], [72, _, 69, 67, _, _, 69, _], [72, _, _, _, _, _, _, _],
    [79, _, _, 76, _, _, 74, _], [76, _, 72, _, _, _, _, _], [69, _, _, 72, _, 74, _, _], [76, _, 74, _, _, _, _, _],
    [72, _, 74, _, 76, _, 79, _], [81, _, _, _, 79, _, 76, _], [74, _, 72, _, 74, _, _, _], [72, _, _, _, _, _, _, _],
  ];
  const TOTAL = MELODY.length * BAR;

  // ---------- 楽器
  function marimba(ctx, out, t, f, vel) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(vel * 0.35, t);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
    o1.type = 'sine'; o1.frequency.value = f;
    o2.type = 'sine'; o2.frequency.value = f * 3.93; // 木琴らしい、少しずれた倍音
    o1.connect(g).connect(out);
    o2.connect(g2).connect(out);
    o1.start(t); o2.start(t);
    o1.stop(t + 1.2); o2.stop(t + 0.2);
  }
  function pad(ctx, out, t, notes, dur) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.028, t + 1.2);
    g.gain.setValueAtTime(0.028, t + dur - 0.8);
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
  function bass(ctx, out, t, f) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    const o = ctx.createOscillator();
    o.type = 'sine'; o.frequency.value = f;
    o.connect(g).connect(out);
    o.start(t); o.stop(t + 1.5);
  }
  function makeReverb(ctx) {
    const len = Math.floor(ctx.sampleRate * 2.6);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    const cv = ctx.createConvolver();
    cv.buffer = buf;
    return cv;
  }

  // 出力のつなぎ（原音＋ひびき）
  function makeBus(ctx, dest, volume) {
    const master = ctx.createGain();
    master.gain.value = volume;
    const dry = ctx.createGain(); dry.gain.value = 0.8;
    const wet = ctx.createGain(); wet.gain.value = 0.35;
    const rev = makeReverb(ctx);
    dry.connect(master);
    rev.connect(wet).connect(master);
    master.connect(dest);
    const input = ctx.createGain();
    input.connect(dry);
    input.connect(rev);
    return { input, master };
  }

  // 8分音符 step 番目の音を、時刻 t に鳴らす
  function playStep(ctx, out, step, t) {
    const s = step % TOTAL;
    const bar = Math.floor(s / BAR), pos = s % BAR;
    const ch = CHORDS[bar % CHORDS.length];
    if (pos === 0) {
      pad(ctx, out, t, ch.notes, STEP * BAR);
      bass(ctx, out, t, midi(ch.root));
    }
    if (pos === 4) bass(ctx, out, t, midi(ch.root + 7));
    const n = MELODY[bar][pos];
    if (n) marimba(ctx, out, t + (Math.random() - 0.5) * 0.012, midi(n), 0.13 + Math.random() * 0.03);
    // ときどき、高い音でぽろん
    if (pos === 6 && bar % 4 === 3) marimba(ctx, out, t, midi(ch.notes[3] + 24), 0.04);
    // 和音の分散（やさしい伴奏）
    if (pos % 2 === 1) marimba(ctx, out, t, midi(ch.notes[(pos >> 1) % 4]), 0.035);
  }

  // ---------- 再生
  let ctx = null, bus = null, timer = null, step = 0, nextT = 0;
  function start(volume) {
    try {
      ctx = ctx || new (root.AudioContext || root.webkitAudioContext)();
    } catch (e) { return false; }
    if (ctx.state === 'suspended') ctx.resume();
    api.ctxUsed = true;
    if (timer) return true;
    if (!bus) bus = makeBus(ctx, ctx.destination, 0);
    bus.master.gain.cancelScheduledValues(ctx.currentTime);
    bus.master.gain.setValueAtTime(bus.master.gain.value, ctx.currentTime);
    bus.master.gain.linearRampToValueAtTime(volume == null ? 0.5 : volume, ctx.currentTime + 2);
    nextT = ctx.currentTime + 0.1;
    timer = setInterval(() => {
      while (nextT < ctx.currentTime + 0.4) {
        playStep(ctx, bus.input, step++, nextT);
        nextT += STEP;
      }
    }, 100);
    return true;
  }
  function stop() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
    if (bus) {
      bus.master.gain.cancelScheduledValues(ctx.currentTime);
      bus.master.gain.setValueAtTime(bus.master.gain.value, ctx.currentTime);
      bus.master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.8);
    }
  }
  const playing = () => !!timer;

  // 試聴用：曲の一部をオフラインで書き出す
  async function render(seconds, sampleRate) {
    const Off = root.OfflineAudioContext || root.webkitOfflineAudioContext;
    const off = new Off(1, Math.floor(sampleRate * seconds), sampleRate);
    const b = makeBus(off, off.destination, 0.9);
    for (let i = 0, t = 0.05; t < seconds - 1; i++, t += STEP) playStep(off, b.input, i, t);
    return off.startRendering();
  }

  const api = { start, stop, playing, render, title: '砂のうえのお昼寝', loopSeconds: TOTAL * STEP, ctxUsed: false };
  root.LeopaMusic = api;
})(typeof window !== 'undefined' ? window : globalThis);
