const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const fs = require('fs'), assert = require('node:assert/strict');
const OUT = process.argv[2] || '/tmp/leopa-tests'; fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const p = await b.newPage({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' }), errors = [];
    p.on('pageerror', e => errors.push(String(e)));
    await p.addInitScript(() => { const interval = window.setInterval; window._intervals = []; window.setInterval = (...a) => { const id = interval(...a); _intervals.push(id); return id; }; });
    const scene = fs.readFileSync(__dirname + '/../../js/scene3d.js', 'utf8').replace('_st: st, _cam: camera,', '_step: stepGecko, _cameraStep: stepCamera, _render: () => renderer.render(scene,camera), _obstacles: () => obstacles, _climbs: () => climbs, _st: st, _cam: camera,').replace('root.Leopa3D = {', 'root._activityScene = {KIT}; root.Leopa3D = {');
    await p.route('**/js/scene3d.js', r => r.fulfill({ contentType: 'text/javascript', body: scene }));
    const app = fs.readFileSync(__dirname + '/../../js/app.js', 'utf8').replace(/\}\)\(\);\s*$/, 'window._playTest={actions:ACTIONS,saveNow,renderView,session:()=>playSession};})();');
    await p.route('**/js/app.js', r => r.fulfill({ contentType: 'text/javascript', body: app }));
    await p.goto(process.env.BASE || 'http://localhost:8123'); await require('./start.js')(p);
    await p.waitForFunction(() => __leopaTank()?._st.gk?.glb && _activityScene.KIT.data?.items?.KN_sign);
    await p.addStyleTag({ content: '#toast{display:none!important}' });
    await p.evaluate(() => {
      _intervals.forEach(clearInterval); window.tank = __leopaTank(); tank.setActive(false);
      const s = __leopaState(); s.tut = { step: 99 }; s.geckos[0].growth = 220; s.geckos[0].name = 'こはく'; s.selected = s.geckos[0].id;
      s.geckos[0].sick = null; s.geckos[0].shedUntil = 0; s.geckos[0].hunger = 85; s.geckos[0].tame = 100;
      s.decorInv.knBridge = 1; s.decorInv.knSteps = 1; _playTest.renderView();
      Object.assign(tank._st, { x: 0, z: 0, yaw: Math.PI/2, mode: 'idle', sleeping: false, wait: 999, act: null, hidePeek: null });
      window.baseCase = JSON.stringify(s.geckos[0]); window.baseFood = JSON.stringify(s.food); window.baseCoins = s.coins;
      _playTest.actions.storyStart({dataset:{id:'garden'}}); _playTest.actions.storyClaim({dataset:{id:'garden',step:'0'}}); _playTest.actions.closeSheet();
    });
    await p.locator('[data-action=walkStart]').click();
    assert.equal(await p.locator('[data-action=walkEnd]').count(), 1);
    const progress = await p.evaluate(() => {
      tank.setActive(false); const st = tank._st;
      Object.assign(st, { x: 0, z: 0, yaw: Math.PI/2, mode: 'idle', act: null, sleeping: false, target: null, pauseT: 0, gait: null, spd: 0 });
      const ok = tank.walkTo(3.7, 0); let arrived = false;
      for (let i = 0; i < 1000; i++) { st.t += 1/30; tank._step(1/30); if (Math.hypot(st.x - 3.7, st.z) < .3) { arrived = true; st.mode = 'idle'; st.wait = 999; st.act = null; st.target = null; } }
      for (let i = 0; i < 90; i++) tank._cameraStep(1/30); tank._render();
      return { ok, arrived, ..._playTest.session(), original: JSON.stringify(__leopaState().geckos[0]) === baseCase, food: JSON.stringify(__leopaState().food) === baseFood };
    });
    assert.ok(progress.ok && progress.arrived && progress.elapsed > 15 && progress.distance >= 3 && progress.original && progress.food, JSON.stringify(progress));
    await p.screenshot({ path: OUT + '/おさんぽスペース.png' });
    await p.locator('[data-action=walkLayout]').click(); assert.equal(await p.evaluate(() => tank._st.active), false);
    await p.selectOption('#penSlot2', 'knBridge'); await p.locator('[data-action=penRotate][data-i="2"]').click();
    assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('leopa-together-v1')).playpen.slots[2].t), 'knBridge');
    assert.ok(await p.evaluate(() => __leopaState().playpen.slots[2].rot > 1));
    await p.screenshot({ path: OUT + '/おさんぽの配置.png' });
    await p.locator('#sheetBody [data-action=closeSheet]').click();
    await p.locator('[data-action=walkEnd]').click();
    assert.equal(await p.evaluate(() => _playTest.session()), null);
    assert.equal(await p.evaluate(() => __leopaState().stories.garden.counts.walk), 1);
    assert.equal(await p.evaluate(() => JSON.stringify(__leopaState().geckos[0]) === baseCase), true);
    assert.equal(await p.evaluate(() => tank._st.playpen), false);
    await p.evaluate(() => { tank.setActive(false); _playTest.actions.stories(); });
    await p.locator('[data-action=storyClaim][data-id=garden]').click(); await p.locator('#sheetBody [data-action=closeSheet]').click();
    // カメラ→アルバム保存で第三話を達成。
    await p.evaluate(() => { tank._render(); _playTest.actions.snapPhoto({ dataset: { id: __leopaState().selected } }); });
    await p.waitForFunction(() => __leopaState().stories.garden.counts.photo === 1);
    await p.evaluate(() => _playTest.actions.stories()); await p.locator('[data-action=storyClaim][data-id=garden]').click();
    assert.equal(await p.evaluate(() => __leopaState().decorInv.knPalm), 1);
    await p.locator('#sheetBody [data-action=closeSheet]').click();
    const handling = await p.evaluate(() => {
      tank.setActive(false); const st = tank._st;
      tank.setDecor(Leopa3D.DEFAULT_DECOR); Object.assign(st, {x:0,z:0,yaw:0,mode:'idle',act:null,sleeping:false,hidePeek:null});
      const offered = tank.startHandling(100);
      for(let i=0;i<1500 && tank.handling()!=='lifted';i++){st.t+=1/30;tank._step(1/30)}
      return {offered, phase:tank.handling()};
    });
    assert.deepEqual(handling, {offered:true,phase:'lifted'});
    const pointer = await p.evaluate(() => {
      const el = document.querySelector('#tank3d canvas');
      const send = (type,id,x) => el.dispatchEvent(new PointerEvent(type,{pointerId:id,clientX:x,clientY:200,bubbles:true}));
      send('pointerdown',1,100); send('pointerdown',2,120); send('pointermove',2,180);
      const owner = tank._st.strokeDrag.id, firstX = tank._st.strokeDrag.x;
      send('pointercancel',1,100); send('pointermove',1,220);
      return {owner,firstX,cleared:tank._st.strokeDrag===null};
    });
    assert.deepEqual(pointer, {owner:1,firstX:100,cleared:true});
    await p.evaluate(() => { for(let i=0;i<60;i++)tank._cameraStep(1/30);tank._render(); });
    await p.screenshot({path:OUT+'/ふれあい.png'});
    // トンネルは床を歩いて通れる。新しい家具17種がロード済みの実モデルで作れる。
    const furniture = await p.evaluate(() => {
      tank.endHandling(); const st = tank._st;
      tank.setCage({size:'big'}); tank.setPlaypen(true); tank.setDecor([{t:'corkTunnel',x:0,z:0,rot:0}]);
      Object.assign(st,{x:0,z:-2.6,yaw:0,y:0,mode:'idle',act:null,sleeping:false,gait:null,pauseT:0,hidePeek:null,spd:0});
      tank.walkTo(0,2.7); let crossed=false,maxY=0;
      for(let i=0;i<1200;i++){st.t+=1/30;tank._step(1/30);maxY=Math.max(maxY,st.y);if(st.z>2.4){crossed=true;break}}
      return {crossed,maxY,kitCount:Object.keys(_activityScene.KIT.data.items).filter(k=>k.startsWith('KN_')).length};
    });
    assert.ok(furniture.crossed && furniture.maxY < .25 && furniture.kitCount === 16, JSON.stringify(furniture));
    const photos = await p.evaluate(() => Object.keys(Leopa3D.DECOR).filter(k=>k.startsWith('kn')||k==='corkTunnel').map(id=>({id,name:Leopa3D.DECOR[id].name,src:Leopa3D.itemPhoto('decor',id)})));
    for(const photo of photos){assert.ok(photo.src && photo.src.startsWith('data:image/'),photo.id);fs.writeFileSync(OUT+'/'+photo.id+'.png',Buffer.from(photo.src.split(',')[1],'base64'))}
    fs.writeFileSync(OUT+'/furniture.json',JSON.stringify(photos.map(({id,name})=>({id,name})),null,2));
    fs.writeFileSync(OUT+'/playpen-results.json',JSON.stringify({progress,handling,pointer,furniture,errors},null,2));
    assert.deepEqual(errors,[]); console.log('おさんぽの歩行・時間・配置保存・元のケース維持・連続依頼と写真報酬・家具のあるケースのふれあい・指のキャンセル・トンネル通過・家具17種 OK'); console.log('[]');
  } finally { await b.close(); }
})().catch(e=>{console.error(e);process.exit(1)});
