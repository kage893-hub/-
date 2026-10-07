# レオパといっしょ — 引き継ぎメモ（Codex 向け）

スマホ向け PWA の、レオパ（ヒョウモントカゲモドキ）育成・繁殖ゲーム。死なない・やさしい世界。
3D（Three.js r128 ＋ GLB）、遺伝とモルフ（図鑑30種）、リアルな飼育の学び、ひらがなモード、日曜のレプタイルズショーなど。
ビルドの工程はない（素の JS・HTML・CSS）。ユーザーとのやりとりは日本語。

- ブランチ：`claude/inspiring-shannon-n183qo`（最新：`b8292a5` 星のランプ）
- 試遊版：claude.ai のアーティファクト（https://claude.ai/artifact/35oMS3qN9wTf2JHpJaLzuM）。更新は claude.ai 側でしかできない。下の「試遊版」を参照。
- 細かい決まりは CLAUDE.md にも同じものがある（Claude Code 用）。どちらかを変えたら、もう片方も合わせる。

## ファイル構成
| ファイル | 中身 |
|---|---|
| index.html / style.css | 画面 |
| sw.js | オフライン用キャッシュ。**ファイルを変えたら `VERSION` を上げる**（いまは `leopa-v93`）。新しいファイルは `FILES` にも足す |
| js/app.js | ゲーム本体（状態 `S`、`simulate`、各画面、`ACTIONS`、ショー、ライセンス、カード、クレジット `credits()`） |
| js/scene3d.js | 3D（`createTank`・`createViewer`・`hatchScene`・`photo`、ケース `makeCage`・`CAGE_THEMES`、家具 `DECOR`、模様 `skinCanvas`） |
| js/genetics.js | 遺伝（`DEX` 図鑑30種、ライン遺伝のポリジェニック値） |
| js/art.js | 2D の絵と体の色（`colors`） |
| js/family.js | 家系の記録・親子孫のつながり（個体ごとに1件保存） |
| js/study.js | 小学1年生向けの自作問題（さんすう・こくご） |
| js/kids.js | ひらがなモード（MutationObserver で変換。辞書は `D.w`・`EASY`） |
| js/music.js / js/photo-save.js | 音楽／写真の保存・共有 |
| assets/ | gecko.glb、decor-kit.bin（家具）、expo/*.webp（ショー）、img/*.webp（部屋・ケースの背面と床と飾り帯・月の画像・ライセンス証） |
| tools/ | `bundle.py`（試遊版の1枚 HTML）、`add_decor.py`（家具を足す）、`pack_decor.py`（家具ファイルを最初から作る。もとの素材が必要）、`tests/`（回帰テスト） |
| preview/codex/ | 以前 Codex が作った確認版のコピー。公開版とは別。**公開版の作業では触らない** |

## 決まりごと（必ず守る）
- **コミットの前に、スクリーンショットか比較画像をユーザーに見せて、OK をもらう。** OK が出てから、コミット・プッシュ・試遊版の更新をする。
- **コミットしたら、プッシュと公開版（GitHub Pages）への反映まで続けて行う。** 画面確認で OK をもらった変更について、プッシュ・公開反映の許可を別途聞き直さない。ユーザーが「公開しない」などと指定した場合は、その指示を優先する。公開完了は実際に確認できた場合のみ報告し、接続制限などで確認できない場合は、GitHub への送信済みと公開確認の未完了を分けて伝える。
- コミットメッセージは日本語。
- セーブは localStorage の `leopa-together-v1`。**保存キーは変えない。** 新しい項目を足したら `migrate()` で古いデータを直す。
- **モルフの見た目（art.js の色、scene3d.js の模様テクスチャ）は、ユーザーの確認なしに大きく変えない。** 30種は本物の写真（1体10枚）と見比べて調整ずみ（`08acbfc`）。以前の Codex の模様の作り直しは「採用しない」と決まっている。
- 画面の文字は日本語。ひらがなモードは js/kids.js が自動で変換する。読みがおかしい・漢字が残るときは `D.w`（ことば → 読み）か `EASY` に足す。変換させない要素には `data-raw`。
- おなかは「実時間 × 成長段階 × √（ゲームの速さ）」で減る。1倍速で90→30はベビー24時間・ヤング36時間・アダルト72時間。おなか60以下で成長が徐々に遅くなり、0で止まる。0の猶予は1倍速換算で12・24・48時間、その後しっぽの栄養がゆっくり減る。emptyH は空腹0の累積時間（√倍率で1倍速換算）。きれいさは実時間のみ。
- 他人が撮った本物のレオパの写真（参考用）は、リポジトリにも試遊版にも入れない。
- 素材はライセンスを確かめたものだけを使い、クレジット（app.js の `credits()`）に書く。いま使っているのは Quaternius・Kenney・Poly Haven（CC0）、Phosphor Icons（MIT）、Sketchfab の手（CC BY 4.0）、NASA の月の画像（パブリックドメイン）。

- 勉強モードは `S.kids` がオンのときだけ。1回5問、正解1問2コイン、日付ごとに20コインまで。報酬と正解数は `S.study` に保存し、古いセーブは `migrate()` で初期化する。漢字を読む問題の文字は `data-raw` でひらがな変換を止める。

- 家系の記録は `S.familyRecords` に個体ごとに保存し、親のIDでつなぐ。古い親の写しは `seed` で同じ個体を識別し、名前だけでは結び付けない。里親・販売の前にも記録を保存する。新しい親の写しには `id` を含める。
- 行動の傾向は `Leopa3D.behaviorProfile(seed)` で決め、同じ個体では変わらない。行動の傾向の説明は「くわしく見る」の中だけに表示し、ケース画面には表示しない。隠れ家のぞきは捕食・ふれあい・ペアリング・家具変更・個体切り替えで中断できるようにする。

## 動作確認
- サーバー：`npx http-server -p 8123 -s -c-1 .`（つながらなくなったら起動しなおす）
- Playwright ＋ Chromium、画面サイズ 390×844。swiftshader で 3D はとても遅い。
  - 起動の引数：`--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`
- 回帰テスト：`sh tools/tests/run.sh [出力先]`（first・kids2・pairfast・card・expo3・img・nutrition・study・family・behavior・movement）。最後の行が `[]` ならエラーなし。
  - movement は足の接地・旋回・後ずさり・前足だけの掘り動作・待機中のしぐさを検査する。足先の4点だけでなく、描画後の脚の三角形と指先の床・家具・手に対する高さも検査する。接地情報は表示中だけの一時データで、セーブには足さない。
  - 環境変数 `CHROME`（Chromium のパス）、`PLAYWRIGHT`（playwright モジュールのパス）、`BASE`（サーバーの URL）で、環境に合わせられる。
  - kids2 の `chip ghost:あきけーす 2` という出力は、いつも出るもので問題ない。
- テスト用の入り口：`window.__leopaState()`（状態 S）、`window.__leopaTank()`（3D ケース。`_st` が内部状態）、`Leopa3D.itemPhoto(kind, id)`（ショップの見本写真。読みこみ中は null）。
- 時間を進めるテストは、`addInitScript` で偽の `Date` クラスを入れる（tools/tests/expo3.js が例）。
- はじめの流れを進めるヘルパー：tools/tests/start.js。

## 試遊版
- アーティファクトでは相対パスのファイルを読めないので、`python3 tools/bundle.py <出力.html>` で1枚にまとめる（約12MB）。
- 公開は claude.ai の Artifact ツールで、上の URL を指定して行う。Codex からは公開できないので、ユーザーに伝える。
- 試遊版ではホーム画面への追加の案内は出ない。写真の「ダウンロード」は動かないことがある（共有・長押しで保存）。

## 家具とケースの作り方（最近の作業）
- **家具を足す**：Poly Haven の glTF（1k）を取り、`npx gltfpack -i in.gltf -o out.gltf -si <率> -sa -noq -km` で 1,500〜3,000 ポリゴンに減らし、`python3 tools/add_decor.py assets/decor-kit.bin assets/decor-kit.bin out.gltf:PH_名前` で足す。
  - 植物は、別ファイルの alpha 画像を色の画像にまぜて RGBA の PNG にしてから使う。
  - そのあと js/scene3d.js の `DECOR` に項目を足す（`kitOr('PH_名前', 横幅, opt, 代わりの形)`）。`climb`（乗れる）、`soft`（植物）、`drink`（水入れ）、`expo: 'gold'|'night'`（ショー限定）などの印がある。
  - コードで作る家具もある（`amethystCluster`・`moonGlobe`・`ringedPlanet`・`starLamp`）。
- **ショー限定の家具**：`expo` の印がある家具は、ふつうのショップと「家具10種類が半額」に出ず、ショーの「用品」タブで、その週のケース（ゴールド／ミッドナイト）に合うものだけが並ぶ。
- **ケースの見た目**：`CAGE_THEMES` の `backImg`・`floorImg`・`floorScale`・`backFull`（背面を1枚の絵として貼る）・`backTint`・`frameImg`（枠の飾り帯）・`luxe`（ショー限定の豪華な枠：柱・玉・紋章）。
  - 背面の画像は横 6:1 が合う（ユーザーが画像生成で作ることもある）。

## 残っていること・気になっていること
- 値段は仮のものがある：ショー限定の家具（120〜150コイン）。ショー限定ケースは 500 コインで決定。
- 「黄色い花の低木」（Poly Haven の didelta_spinosa）は、黄色い花がほとんど見えない。別の株に変える案あり。
- 「輪のある惑星」は、ケースに置くと輪が大きく白っぽく見える。
- ゴールドのケースは、明るい金色が tone mapping で白っぽく飛びやすい（背面は `backTint`、飾り帯は `trimTint` で暗くしている）。
- ショップの見本写真で、木製ビバリウムと恐竜時代の枠が、設定した色より白っぽく見える（調べていない）。
- 苔の岩はユーザーが選ばなかったので入れていない。植物は2つだけ追加。
- 宝箱は乗れるだけで、中には入れない（シェルターにはしていない）。
