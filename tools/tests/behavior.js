const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const fs = require('fs'), assert = require('node:assert/strict');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const p = await b.newPage({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' }), errors = [];
    p.on('pageerror', e => errors.push(String(e)));
    // 時間だけを進める入口は検査用の配信にだけ差し込む。
    const scene = fs.readFileSync(__dirname + '/../../js/scene3d.js', 'utf8').replace('_st: st, _cam: camera,', '_step: stepGecko, _stepCamera: stepCamera, _st: st, _cam: camera,');
    await p.route('**/js/scene3d.js', r => r.fulfill({ contentType: 'text/javascript', body: scene }));
    await p.goto(process.env.BASE || 'http://localhost:8123'); await require('./start.js')(p);
    await p.waitForFunction(() => window.__leopaTank()?._st.gk);
    const results = await p.evaluate(() => {
      const tank = __leopaTank(), st = tank._st, S = __leopaState(), g = S.geckos.find(x => x.id === S.selected), checks = [];
      const check = (name, ok) => checks.push({ name, ok });
      const profiles = Array.from({ length: 100 }, (_, seed) => Leopa3D.behaviorProfile(seed));
      check('3つの行動傾向があり保存しなくても同じ個体で安定', new Set(profiles.map(p => p.name)).size === 3 && JSON.stringify(Leopa3D.behaviorProfile(g.seed)) === JSON.stringify(Leopa3D.behaviorProfile(g.seed)));
      check('歩く速さと休む長さが個体ごとに異なる', new Set(profiles.map(p => p.walk)).size === 3 && new Set(profiles.map(p => p.rest)).size === 3);
      tank.setActive(false); tank.setNight(false);
      tank.setGecko({ ...g, size: 1, stage: 'adult' });
      tank.setDecor([{ t: 'wet', x: 0, z: 0, rot: 0 }]);
      const prepare = () => { const h = tank._hide(); Object.assign(st, { x: h.x, z: h.z, yaw: h.face, sleeping: true, mode: 'idle', wait: 100, act: null, hand: null, pair: null, hidePeek: null }); return tank.peekFromHide(); };
      check('隠れ家からのぞく動作を開始', prepare());
      for (let i = 0; i < 300 && st.hidePeek?.phase === 'out'; i++) tank._step(1 / 30);
      check('入口へ進み、周りを見る段階に移る', st.hidePeek?.phase === 'look');
      tank._step(.2); check('左右を見て体を低く保つ', st.peekT > 0 && Math.abs(st.peek) > 0 && st.drop > .06);
      const original = Math.random;
      try {
        Math.random = () => .999;
        for (let i = 0; i < 750 && !st.sleeping; i++) tank._step(1 / 30);
        check('昼は隠れ家に戻って休める', st.sleeping && !st.hidePeek);
        prepare(); Math.random = () => 0;
        for (let i = 0; i < 600 && st.hidePeek; i++) tank._step(1 / 30);
        check('顔を出したあと外へ出ることもある', !st.sleeping && !st.hidePeek);
      } finally { Math.random = original; }
      prepare(); tank.spawnFood('cricketS');
      check('餌が出たらのぞく動作をやめる', !st.hidePeek && !st.sleeping);
      tank._step(.2); check('通常の捕食へつながる', !!st.hunt);
      tank.takeFoods(); prepare(); tank.setDecor([]);
      check('隠れ家を片付けても動作が残らない', !st.hidePeek && tank.peekFromHide() === false);
      // 岩ウェットシェルターのIDはカタログから選ぶ（形の追加に依存しない）。
      const rock = Object.keys(Leopa3D.DECOR).find(k => Leopa3D.DECOR[k].name === '岩ウェットシェルター（砂色）');
      tank.setDecor([{ t: rock, x: 0, z: 0, rot: Math.PI / 2 }]); prepare();
      check('回転した岩シェルターでも方向が合う', Math.abs(Math.sin(st.hidePeek.yaw) - 1) < 1e-8);
      for (let i = 0; i < 180; i++) tank._step(1 / 30);
      check('座標と姿勢が壊れない', [st.x, st.z, st.yaw, st.drop].every(Number.isFinite));
      tank.setGecko({ ...g, id: 'another-gecko', seed: g.seed + 1, size: 1, stage: 'adult' });
      check('個体の切り替えでのぞく動作を引き継がない', !st.hidePeek && st.mode === 'idle');
      return checks;
    });
    assert.deepEqual(results.filter(r => !r.ok), []); assert.deepEqual(errors, []);
    console.log(`行動の検査 ${results.length}件 OK`); console.log(JSON.stringify(errors));
  } finally { await b.close(); }
})().catch(e => { console.error(e); process.exit(1); });
