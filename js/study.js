/* 小学1年生向けの問題。文章と選択肢は自作。漢字の問題だけ読みへの変換をしない。 */
(function (root) {
  'use strict';
  const shuffle = list => {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  const int = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  function numbers(prompt, expression, answer, hint, explanation, dots) {
    const choices = new Set([answer]);
    for (const n of shuffle(Array.from({ length: 21 }, (_, i) => i)).sort((a, b) => Math.abs(a - answer) - Math.abs(b - answer))) {
      if (choices.size === 3) break;
      choices.add(n);
    }
    return { prompt, expression, answer: String(answer), choices: shuffle([...choices].map(String)), hint, explanation, dots };
  }
  function mathRound() {
    const a = int(1, 8), b = int(1, 10 - a), total = int(3, 10), take = int(1, total);
    const eggs = int(1, 5), more = int(1, 5), tens = int(6, 9), plus = int(11 - tens, 9), next = int(0, 17);
    return [
      numbers('たしざんを してみよう。', `${a} ＋ ${b} ＝ ？`, a + b, 'まるを ぜんぶ かぞえてみよう。', `${a}に ${b}を たすと ${a + b}だよ。`, [a, b]),
      numbers('ひきざんを してみよう。', `${total} − ${take} ＝ ？`, total - take, `${total}から ${take}こ とると、いくつ のこるかな？`, `${total}から ${take}を ひくと ${total - take}だよ。`),
      numbers(`たまごが ${eggs}こ あります。あと ${more}こ ふえました。ぜんぶで なんこ？`, '', eggs + more, 'はじめの たまごと、ふえた たまごを あわせよう。', `${eggs} ＋ ${more} ＝ ${eggs + more}。ぜんぶで ${eggs + more}こだね。`),
      numbers('10を こえる たしざんに ちょうせん！', `${tens} ＋ ${plus} ＝ ？`, tens + plus, `${tens}に あと ${10 - tens}を たすと 10になるよ。`, `${plus}を ${10 - tens}と ${plus - (10 - tens)}に わけよう。10 ＋ ${plus - (10 - tens)} ＝ ${tens + plus}だね。`),
      numbers('かずを じゅんばんに ならべよう。', `${next} → ？ → ${next + 2}`, next + 1, '1ずつ おおきく なるよ。', `${next}の つぎは ${next + 1}。その つぎは ${next + 2}だよ。`),
    ];
  }
  const KANJI = [
    ['山', 'やま', 'かわ', 'もり'], ['川', 'かわ', 'やま', 'そら'], ['水', 'みず', 'ひ', 'き'],
    ['火', 'ひ', 'みず', 'つち'], ['木', 'き', 'くさ', 'もり'], ['月', 'つき', 'ほし', 'ひ'],
    ['目', 'め', 'くち', 'みみ'], ['口', 'くち', 'て', 'あし'], ['耳', 'みみ', 'め', 'はな'],
    ['手', 'て', 'あし', 'くち'], ['足', 'あし', 'て', 'め'], ['森', 'もり', 'かわ', 'やま'],
    ['犬', 'いぬ', 'ねこ', 'とり'], ['雨', 'あめ', 'ゆき', 'かぜ'], ['花', 'はな', 'くさ', 'き'],
    ['人', 'ひと', 'いぬ', 'とり'], ['白', 'しろ', 'あか', 'あお'], ['赤', 'あか', 'しろ', 'くろ'],
  ];
  const KANA = [
    ['ネコ', 'ねこ', 'ねご', 'れこ'], ['レオパ', 'れおぱ', 'れおば', 'ねおぱ'],
    ['タマゴ', 'たまご', 'たまこ', 'なまご'], ['コオロギ', 'こおろぎ', 'こおろき', 'こおるぎ'],
    ['イヌ', 'いぬ', 'いめ', 'りぬ'], ['ウサギ', 'うさぎ', 'うさき', 'うざぎ'],
    ['サカナ', 'さかな', 'さがな', 'ちかな'], ['トカゲ', 'とかげ', 'とがけ', 'とかな'],
  ];
  const WORDS = [
    ['おてがみに はるものは？', 'きって', 'きて', 'きつて', 'ちいさい「っ」を つかうよ。'],
    ['あまくて つめたい おやつは？', 'アイス', 'アイヌ', 'アイシ', 'カタカナを よく みてみよう。'],
    ['こうえんで こいで あそぶものは？', 'ぶらんこ', 'ぷらんこ', 'ふらんこ', '「ぶ」には てんてんが つくよ。'],
    ['ながい はなを もつ どうぶつは？', 'ぞう', 'そう', 'ぞお', '「ぞう」は 2もじで かくよ。'],
    ['はっぱを ゆっくり たべる むしは？', 'あおむし', 'あおむす', 'あおぬし', '「む」と「ぬ」の かたちに きをつけよう。'],
    ['おなかの ふくろに あかちゃんを いれて はしる どうぶつは？', 'カンガルー', 'カンガル', 'カンガレー', 'さいごの おとは のばして よむよ。'],
  ];
  function languageRound() {
    const kanji = shuffle(KANJI).slice(0, 2).map(([letter, answer, b, c]) => ({
      prompt: 'この かんじは、なんと よむかな？', expression: letter, answer, choices: shuffle([answer, b, c]),
      hint: 'かたちを よく みて、ことばを おもいだそう。', explanation: `「${letter}」は「${answer}」と よむよ。`, raw: true,
    }));
    const kana = shuffle(KANA).slice(0, 2).map(([letter, answer, b, c]) => ({
      prompt: 'ひらがなに すると、どれかな？', expression: letter, answer, choices: shuffle([answer, b, c]),
      hint: '1もじずつ よんでみよう。てんてんや まるにも きをつけてね。', explanation: `「${letter}」は「${answer}」だよ。`,
    }));
    const [prompt, answer, b, c, hint] = shuffle(WORDS)[0];
    return [kana[0], kanji[0], { prompt, expression: '', answer, choices: shuffle([answer, b, c]), hint, explanation: `こたえは「${answer}」だよ。${hint}` }, kana[1], kanji[1]];
  }
  root.LeopaStudy = { makeRound: subject => subject === 'math' ? mathRound() : subject === 'language' ? languageRound() : [] };
})(typeof window === 'undefined' ? globalThis : window);
