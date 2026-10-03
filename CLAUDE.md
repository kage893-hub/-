# レオパといっしょ — 作業メモ

スマホ向け PWA の、レオパ（ヒョウモントカゲモドキ）育成・繁殖ゲーム。死なない・やさしい世界。
3D（Three.js r128 ＋ GLB）、遺伝とモルフ（図鑑30種）、リアルな飼育の学び、ひらがなモード、日曜のレプタイルズショーなど。

- 作業ブランチ：`claude/inspiring-shannon-n183qo`
- 試遊版（claude.ai アーティファクト）：https://claude.ai/artifact/35oMS3qN9wTf2JHpJaLzuM
- ユーザーとのやりとりは日本語。

## ファイル構成（ビルドの工程はない）
| ファイル | 中身 |
|---|---|
| index.html / style.css | 画面 |
| sw.js | オフライン用キャッシュ。**ファイルを変えたら `VERSION` を上げる**（いまは `leopa-v92`）。新しいファイルは `FILES` にも足す |
| js/app.js | ゲーム本体（状態 `S`、`simulate`、各画面の描画、`ACTIONS`、ショー、ライセンス、カードなど） |
| js/scene3d.js | 3D（`createTank`・`createViewer`・`hatchScene`・`photo`、変形シェーダー、行動 `startAct` など） |
| js/genetics.js | 遺伝（`DEX` 図鑑30種、ライン遺伝のポリジェニック値） |
| js/art.js | 2D の絵と体の色（`colors`） |
| js/kids.js | ひらがなモード（画面の文字を MutationObserver で変換） |
| js/music.js / js/photo-save.js | 音楽／写真の保存・共有 |
| assets/ | gecko.glb、decor-kit.bin、expo/*.webp（ショー）、img/*.webp（部屋の背景・限定ケース・ライセンス証） |
| preview/codex/ | Codex が作った確認版のコピー。公開版とは別。**公開版の作業では触らない** |

## 決まりごと
- セーブは localStorage の `leopa-together-v1`。新しい項目を足したら `migrate()` で古いデータを直す。保存キーは変えない。
- 画面の文字は日本語で書く。ひらがなモードは js/kids.js が自動で変換する。
  - 読みがおかしいときは `D.w`（ことば → 読み）か `EASY`（むずかしい言葉 → やさしい言葉）に足す。
  - 変換させたくない要素には `data-raw` をつける。
- **モルフの見た目（art.js の色、scene3d.js の模様テクスチャ）は、ユーザーの確認なしに大きく変えない。** Codex の模様の作り直しは、採用しないと決まっている。
- おなかは実時間 × 成長段階 × √（ゲームの速さ）で減る。きれいさは実時間のみ。
- **コミットの前に、スクリーンショットで確認してもらう。** OK が出てから、コミット・プッシュ・試遊版の更新をする。
- コミットメッセージは日本語。

## 動作確認
- サーバー：`npx http-server -p 8123 -s -c-1 .`（つながらなくなったら起動しなおす）
- Playwright と Chromium（`/opt/pw-browsers`）。swiftshader なので 3D はとても遅い。
  - 起動の引数：`--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`
  - 画面サイズ：390×844
- テスト用の入り口：`window.__leopaState()`（状態 S）、`window.__leopaTank()`（3D ケース。`_st` が内部状態）
- 時間を進めるテストは、`Date` を差しかえる（`addInitScript` で偽の Date クラスを入れる）。
- はじめの流れを進めるヘルパー（start.js）：

```js
module.exports = async function start(p) {
  const click = async sel => { await p.waitForSelector(sel, { state: 'attached', timeout: 30000 }); await p.evaluate(s => document.querySelector(s).click(), sel); };
  if (await p.waitForSelector('[data-action=firstInstallSkip]', { state: 'attached', timeout: 20000 }).catch(() => null)) await click('[data-action=firstInstallSkip]');
  await click('[data-action=firstModePick][data-v="0"]');
  await click('[data-action=starterList]');
  await p.waitForTimeout(1500);
  for (const name of ['レオ', 'もち']) {
    await click('[data-action=starterPick]');
    await p.waitForSelector('#renameInput', { timeout: 30000 });
    await p.fill('#renameInput', name);
    await click('#renameForm button');
  }
  await p.waitForTimeout(800);
};
```

## 試遊版の更新
アーティファクトでは相対パスのファイルを読めないため、すべてを1枚の HTML にまとめて、`url` を指定して publish する。

```python
import re, base64, glob, os
R = './'  # リポジトリのルート
b64 = lambda f: base64.b64encode(open(R + f, 'rb').read()).decode()
h = open(R + 'index.html').read()
h = h.replace('<link rel="stylesheet" href="style.css">', '<style>' + open(R + 'style.css').read() + '</style>')
h = re.sub(r'<link rel="(manifest|icon|apple-touch-icon)"[^>]*>\n?', '', h)
h = re.sub(r'<picture>.*?</picture>', '<img src="data:image/webp;base64,%s" alt="レオパといっしょ" width="720" height="178">' % b64('assets/logo.webp'), h, flags=re.S)
h = h.replace('<script src="js/vendor/three.min.js"></script>',
              '<script>window.LEOPA_MODEL_B64="%s";window.LEOPA_KIT_B64="%s";</script>\n<script src="js/vendor/three.min.js"></script>' % (b64('assets/gecko.glb'), b64('assets/decor-kit.bin')))
h = re.sub(r'<script src="([^"]+)"></script>', lambda m: '<script>' + open(R + m.group(1)).read().replace('</script>', '<\\/script>') + '</script>', h)
for d in ('img', 'expo'):
    for f in glob.glob(R + 'assets/%s/*.webp' % d):
        h = h.replace('assets/%s/%s' % (d, os.path.basename(f)), 'data:image/webp;base64,' + b64('assets/%s/%s' % (d, os.path.basename(f))))
h = h.replace('src="assets/expo/trophy${t.rank}.webp"', 'src="${EXPO_IMG[t.rank]}"').replace('src="assets/expo/trophy${rank}.webp"', 'src="${EXPO_IMG[rank]}"')
h = h.replace('<script>window.LEOPA_MODEL_B64', '<script>window.EXPO_IMG=[0,' + ','.join('"data:image/webp;base64,%s"' % b64('assets/expo/trophy%d.webp' % i) for i in (1, 2, 3)) + '];</script>\n<script>window.LEOPA_MODEL_B64', 1)
open('<スクラッチパッド>/leopa-together.html', 'w').write(h)
```

- 書き出したファイルを、Artifact ツールで `url: https://claude.ai/artifact/35oMS3qN9wTf2JHpJaLzuM` を指定して publish する。
- 試遊版はページの中で動くので、ホーム画面への追加の案内は出ない。また、写真の「ダウンロード」はうまく動かないことがある（共有・長押しで保存）。
