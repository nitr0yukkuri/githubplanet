---
name: planet-language-features
description: GitHubPlanetの言語別惑星演出を設計・実装・レビューするときに、確定した視覚表現、判定境界、共通ランタイム、テスト方針を守る。
---

# 言語別惑星演出

GitHubPlanetの言語別惑星を追加・調整・レビューするときに使う。色だけで分類せず、既存のMarsテクスチャを残したまま、言語の性格を表面の構造や周囲の反応として表現する。

## 確定した特徴

- C: 鋼鉄の質感
- CSS: 一方向へ流れる色の変化
- C++: 放置状態のプラズマと細い放電
- C#: 精密に切り出された地形と狭い反射
- Dart: 丸みのある面が滑らかに組み替わる表面と、宇宙を高速通過する短い光
- Go: 惑星の向きに沿う斜めの大気風
- Swift: Goの風に淡い桜色〜白色の粒子が舞う
- Vue: Goの風を穏やかにしたものと葉
- TypeScript: 型に守られた薄い防御殻
- JavaScript: 自由に変化する金色の反応面
- Markdown: 静かな記法の層
- HTML: 地表に刻まれた構造溝、弱い琥珀反射、沈んだ岩石ノード
- Java: 土と砂塵
- Jupyter Notebook: 順番に実行されるセルの反応
- Kotlin: 感電する結晶と枝分かれした電撃
- LLVM: 低温の中間表現ブロック
- PHP: サーバー応答のように広がる表面パルスと周囲を螺旋状に引く重力場
- Rust: 砂漠と増量した砂粒
- Ruby: 外周が自然に燃える太陽・焚き火のような熱
- 言語構成の軌跡: 1位言語が惑星の表面を担当し、2位・3位言語は言語色を持つ短い軌跡として球面近くを巡る。Python固有の軌跡は作らない
- XML: 球面に収まる入れ子構造
- Lua: 暗部と輪郭に静かに残る青白い月光
- Perl: 地表へ新しい模様を足さない深海色と、薄く見えるMarsテクスチャ、広い潮流、視線角で広がるフレネル反射。`map`/`aoMap`は共有契約として保持し、AO由来の斑点は出さない
- Elm: 密度差のある植生が風でわずかに波打つ表面
- Shell: 地表を部分的に覆う厚い寒冷な雲・霧の大気
- HCL: ユーザーごとに決定的な合成可能特色を一つ加えるTerraform Modifier

## 共通ルール

- 既存の `front/img/2k_mars.jpg` を `map` と `aoMap` の契約どおり使い、地形を消さない。
- 言語判定は正規化後の `mainLanguage` 完全一致にする。別言語への誤判定や、色だけのフォールバックは作らない。
- `home` と `card` は `front/js/planet-features/registry.js` 経由の同じランタイムを使う。
- 時間値は `material.userData` のuniformで共有し、既存の更新ループから更新する。
- シェーダーを変えたら `customProgramCacheKey` も更新する。
- エフェクトは惑星として自然に見える範囲に抑え、別言語の特徴を奪う外部リング・過剰な発光・線だけの表現を避ける。
- 地表に点・線・斑点・細かいノイズを機械的に重ねない。地表を使うのは確定した特徴に明記された場合だけにし、それ以外は大気・殻・外周・粒子・照明など地表外のスロットで表現する。
- 海の一体感が必要な場合だけ、単一方向の低周波で幅の広い潮流・深浅勾配を一枚だけ使ってよい。細い帯、交差波、泡、点群へ分解しない。
- 海や大気の表現では、Marsテクスチャを受動的な下地として薄く見せてよいが、その値から点・線・泡・凹凸などの言語演出を生成しない。地表を覆う場合も、意味のない点や線を残さない。
- Shellの雲は広い低周波の雲量と高さ勾配を主役にし、細かいノイズは雲塊の輪郭を崩す補助に留める。
- 「全身海」と明示された惑星では、Marsテクスチャの明暗を海色越しに残してよい。ただし共有ランタイムの `map`/`aoMap` スロットは保持し、AOやテクスチャ値から追加の点・線・泡・凹凸を生成しない。
- 上位3言語はVisual Slotで合成し、1位だけがSurfaceを所有する。2位・3位は競合しないAtmosphere、Shell、Particles、Lighting、Trail、Space、Gravityだけを比率の平方根で抑制して重ねる。Trailは全言語共通の順位表現とし、言語色で識別する。

## モジュールの責務

- C#は `front/js/csharp-planet-precision.js`、Dartは `front/js/dart-planet-surfaces.js`、HTMLは `front/js/html-planet-document.js`、Jupyter Notebookは `front/js/jupyter-planet-cells.js`、LLVMは `front/js/llvm-planet-lowering.js` に置く。
- Markdownは `front/js/markdown-planet-layers.js`、PHPは `front/js/php-planet-pulse.js`、XMLは `front/js/xml-planet-nesting.js` に置く。共通言語軌跡は `front/js/language-composition-trails.js` が担当する。
- TypeScriptは外側の保護、JavaScriptは表面の反応、C#は地形の精度、Dartは丸みのある組み替え、Markdownは記法の層、HTMLは刻まれた構造、XMLは入れ子、Jupyter Notebookは実行セル、LLVMは低温のブロック、PHPは広い応答波を担当する。
- C++はプラズマ、Go・Swift・Vueは風、Java・Rustは地表と粒、Rubyは熱の表現を担当する。似た表現を新しい言語へ安易に流用しない。

## 追加しないもの

Unknown、Bladeなどは、専用の視覚メタファーが決まるまで既存の基本惑星を使う。少数ユーザーの言語を色だけで専用化しない。

## 次に検討する候補（未実装）

次の順番は、現在の演出との重なり、shaderだけで作れる可能性、惑星として見たときの分かりやすさを基準にする。ここにある候補は、追加を決めるまで実装しない。

1. Zig: 無駄のない硬い地形、短い切断面、制御された変化。C#の精密さ、LLVMのブロック、C++の電気とは分ける。
2. Makefile: ビルド工程が順番に積み上がる段階表現。Jupyter Notebook、Python、LLVMとの重なりを解消できる場合だけ採用する。

BladeはHTMLとPHPの中間に見えやすいため保留する。AssemblyはLLVMやC#と役割が重なりやすく、MDXはMarkdownとJavaScriptの混合だけでは専用化の理由にならないため、独立した特徴を決めるまで追加しない。

## 実装と検証

1. 現在のregistry・対象モジュールと既存のテストを確認する。
2. 専用モジュールに完全一致の判定、テクスチャ契約、時間uniform、更新処理を実装する。
3. 判定境界、前後空白・大文字小文字、map/aoMap、uniform、時間差変化を単体テストで確認する。
4. `node --check`、対象テスト、`npm test`、`git diff --check` を実行する。
5. 実カードの `home` と `card` を確認し、Canvas描画、時間差の変化、コンソールエラー0、レイアウト崩れなしを記録する。
6. テスト用惑星や本番DBの行を、演出確認のために追加・更新しない。
