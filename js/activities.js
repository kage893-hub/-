/* お世話一覧・繁殖目標・おさんぽの保存と内容。 */
(function (root) {
  'use strict';
  const SPOTS = [
    { name: '左の場所', x: -5, z: -2 },
    { name: '奥の場所', x: 0, z: -3.4 },
    { name: '右の場所', x: 5, z: 1.8 },
  ];
  const DEFAULT_PEN = ['corkTunnel', 'plant', 'stone'];
  const PEN_ITEMS = ['corkTunnel', 'plant', 'stone', 'knFlatRock', 'knSteps', 'knBridge', 'knStump', 'knBush', 'knPurple', 'knYellow', 'knPalm', 'knCactus', 'knMushroom', 'knBamboo'];
  function normalize(s) {
    const ids = new Set(s.geckos.map(g => g.id));
    s.favorites = [...new Set(Array.isArray(s.favorites) ? s.favorites.filter(id => ids.has(id)) : [])];
    const targets = new Set();
    s.breedingGoals = (Array.isArray(s.breedingGoals) ? s.breedingGoals : []).filter(g => {
      if (!g || targets.has(g.target) || !root.LeopaGenetics.DEX.some(d => d.id === g.target)) return false;
      targets.add(g.target); return true;
    }).slice(0, 5).map(g => ({ target: g.target, mom: typeof g.mom === 'string' ? g.mom : '', dad: typeof g.dad === 'string' ? g.dad : '',
      createdAt: Number.isFinite(g.createdAt) ? g.createdAt : 0, achievedAt: Number.isFinite(g.achievedAt) ? g.achievedAt : 0,
      child: typeof g.child === 'string' ? g.child.slice(0, 40) : '', childId: typeof g.childId === 'string' ? g.childId : '' }));
    // 廃止したお願いの旧記録は読み捨てず、所持品も保つ。新しい進捗は作らない。
    s.playpen = { slots: SPOTS.map((_, i) => {
      const d = s.playpen?.slots?.[i];
      return { t: d && (d.t === '' || PEN_ITEMS.includes(d.t)) ? d.t : DEFAULT_PEN[i], rot: Number.isFinite(d?.rot) ? d.rot : 0 };
    }) };
  }
  root.LeopaActivities = { SPOTS, DEFAULT_PEN, PEN_ITEMS, normalize };
})(window);
