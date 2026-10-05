/* 家系の記録は個体ごとに1件。親のIDでつなぎ、里親に出した子も残す。 */
(function (root) {
  'use strict';
  function sync(s) {
    const records = s.familyRecords || (s.familyRecords = {}), seeds = new Map();
    for (const [id, g] of Object.entries(records)) if (Number.isFinite(g.seed)) seeds.set(g.seed, id);
    for (const g of s.geckos || []) if (Number.isFinite(g.seed)) seeds.set(g.seed, g.id);
    const visiting = new Set();
    function remember(g, fallback, live, depth) {
      if (!g || depth > 24) return null;
      const id = g.id || (Number.isFinite(g.seed) ? seeds.get(g.seed) || 'past-' + g.seed : 'unknown-' + fallback);
      if (visiting.has(g)) return null;
      visiting.add(g);
      if (Number.isFinite(g.seed)) seeds.set(g.seed, id);
      let r = records[id];
      if (!r || live) {
        const previous = r || {};
        r = records[id] = { id, name: g.name || '名前の記録なし', sex: g.sex, gen: g.gen, seed: g.seed,
          genes: g.genes ? Object.assign({}, g.genes) : previous.genes || null, tang: g.tang, poly: g.poly ? Object.assign({}, g.poly) : previous.poly || null,
          growth: g.growth == null ? previous.growth : g.growth, hatched: g.hatched == null ? previous.hatched : g.hatched, parents: previous.parents || {} };
      }
      if (g.parents) {
        for (const role of ['mom', 'dad']) {
          const parent = remember(g.parents[role], id + '-' + role, false, depth + 1);
          if (parent) r.parents[role] = parent;
        }
      }
      visiting.delete(g);
      return id;
    }
    for (const g of s.geckos || []) remember(g, g.id, true, 0);
    for (const g of s.geckos || []) if (g.gravid && g.gravid.dad) remember(g.gravid.dad, g.id + '-partner', false, 0);
    for (const e of [...(s.eggs || []), ...(s.layBox || [])]) {
      remember(e.pmom, e.id + '-mom', false, 0); remember(e.pdad, e.id + '-dad', false, 0);
    }
    return records;
  }
  function relatives(s, id) {
    const all = s.familyRecords || {}, g = all[id];
    if (!g) return null;
    const children = Object.values(all).filter(x => x.id !== id && x.parents && (x.parents.mom === id || x.parents.dad === id));
    const childIds = new Set(children.map(x => x.id));
    const grandchildren = Object.values(all).filter(x => x.id !== id && !childIds.has(x.id) && x.parents && (childIds.has(x.parents.mom) || childIds.has(x.parents.dad)));
    return { g, mom: all[g.parents.mom] || null, dad: all[g.parents.dad] || null, children, grandchildren };
  }
  root.LeopaFamily = { sync, relatives };
})(typeof window === 'undefined' ? globalThis : window);
