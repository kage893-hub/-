const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const fs = require('fs'), assert = require('node:assert/strict');
// 検査用の配信だけに時間を進める入口を差し込む。公開版に入口は追加しない。
async function harness() {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' }), errors = [];
  p.on('pageerror', e => errors.push(String(e)));
  p.on('console', m => { if (m.type() === 'error' && /shader|WebGLProgram|GL_INVALID/.test(m.text())) errors.push(m.text()); });
  let scene = fs.readFileSync(__dirname + '/../../js/scene3d.js', 'utf8');
  scene = scene.replace('_st: st, _cam: camera,', '_step: stepGecko, _render: () => renderer.render(scene, camera), _P: P, _st: st, _cam: camera,');
  scene = scene.replace('root.Leopa3D = {', 'root._movement = { MODEL, DEFORM_GLSL }; root.Leopa3D = {');
  await p.route('**/js/scene3d.js', r => r.fulfill({ contentType: 'text/javascript', body: scene }));
  await p.addInitScript(() => { const original = window.setInterval; window._testIntervals = []; window.setInterval = (...args) => { const id = original(...args); _testIntervals.push(id); return id; }; });
  try {
    await p.goto(process.env.BASE || 'http://localhost:8123'); await require('./start.js')(p);
    await p.waitForFunction(() => window.__leopaTank()?._st.gk?.glb);
    await p.evaluate(() => {
      window.tank = __leopaTank(); _testIntervals.forEach(clearInterval); tank.setActive(false); tank.setDecor([]); tank.setPoops(0); tank.setNight(false);
      const s = __leopaState(), g = s.geckos.find(g => g.id === s.selected);
      tank.setGecko({ ...g, size: 1, stage: 'adult', gravid: false, shed: false });
      window.resetMotion = (extra = {}) => {
        tank.takeFoods(); tank.endPairing(); tank.endHandling();
        Object.assign(tank._st, { x: 0, z: 0, yaw: 0, y: 0, slope: 0, phase: 0, walkW: 0, spd: 0, gait: null, motionPrev: null, prevYaw: null, mode: 'idle', wait: 999, sleeping: false, act: null, hand: null, pair: null, hidePeek: null, stalk: 0, hunt: null, meal: null, peekT: 0, idleT: 999, drop: .04, look: 0, pitch: 0, blinkT: 999, blinkV: 0, lick: 0, happy: 0, bend: 0, ap: null, pauseT: 0, t: 0, ...extra });
        tank._step(1 / 60);
      };
      resetMotion();
    });
    return { b, p, errors };
  } catch (e) { await b.close(); throw e; }
}
(async()=>{const {b,p,errors}=await harness();try{
const result=await p.evaluate(()=>{
 const {MODEL,DEFORM_GLSL}=window._movement, st=tank._st, checks=[], metrics={};
 const check=(name,ok,data)=>{checks.push({name,ok,...(data===undefined?{}:{data})});if(!ok)throw Error(name+' '+JSON.stringify(data))};
 const tick=(dt=1/60)=>{st.t+=dt;tank._step(dt)};
 // 実際の描画式を WebGL2 transform feedback で評価する（足中心4点）。
 const gl=document.createElement('canvas').getContext('webgl2');
 const shader=(type,src)=>{const sh=gl.createShader(type);gl.shaderSource(sh,src);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh));return sh};
 const v=shader(gl.VERTEX_SHADER,'#version 300 es\nprecision highp float;\nin vec3 position;\n'+DEFORM_GLSL.replace(/attribute /g,'in ').replace(/varying float vLeo\w+;/g,'')+'\nout vec3 outputPosition;void main(){outputPosition=leoDeform(position);gl_Position=vec4(outputPosition,1.0);}');
 const f=shader(gl.FRAGMENT_SHADER,'#version 300 es\nprecision highp float;out vec4 color;void main(){color=vec4(1.0);}');
 const pr=gl.createProgram();gl.attachShader(pr,v);gl.attachShader(pr,f);gl.transformFeedbackVaryings(pr,['outputPosition'],gl.INTERLEAVED_ATTRIBS);gl.linkProgram(pr);if(!gl.getProgramParameter(pr,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(pr));gl.useProgram(pr);
 const attrib=(name,values,size)=>{const at=gl.getAttribLocation(pr,name);if(at<0)return;const buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(values),gl.STATIC_DRAW);gl.enableVertexAttribArray(at);gl.vertexAttribPointer(at,size,gl.FLOAT,false,0,0)};
 attrib('position',MODEL.feet.flatMap(v=>v.toArray()),3);attrib('aLeg',[1,2,3,4],1);const pivots = []; const legs = MODEL.geo.attributes.aLeg, pivot = MODEL.geo.attributes.aPivot; for (let leg = 1; leg <= 4; leg++) { let at = 0; while (legs.getX(at) !== leg) at++; pivots.push(pivot.getX(at), pivot.getY(at), pivot.getZ(at)); } attrib('aPivot', pivots, 3);attrib('aCy',[0,0,0,0],1);
 const feedback=gl.createBuffer();gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER,feedback);gl.bufferData(gl.TRANSFORM_FEEDBACK_BUFFER,48,gl.DYNAMIC_READ);gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,feedback);gl.enable(gl.RASTERIZER_DISCARD);
 const gpu=()=>{const U=st.gk.U;for(const [name,item] of Object.entries(U)){const loc=gl.getUniformLocation(pr,name);if(loc===null)continue;if(typeof item.value==='number')gl.uniform1f(loc,item.value);else if(Array.isArray(item.value))gl.uniform3fv(loc,item.value.flatMap(v=>v.toArray()));}gl.beginTransformFeedback(gl.POINTS);gl.drawArrays(gl.POINTS,0,4);gl.endTransformFeedback();const out=new Float32Array(12);gl.getBufferSubData(gl.TRANSFORM_FEEDBACK_BUFFER,0,out);return Array.from({length:4},(_,i)=>new THREE.Vector3(...out.slice(i*3,i*3+3)))};
 resetMotion({mode:'walk',target:{x:0,z:2.7},burst:999});
 let maxDrift=0,maxGPUError=0,airFrames=[0,0,0,0],samples=0;const previous=new Map();
 for(let n=0;n<220;n++){
  tick();const gait=st.gait, points=gpu();
  for(let i=0;i<4;i++){
   const foot=gait.feet[i], prev=previous.get(i);if(prev&&!prev.air&&!foot.air)maxDrift=Math.max(maxDrift,foot.at.clone().setY(0).distanceTo(prev.at.clone().setY(0)));
   previous.set(i,{air:foot.air,at:foot.at.clone()});maxGPUError=Math.max(maxGPUError,points[i].distanceTo(st.gk.U.uFootTarget.value[i]));if(foot.air)airFrames[i]++;
  }
  samples++;
 }
 metrics.walk={maxDrift,maxGPUError,airFrames,samples};check('接地中の足が水平に滑らない',maxDrift<.000001,metrics.walk);check('描画側の足中心も接地目標に一致',maxGPUError<.00001,maxGPUError);check('4本すべてで踏み替えがある',airFrames.every(n=>n>0),airFrames);
 st.mode='idle';st.wait=999;st.target=null;for(let n=0;n<60;n++)tick();check('停止後に宙に足を残さない',st.gait.feet.every(f=>!f.air));const phase=st.phase;for(let n=0;n<30;n++)tick();check('停止中に足踏みし続けない',Math.abs(st.phase-phase)<1e-10);
 resetMotion({mode:'walk',target:{x:0,z:-2.5},burst:999});let maxYaw=0,turnFeet=false,prevYaw=st.yaw;for(let n=0;n<180;n++){tick();maxYaw=Math.max(maxYaw,Math.abs(st.yaw-prevYaw)*60);prevYaw=st.yaw;if(st.gait.feet.some(f=>f.air)&&Math.abs(st.yaw)>.1)turnFeet=true;}check('旋回速度が制限されている',maxYaw<=2.20001,maxYaw);check('大きな方向転換でも足を踏み替える',turnFeet);
 resetMotion();tank.startAct('startle');let reverseAir=false;for(let n=0;n<60;n++){tick();reverseAir ||= st.gait.feet.some(f=>f.air)}check('後ずさりしても足が動く',st.z<-.15&&reverseAir,{z:st.z,reverseAir});
 resetMotion();tank.startAct('dig');let frontChange=0,rearChange=0;const homeTargets=st.gk.U.uFootTarget.value.map(x=>x.clone());for(let n=0;n<120;n++){tick();for(let i=0;i<4;i++){const d=st.gk.U.uFootTarget.value[i].distanceTo(homeTargets[i]);if(i<2)frontChange=Math.max(frontChange,d);else rearChange=Math.max(rearChange,d)}}check('掘る動きは前足だけ、後ろ足は支える',frontChange>.10&&rearChange<.00001,{frontChange,rearChange});
 resetMotion();tank.startAct('sniff');let lowHead=false,lick=false;for(let n=0;n<210;n++){tick();lowHead ||= tank._P.pitch>.15;lick ||= tank._P.tongue>.2}check('鼻先を下げて舌で確かめ、通常動作に戻る',lowHead&&lick&&!st.act,{lowHead,lick});
 resetMotion();tank.startAct('stretch');let stretchDrop=1;for(let n=0;n<160;n++){tick();stretchDrop=Math.min(stretchDrop,tank._P.drop)}check('伸びから元の姿勢へ戻る',stretchDrop<0&&!st.act&&st.gait.feet.every(f=>!f.air),stretchDrop);
 resetMotion();tank.startAct('settle',{dur:3});let resting=false;for(let n=0;n<260;n++){tick();resting ||= tank._P.drop>.12}check('ゆっくり体を下げて休める',resting&&!st.act);
 resetMotion();const U=st.gk.U,shared=['uPlant','uFootHome','uFootTarget'];const sh={uniforms:{},vertexShader:'#include <common>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <dithering_fragment>'};st.gk.clawMesh.material.onBeforeCompile(sh);check('爪も脚と同じ接地計算に追従する',shared.every(k=>sh.uniforms[k]===U[k]));
 tank.setDecor([{t:'stone',x:0,z:0,rot:0}]);resetMotion({mode:'walk',target:{x:1.5,z:1.5},burst:999});for(let n=0;n<180;n++)tick();check('岩の上でも足と姿勢が有限',st.gk.U.uFootTarget.value.every(v=>v.toArray().every(Number.isFinite))&&[st.y,st.slope,st.phase].every(Number.isFinite));tank._render();
 return {checks,metrics};
});
assert.deepEqual(result.checks.filter(c => !c.ok), []); assert.deepEqual(errors, []); console.log('動きの検査 ' + result.checks.length + '件 OK'); console.log(JSON.stringify(errors));
}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
