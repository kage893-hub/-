const {chromium}=require(process.env.PLAYWRIGHT||'playwright'),fs=require('fs'),assert=require('node:assert/strict');
const OUT=process.argv[2]||'/tmp/leopa-tests';fs.mkdirSync(OUT,{recursive:true});
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROME||'/usr/bin/chromium',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});try{
 const p=await b.newPage({viewport:{width:390,height:844},serviceWorkers:'block'}),errors=[];p.on('pageerror',e=>errors.push(String(e)));
 await p.addInitScript(()=>{const interval=window.setInterval;window._intervals=[];window.setInterval=(...args)=>{const id=interval(...args);_intervals.push(id);return id}});
 const app=fs.readFileSync(__dirname+'/../../js/app.js','utf8').replace('onExplore: walkProgress,\n    });','onExplore: walkProgress,\n    });tank.setActive(false);tank.setActive=()=>{};').replace(/\}\)\(\);\s*$/,'window._cageSetTest={actions:ACTIONS,saveNow,migrate};})();');
 await p.route('**/js/app.js',r=>r.fulfill({contentType:'text/javascript',body:app}));await p.goto(process.env.BASE||'http://localhost:8123');await require('./start.js')(p);
 await p.evaluate(()=>{_intervals.forEach(clearInterval);const S=__leopaState();S.tut={step:99};S.coins=5000;S.selected=S.geckos[0].id;S.cageOwn={std:1,glass:1};for(const t of Object.values(Leopa3D.CAGE_THEMES))for(const id of t.furniture||[])S.decorInv[id]=2;document.querySelector('[data-view=shop]').click();_cageSetTest.actions.shopTab({dataset:{tab:'interior'}});_cageSetTest.actions.interiorSection({dataset:{section:'cage'}})});
 await p.addStyleTag({content:'#toast{display:none!important}'});
 const themes=await p.evaluate(()=>Object.entries(Leopa3D.CAGE_THEMES).filter(([,v])=>v.furniture).map(([id,v])=>({id,...v})));assert.equal(themes.length,5);
 assert.deepEqual(await p.evaluate(()=>[Leopa3D.CAGE_THEMES.glass.price,Leopa3D.CAGE_THEMES.dino.price,Leopa3D.CAGE_THEMES.expoGold.price,Leopa3D.CAGE_SIZES.wide.price]),[0,150,500,150]);
 const results=[];
 for(const theme of themes){assert.equal(theme.price,300);assert.equal(theme.furniture.length,5);assert.equal(new Set(theme.furniture).size,5);
  const roles=await p.evaluate(t=>t.furniture.map(id=>{const d=Leopa3D.DECOR[id];return {theme:d.theme,role:d.drink?'water':d.shelter?'shelter':'furniture'}}),theme);
  assert.ok(roles.every(r=>r.theme===theme.id));assert.deepEqual(['water','shelter','furniture'].map(role=>roles.filter(r=>r.role===role).length),[1,1,3]);
  const denied=await p.evaluate(id=>{const S=__leopaState(),A=_cageSetTest.actions;S.coins=299;const before=JSON.stringify([S.cageOwn,S.decorInv,S.geckos.map(g=>g.decor)]);A.buyCage({dataset:{kind:'theme',id}});return S.coins===299&&before===JSON.stringify([S.cageOwn,S.decorInv,S.geckos.map(g=>g.decor)])},theme.id);assert.ok(denied);
  await p.evaluate(id=>_cageSetTest.actions.itemPreview({dataset:{kind:'theme',id}}),theme.id);assert.ok(await p.locator('[data-action=buyCage]').isDisabled());assert.equal(await p.locator('.cage-furniture-list>div').count(),5);assert.ok((await p.locator('#sheetBody').innerText()).includes('初回購入で家具5点つき'));
  assert.equal(await p.locator('.cage-set-price').innerText(),'300 コイン');
  await p.evaluate(()=>{__leopaState().coins=5000;_cageSetTest.actions.closeSheet()});
  const before=await p.evaluate(()=>({coins:__leopaState().coins,inv:structuredClone(__leopaState().decorInv),decor:JSON.stringify(__leopaState().geckos[0].decor)}));
  await p.evaluate(id=>_cageSetTest.actions.itemPreview({dataset:{kind:'theme',id}}),theme.id);
  if(theme.id==='zenGarden'){
   await p.waitForFunction(()=>[...document.querySelectorAll('#sheetBody img')].every(i=>i.complete&&i.naturalWidth>0),null,{timeout:90000});
   await p.locator('#sheetBody').screenshot({path:OUT+'/初回家具セットの案内.png'});
  }
  await p.locator('[data-action=buyCage]').click();
  const bought=await p.evaluate(id=>{const S=__leopaState();return {coins:S.coins,owned:S.cageOwn[id],theme:S.geckos[0].cage.theme,inv:structuredClone(S.decorInv),decor:JSON.stringify(S.geckos[0].decor)}},theme.id);
  assert.equal(bought.coins,before.coins-300);assert.equal(bought.owned,1);assert.equal(bought.theme,theme.id);assert.equal(bought.decor,before.decor);
  assert.deepEqual(await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem('leopa-together-v1'));return {coins:s.coins,inv:s.decorInv,own:s.cageOwn}}),await p.evaluate(()=>{const s=__leopaState();return {coins:s.coins,inv:s.decorInv,own:s.cageOwn}}));
  for(const id of Object.keys(before.inv))assert.equal(bought.inv[id],before.inv[id]+(theme.furniture.includes(id)?1:0),id);
  assert.equal(await p.locator('.cage-furniture-list>div').count(),5);
  const repeated=await p.evaluate(id=>{const S=__leopaState(),A=_cageSetTest.actions;A.closeSheet();S.selected=S.geckos[1].id;A.buyCage({dataset:{kind:'theme',id}});A.buyCage({dataset:{kind:'theme',id}});A.setCageOpt({dataset:{kind:'theme',id}});S.selected=S.geckos[0].id;return {coins:S.coins,inv:structuredClone(S.decorInv),secondTheme:S.geckos[1].cage.theme}},theme.id);
  assert.equal(repeated.coins,bought.coins);assert.deepEqual(repeated.inv,bought.inv);assert.equal(repeated.secondTheme,theme.id);results.push({id:theme.id,price:300,items:theme.furniture});
 }
 // 所有と受け取った家具は再読み込み後も保持し、切り替えで追加しない。
 await p.evaluate(()=>_cageSetTest.saveNow());const saved=await p.evaluate(()=>({inv:__leopaState().decorInv,own:__leopaState().cageOwn,coins:__leopaState().coins}));await p.reload();await p.waitForFunction(()=>window._cageSetTest);await p.evaluate(()=>_intervals.forEach(clearInterval));
 for(const t of themes)await p.evaluate(id=>_cageSetTest.actions.buyCage({dataset:{kind:'theme',id}}),t.id);
 assert.deepEqual(await p.evaluate(()=>({inv:__leopaState().decorInv,own:__leopaState().cageOwn,coins:__leopaState().coins})),saved);
 // 家具を単品でも追加購入できる。
 await p.evaluate(()=>{_cageSetTest.actions.closeSheet();document.querySelector('[data-view=shop]').click();_cageSetTest.actions.shopTab({dataset:{tab:'interior'}});_cageSetTest.actions.interiorSection({dataset:{section:'decor'}})});
 for(const theme of themes){await p.selectOption('#decorTheme',theme.id);assert.equal(await p.locator('#decorItems .item-card').count(),5);const id=theme.furniture[0],before=await p.evaluate(id=>({coins:__leopaState().coins,count:__leopaState().decorInv[id],price:Leopa3D.DECOR[id].price}),id);await p.locator(`#decorItems [data-id="${id}"]`).click();await p.locator('[data-action=buyDecor]').click();assert.deepEqual(await p.evaluate(id=>({coins:__leopaState().coins,count:__leopaState().decorInv[id]}),id),{coins:before.coins-before.price,count:before.count+1})}
 const migration=await p.evaluate(()=>{const S=__leopaState(),old=structuredClone(S);old.cageOwn={std:1,glass:1,zenGarden:1};const before=JSON.stringify([old.decorInv,old.coins]);_cageSetTest.migrate(old);_cageSetTest.migrate(old);return {inventoryStable:before===JSON.stringify([old.decorInv,old.coins]),owned:old.cageOwn.zenGarden}});assert.deepEqual(migration,{inventoryStable:true,owned:1});
 // 購入後の案内と、もようがえへの移動。
 await p.evaluate(()=>{const S=__leopaState();delete S.cageOwn.birchForest;_cageSetTest.actions.buyCage({dataset:{kind:'theme',id:'birchForest'}})});
 await p.waitForFunction(()=>[...document.querySelectorAll('#sheetBody img')].every(i=>i.complete&&i.naturalWidth>0),null,{timeout:90000});
 assert.ok(await p.locator('#sheetBody').evaluate(el=>el.scrollWidth<=el.clientWidth+1));await p.locator('#sheetBody').screenshot({path:OUT+'/家具セット受け取り.png'});
 await p.locator('[data-action=decorateCageSet]').click();assert.ok(await p.locator('[data-action=editDone]').count());
 await p.evaluate(()=>{_cageSetTest.actions.editDone();__leopaState().kids=true;LKids.set(true);_cageSetTest.actions.itemPreview({dataset:{kind:'theme',id:'zenGarden'}})});await p.waitForTimeout(250);
 assert.ok(await p.locator('#sheetBody').evaluate(el=>el.scrollWidth<=el.clientWidth+1));assert.ok(!(await p.locator('#sheetBody').innerText()).includes('単品'));
 assert.deepEqual(errors,[]);fs.writeFileSync(OUT+'/cage-sets-results.json',JSON.stringify({themes:results,migration,errors},null,2));console.log('新ケージ5種の300コイン・初回家具5点・不足時・重複受け取り防止・複数ケース・保存・単品販売・もようがえ・ひらがな OK');console.log('[]');
}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
