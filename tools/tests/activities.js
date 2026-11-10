const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const fs = require('fs'), assert = require('node:assert/strict');
const OUT = process.argv[2] || '/tmp/leopa-tests'; fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/chromium' });
  try {
    const p = await b.newPage({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' }), errors = [];
    p.on('pageerror', e => errors.push(String(e)));
    await p.addInitScript(() => { const get = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (k, ...args) { return k.includes('webgl') ? null : get.call(this, k, ...args); }; const interval = window.setInterval; window._intervals = []; window.setInterval = (...args) => { const id = interval(...args); _intervals.push(id); return id; }; });
    let src = fs.readFileSync(__dirname + '/../../js/app.js', 'utf8');
    src = src.replace(/\}\)\(\);\s*$/, 'window._activityTest={actions:ACTIONS,saveNow,migrate,renderView,daily,applyEat,recordGoalBirth,storyReady,finishWalk,walkProgress,openWalk};})();');
    await p.route('**/js/app.js', r => r.fulfill({ contentType: 'text/javascript', body: src }));
    await p.goto(process.env.BASE || 'http://localhost:8123'); await require('./start.js')(p);
    await p.addStyleTag({ content: '#toast{display:none!important}' });
    await p.evaluate(() => {
      _intervals.forEach(clearInterval); const s = __leopaState(), sample = structuredClone(s.geckos[0]);
      s.geckos = Array.from({ length: 100 }, (_, i) => ({ ...structuredClone(sample), id: 'list-' + i, name: i === 0 ? 'ゆき' : 'レオパ' + i, sex: i % 2 ? 'M' : 'F', growth: 200, hunger: i === 0 ? 15 : 85, clean: i === 1 ? 40 : 100, poop: 0, shedUntil: i === 2 ? Date.now() + 3600000 : 0, sick: i === 3 ? { type: 'belly' } : null, genes: { ...sample.genes, snow: 1 }, decor: [{ t: 'wet', x: -4, z: -2 }, { t: 'dish', x: -4, z: 3 }, { t: 'plant', x: 3, z: -2 }], left: [] }));
      s.selected = 'list-4'; s.cases = 100; s.tut = { step: 99 }; s.coins = 300; _activityTest.renderView();
    });
    await p.locator('[data-action=careMenu]').click();
    assert.equal(await p.locator('.care-person').count(), 100);
    await p.fill('#careSearch', 'ユキ'); assert.equal(await p.locator('.care-person').count(), 1);
    await p.locator('[data-action=favorite]').click();
    assert.equal(await p.locator('[data-action=favorite]').getAttribute('aria-pressed'), 'true');
    await p.fill('#careSearch', '');
    await p.locator('[data-action=careFilter][data-filter=food]').click(); assert.equal(await p.locator('.care-person').count(), 1);
    await p.locator('[data-action=careFilter][data-filter=clean]').click(); assert.equal(await p.locator('.care-person').count(), 1);
    await p.locator('[data-action=careFilter][data-filter=shed]').click(); assert.equal(await p.locator('.care-person').count(), 1);
    await p.locator('[data-action=careFilter][data-filter=health]').click(); assert.equal(await p.locator('.care-person').count(), 1);
    await p.locator('[data-action=careFilter][data-filter=favorite]').click(); assert.equal(await p.locator('.care-person').count(), 1);
    await p.screenshot({ path: OUT + '/お世話一覧.png' });
    await p.locator('[data-action=careSelect]').click(); assert.equal(await p.evaluate(() => __leopaState().selected), 'list-0');
    await p.reload(); await p.waitForFunction(() => window._activityTest); assert.deepEqual(await p.evaluate(() => __leopaState().favorites), ['list-0']);
    await p.evaluate(() => { _intervals.forEach(clearInterval); const s = __leopaState(); s.geckos = s.geckos.slice(0, 2); s.geckos.forEach(g => { g.hunger = 85; g.clean = 100; g.sick = null; g.shedUntil = 0; }); s.selected = s.geckos[0].id; _activityTest.actions.stories(); });
    await p.locator('[data-action=storyStart][data-id=family]').click();
    await p.locator('[data-action=storyClaim][data-id=family]').click();
    assert.equal(await p.evaluate(() => __leopaState().stories.family.step), 1);
    const coins = await p.evaluate(() => __leopaState().coins);
    await p.evaluate(() => { _activityTest.actions.storyClaim({ dataset: { id: 'family', step: '0' } }); });
    assert.equal(await p.evaluate(() => __leopaState().coins), coins);
    // ペットシッターは手動のお世話の依頼を進めない。
    await p.evaluate(() => { const g = __leopaState().geckos[0]; g.hunger = 30; _activityTest.applyEat(g, 'cricketS', false, { automatic: true, now: Date.now() }); });
    assert.equal(await p.evaluate(() => __leopaState().stories.family.counts.fed || 0), 0);
    await p.evaluate(() => { for (let i = 0; i < 3; i++) _activityTest.daily('fed'); _activityTest.daily('cleaned'); _activityTest.actions.stories(); });
    await p.locator('[data-action=storyClaim][data-id=family]').click();
    await p.evaluate(() => { _activityTest.daily('handled'); _activityTest.actions.stories(); });
    await p.locator('[data-action=storyClaim][data-id=family]').click();
    assert.equal(await p.evaluate(() => __leopaState().decorInv.knSign), 1);
    await p.evaluate(() => _activityTest.actions.storyClaim({ dataset: { id: 'family', step: '2' } }));
    assert.equal(await p.evaluate(() => __leopaState().decorInv.knSign), 1);
    // ソラの第一話→実際の目標保存→再起動→親と確率を開く。
    await p.locator('[data-action=storyStart][data-id=breeder]').click();
    await p.evaluate(() => _activityTest.actions.pairPlanner({ dataset: { mode: 'target' } }));
    await p.selectOption('#pairPlanTarget', 'スーパーマックスノー'); await p.locator('[data-action=goalSave]').click();
    await p.locator('[data-action=pairPlanChoose]').first().click(); await p.locator('[data-action=goalSave]').click();
    assert.equal(await p.evaluate(() => __leopaState().breedingGoals.length), 1);
    assert.ok(await p.evaluate(() => __leopaState().stories.breeder.counts.goal >= 1));
    await p.evaluate(() => _activityTest.actions.stories()); await p.locator('[data-action=storyClaim][data-id=breeder]').click();
    await p.evaluate(() => _activityTest.actions.breedingGoals());
    await p.screenshot({ path: OUT + '/繁殖の目標.png' });
    await p.reload(); await p.waitForFunction(() => window._activityTest);
    assert.equal(await p.evaluate(() => __leopaState().breedingGoals[0].target), 'スーパーマックスノー');
    await p.evaluate(() => { _intervals.forEach(clearInterval); _activityTest.actions.breedingGoals(); });
    await p.locator('[data-action=goalOpen]').click(); assert.equal(await p.locator('#pairPlanMom').inputValue(), 'list-0');
    // 本当の孵化経路で目標を達成。新たな購入だけでは達成しない。
    await p.evaluate(() => { const s = __leopaState(); s.eggs.push({ id: 'test-egg', hatchAt: Date.now() - 1, laidAt: Date.now() - 10000, genes: LeopaGenetics.normGenes({ snow: 2 }), tang: 20, poly: LeopaGenetics.normPoly({}), sex: 'F', gen: 2, mom: 'ゆき', dad: 'レオパ1', temp: 29.5 }); _activityTest.actions.closeSheet(); _activityTest.actions.hatch({ dataset: { id: 'test-egg' } }); });
    await p.waitForSelector('#renameInput'); await p.fill('#renameInput', 'ゆきのこ'); await p.locator('#renameForm button').click();
    assert.ok(await p.evaluate(() => __leopaState().breedingGoals[0].achievedAt > 0));
    assert.equal(await p.evaluate(() => __leopaState().stories.breeder.counts.hatched), 1);
    await p.evaluate(() => _activityTest.actions.stories()); await p.locator('[data-action=storyClaim][data-id=breeder]').click();
    await p.evaluate(() => _activityTest.actions.family({ dataset: {} })); await p.evaluate(() => _activityTest.actions.stories());
    await p.locator('[data-action=storyClaim][data-id=breeder]').click(); assert.equal(await p.evaluate(() => __leopaState().decorInv.knObelisk), 1);
    await p.screenshot({ path: OUT + '/みんなのお願い.png' });
    // 限定家具はショップ・割引に混ぜず、通常家具は購入して保存できる。
    await p.evaluate(() => { _activityTest.actions.closeSheet(); document.querySelector('[data-view=shop]').click(); _activityTest.actions.shopTab({dataset:{tab:'interior'}}); });
    assert.equal(await p.locator('#decorItems [data-id=knSign]').count(), 0);
    assert.equal(await p.locator('#decorItems [data-id=knBridge]').count(), 1);
    await p.locator('#decorItems [data-id=knBridge]').click(); await p.locator('[data-action=buyDecor]').click();
    assert.equal(await p.evaluate(() => __leopaState().decorInv.knBridge), 1);
    const limitedBefore = await p.evaluate(() => [__leopaState().coins, __leopaState().decorInv.knSign]);
    await p.evaluate(() => _activityTest.actions.buyDecor({dataset:{t:'knSign'}}));
    assert.deepEqual(await p.evaluate(() => [__leopaState().coins, __leopaState().decorInv.knSign]), limitedBefore);
    // 古いセーブから補完、未知の目標・不正な配置・重複を除去、移行を繰り返しても報酬を足さない。
    const migration = await p.evaluate(() => {
      const old = structuredClone(__leopaState()); delete old.favorites; delete old.breedingGoals; delete old.playpen; delete old.stories;
      const v = _activityTest.migrate(old), one = JSON.stringify([v.favorites, v.breedingGoals, v.playpen, v.stories]); _activityTest.migrate(v);
      const same = one === JSON.stringify([v.favorites, v.breedingGoals, v.playpen, v.stories]);
      v.favorites = ['missing', 'list-0', 'list-0']; v.breedingGoals = [{ target: 'unknown' }]; v.playpen = { slots: [{ t: 'unknown', rot: NaN }] }; const coins = v.coins; _activityTest.migrate(v);
      return { same, favorites: v.favorites, goals: v.breedingGoals.length, slot: v.playpen.slots[0], coins: coins === v.coins };
    });
    assert.deepEqual(migration, { same: true, favorites: ['list-0'], goals: 0, slot: { t: 'corkTunnel', rot: 0 }, coins: true });
    await p.evaluate(() => { __leopaState().kids = true; LKids.set(true); _activityTest.actions.careMenu(); }); await p.waitForTimeout(200);
    assert.equal(await p.locator('#sheetBody').evaluate(el => el.scrollWidth <= el.clientWidth + 1), true);
    await p.screenshot({ path: OUT + '/お世話一覧・ひらがな.png' });
    assert.deepEqual(errors, []);
    console.log('一覧100匹・検索・全フィルター・お気に入り保存・目標の親と再読込・孵化達成・連続依頼・重複報酬防止・自動給餌の除外・旧セーブ移行・ひらがな OK'); console.log('[]');
  } finally { await b.close(); }
})().catch(e => { console.error(e); process.exit(1); });
