/* お世話一覧・繁殖目標・おさんぽ・連続依頼の保存と内容。 */
(function (root) {
  'use strict';
  const STORIES = [
    { id: 'family', person: 'はじめて飼う家族', title: '小さな家族をむかえる準備', gift: 'knSign', badge: 'お世話の案内人', steps: [
      { title: '安心できるおうち', text: '「どんなおうちなら安心かな？」水入れと隠れ家を置いたケースを見せてあげよう。', kind: 'home', need: 1, coins: 10 },
      { title: '毎日のお世話をお手本に', text: '「ごはんとおそうじも覚えたいな」ごはんを3回食べてもらい、おそうじを1回しよう。', kind: 'care', need: 3, coins: 20 },
      { title: 'ゆっくり仲よく', text: '「急がず待ってあげるんだね」少し休んでからふれあい、手に乗ってもらおう。', kind: 'handled', need: 1, coins: 30 },
    ] },
    { id: 'breeder', person: 'ブリーダーのソラ', title: '次の世代へつなぐ夢', gift: 'knObelisk', badge: '繁殖の研究仲間', steps: [
      { title: '目標を決めよう', text: '「どんな子に会いたい？」生まれる子から探して、繁殖の目標を1つ保存しよう。', kind: 'goal', need: 1, coins: 10 },
      { title: '新しい命との出会い', text: '「卵の中で育つのを楽しみに待とう」1匹ふ化させて、新しい家族をむかえよう。期限はありません。', kind: 'hatched', need: 1, coins: 20 },
      { title: '家族のつながり', text: '「親から何を受け継いだかな？」家系図を開いて、家族のつながりを確認しよう。', kind: 'family', need: 1, coins: 30 },
    ] },
    { id: 'garden', person: '写真屋のミドリ', title: 'お気に入りの小さな庭', gift: 'knPalm', badge: '小さな庭づくり名人', steps: [
      { title: 'くつろぐ場所づくり', text: '「この子に似合うお部屋にしよう」1つのケースに3種類以上の家具を置こう。', kind: 'decor', need: 3, coins: 10 },
      { title: 'はじめてのおさんぽ', text: '「いつもの場所と違うにおいがするね」おさんぽで少し歩くのを見守って、ケースに戻ろう。', kind: 'walk', need: 1, coins: 20 },
      { title: '思い出の一枚', text: '「この瞬間を残そう」カメラで写真を撮って、アルバムに1枚保存しよう。', kind: 'photo', need: 1, coins: 30 },
    ] },
  ];
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
    const old = s.stories && typeof s.stories === 'object' ? s.stories : {};
    s.stories = {};
    for (const story of STORIES) {
      const r = old[story.id]; if (!r || !Number.isInteger(r.step)) continue;
      s.stories[story.id] = { step: Math.max(0, Math.min(story.steps.length, r.step)), counts: {} };
      for (const key of ['fed', 'cleaned', 'handled', 'goal', 'hatched', 'family', 'walk', 'photo']) {
        s.stories[story.id].counts[key] = Number.isFinite(r.counts?.[key]) ? Math.max(0, Math.min(999, Math.floor(r.counts[key]))) : 0;
      }
    }
    s.playpen = { slots: SPOTS.map((_, i) => {
      const d = s.playpen?.slots?.[i];
      return { t: d && (d.t === '' || PEN_ITEMS.includes(d.t)) ? d.t : DEFAULT_PEN[i], rot: Number.isFinite(d?.rot) ? d.rot : 0 };
    }) };
  }
  function record(s, key) {
    for (const story of STORIES) {
      const r = s.stories?.[story.id];
      if (r && r.step < story.steps.length) r.counts[key] = Math.min(999, (r.counts[key] || 0) + 1);
    }
  }
  root.LeopaActivities = { STORIES, SPOTS, DEFAULT_PEN, PEN_ITEMS, normalize, record };
})(window);
