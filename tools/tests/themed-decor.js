const {chromium} = require(process.env.PLAYWRIGHT || 'playwright');
const fs=require('fs'),assert=require('node:assert/strict');
const OUT=process.argv[2]||'/tmp/leopa-themed';fs.mkdirSync(OUT,{recursive:true});
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROME||'/usr/bin/chromium',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});try{
 const p=await b.newPage({viewport:{width:390,height:844},serviceWorkers:'block'}),errors=[];p.on('pageerror',e=>errors.push(String(e)));
 await p.addInitScript(()=>{const set=window.setInterval;window._intervals=[];window.setInterval=(...args)=>{const id=set(...args);_intervals.push(id);return id}});
 const scene=fs.readFileSync(__dirname+'/../../js/scene3d.js','utf8').replace('root.Leopa3D = {','root._themedScene={KIT}; root.Leopa3D = {');
 // この検査では静的な形・購入・お世話を確認する。歩行は既存のmovementで検査する。
 const app=fs.readFileSync(__dirname+'/../../js/app.js','utf8')
  .replace('onExplore: walkProgress,\n    });', 'onExplore: walkProgress,\n    }); tank.setActive(false); tank.setActive=()=>{};')
  .replace(/\}\)\(\);\s*$/,'window._themedApp={actions:ACTIONS,hasDish,hasWet,humidOf,waterDirty,saveNow,renderView};})();');
 await p.route('**/js/scene3d.js',r=>r.fulfill({contentType:'text/javascript',body:scene}));await p.route('**/js/app.js',r=>r.fulfill({contentType:'text/javascript',body:app}));
 await p.goto(process.env.BASE||'http://localhost:8123');await require('./start.js')(p);
 await p.waitForFunction(()=>_themedScene.KIT.data?.items.THM_wetBirch && __leopaTank()?._st.gk?.glb);
 await p.evaluate(()=>{_intervals.forEach(clearInterval);__leopaTank().setActive(false);__leopaState().tut={step:99};__leopaState().coins=5000;__leopaState().selected=__leopaState().geckos[0].id});
 const geometry=await p.evaluate(()=>{
  const K=_themedScene.KIT,rows=[];
  for(const [id,def] of Object.entries(Leopa3D.DECOR).filter(([,d])=>d.theme)){
   const group=def.build(),body=group.children[0],box=new THREE.Box3().setFromObject(group),care=K.data.items['THM_'+id].care;group.updateMatrixWorld(true);
   const row={id,theme:def.theme,minY:box.min.y,meshes:0,mapped:0,normal:0,texturedUvSpan:0};
   body.traverse(m=>{if(m.isMesh){row.meshes++;if(m.material.map){row.mapped++;const uv=m.geometry.getAttribute('uv');if(uv){let lo=Infinity,hi=-Infinity;for(let n=0;n<uv.count;n++){lo=Math.min(lo,uv.getX(n));hi=Math.max(hi,uv.getX(n))}row.texturedUvSpan=Math.max(row.texturedUvSpan,hi-lo)}}if(m.material.normalMap){row.normal++;if(m.material.normalMap.encoding!==THREE.LinearEncoding)throw Error(id+'の凹凸画像の色空間')}m.material.side=THREE.DoubleSide}});
   if(def.drink){const water=group.getObjectByName('water'),positions=water.geometry.getAttribute('position'),ray=new THREE.Raycaster();let safe=0,total=0;
    // 水面の中心から各頂点の少し内側まで、器の底があり、水面より低いこと。
    for(let i=0;i<positions.count;i++){const x=positions.getX(i)*.90,z=positions.getZ(i)*.90;ray.set(new THREE.Vector3(x,3,z),new THREE.Vector3(0,-1,0));const hit=ray.intersectObject(body,true)[0];total++;if(hit&&hit.point.y<water.position.y+.015)safe++}
    Object.assign(row,{waterY:water.position.y,waterSafe:safe/total});
   }
   if(def.shelter){const ray=new THREE.Raycaster();ray.set(new THREE.Vector3(0,.45,box.max.z+1),new THREE.Vector3(0,0,-1));const hit=ray.intersectObject(body,true)[0];row.doorDepth=hit?.distance||0;
    const water=group.getObjectByName('wetWater'),w=care.water,[cx,cz]=w.center;
    ray.set(new THREE.Vector3(cx,5,cz),new THREE.Vector3(0,-1,0));const floor=ray.intersectObject(body,true)[0]?.point.y;
    ray.set(new THREE.Vector3(cx,.45,cz),new THREE.Vector3(0,1,0));const ceiling=ray.intersectObject(body,true)[0]?.point.y;
    let safe=0,enclosed=0;const positions=water.geometry.getAttribute('position');
    for(let i=0;i<positions.count;i++){
     const x=positions.getX(i),z=positions.getZ(i);
     ray.set(new THREE.Vector3(cx+(x-cx)*.9,5,cz+(z-cz)*.9),new THREE.Vector3(0,-1,0));const bed=ray.intersectObject(body,true)[0];if(bed&&bed.point.y<water.position.y-.015)safe++;
     ray.set(new THREE.Vector3(cx+(x-cx)*1.24,5,cz+(z-cz)*1.24),new THREE.Vector3(0,-1,0));const rim=ray.intersectObject(body,true)[0];if(rim&&rim.point.y>water.position.y+.025)enclosed++;
    }
    Object.assign(row,{wetWater:!!water,waterY:water.position.y,roof:box.max.y,waterDepth:water.position.y-floor,roofThickness:floor-ceiling,wetWaterSafe:safe/positions.count,rimProtected:enclosed/positions.count});
   }
   rows.push(row);
  }
  return rows;
 });
 for(const r of geometry){assert.ok(r.meshes&&r.mapped&&r.texturedUvSpan>.05,r.id+'の実モデルと画像の貼り付け');assert.ok(r.minY>=-.001,r.id+'の底面');if(r.waterSafe!=null)assert.ok(r.waterSafe>.94,JSON.stringify(r));if(r.doorDepth!=null){assert.ok(r.doorDepth>2,JSON.stringify(r));assert.ok(r.roof<2.1&&r.roof-r.waterY>.05&&r.waterDepth>.10&&r.roofThickness>.10&&r.wetWaterSafe>.94&&r.rimProtected>.9,JSON.stringify(r))}}
 await p.locator('[data-view=shop]').click();await p.evaluate(()=>document.querySelector('[data-action=shopTab][data-tab=interior]').click());
 const themes=await p.locator('#decorTheme option').evaluateAll(es=>es.map(e=>e.value).filter(x=>x!=='all'));assert.equal(themes.length,5);
 for(const theme of themes){await p.selectOption('#decorTheme',theme);assert.equal(await p.locator('#decorItems .item-card').count(),5);await p.evaluate(()=>document.querySelector('[data-action=decorCategory][data-category=care]').click());assert.equal(await p.locator('#decorItems .item-card').count(),2);await p.evaluate(()=>document.querySelector('[data-action=decorCategory][data-category=all]').click())}
 await p.evaluate(()=>_themedApp.actions.interiorSection({dataset:{section:'cage'}}));
 await p.evaluate(()=>_themedApp.actions.itemPreview({dataset:{kind:'theme',id:'rainGarden'}}));
 await p.locator('[data-action=matchingDecor]').click();
 assert.equal(await p.locator('#decorTheme').inputValue(),'rainGarden');assert.equal(await p.locator('#decorItems .item-card').count(),5);
 await p.selectOption('#decorTheme','brickLoft');
 await p.waitForFunction(()=>[...document.querySelectorAll('#decorItems img')].every(i=>i.complete&&i.naturalWidth>0),null,{timeout:90000});
 await p.screenshot({path:OUT+'/ケージ別の家具ショップ.png',fullPage:true});
 // 25点を購入し、5組の水入れ・隠れ家が実際のお世話の判定に使われること。
 const care=await p.evaluate(()=>{
  const A=_themedApp,S=__leopaState(),g=S.geckos[0],before=S.coins,initial={...S.decorInv},oldDecor=g.decor,now=Date.now();let cost=0;const results=[];
  for(const [id,d] of Object.entries(Leopa3D.DECOR).filter(([,d])=>d.theme)){cost+=d.price;A.actions.buyDecor({dataset:{t:id}});if(S.decorInv[id]!==((initial[id]||0)+1))throw Error(id+'の所持数')}
  const charged=before-S.coins; // 水替えの1コイン報酬を含めず、買い物だけの引き落としを測る。
  for(const theme of [...new Set(Object.values(Leopa3D.DECOR).map(d=>d.theme).filter(Boolean))]){
   const ids=Object.keys(Leopa3D.DECOR).filter(id=>Leopa3D.DECOR[id].theme===theme),dish=ids.find(id=>Leopa3D.DECOR[id].drink),wet=ids.find(id=>Leopa3D.DECOR[id].shelter);
   g.decor=[{t:dish,x:-4,z:2,rot:0},{t:wet,x:3,z:-2,rot:0}];g.mistAt=0;g.waterAt=now-49*3600000;
   const dirty=A.waterDirty(g,now);A.actions.cleanWater();results.push({theme,dish:A.hasDish(g),wet:A.hasWet(g),humidity:A.humidOf(g,now),dirty,clean:!A.waterDirty(g,now)});
   g.cage={size:'std',theme};__leopaTank().setCage(g.cage);__leopaTank().setDecor(g.decor);
  }
  g.decor=oldDecor;A.saveNow();return {charged,cost,results,inventory:Object.fromEntries(Object.entries(S.decorInv).filter(([id])=>Leopa3D.DECOR[id]?.theme))};
 });
 assert.equal(care.charged,care.cost);for(const r of care.results)assert.ok(r.dish&&r.wet&&r.humidity===63&&r.dirty&&r.clean,JSON.stringify(r));
 await p.reload();await p.waitForFunction(()=>window._themedApp&&window.__leopaState()?.geckos.length);
 assert.deepEqual(await p.evaluate(()=>Object.fromEntries(Object.entries(__leopaState().decorInv).filter(([id])=>Leopa3D.DECOR[id]?.theme))),care.inventory);
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 fs.writeFileSync(OUT+'/themed-decor-results.json',JSON.stringify({geometry,care,errors},null,2));assert.deepEqual(errors,[]);
 console.log('家具25点の実モデル・器内の水面・シェルター本体の水ためと屋根の厚み・5種の絞り込み・購入と保存・水替えと湿度 OK');console.log('[]');
}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
