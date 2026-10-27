<p align="right"><strong>日本語</strong> | <a href="README.en.md">English</a></p>

<div align="center">
  <img src="front/img/GitHubPlanet_logo.png" width="420" alt="GitHub Planet Logo">
  <h1>🪐 GitHub Planet</h1>
  <p>GitHubの活動履歴を、ひとつの生きた3D惑星として観測するWebアプリケーション。</p>
  <p>
    <a href="https://githubplanet.dev/">Live product</a> ·
    <a href="https://githubplanet.dev/showcase/typescript">Showcase</a> ·
    <a href="https://githubplanet.dev/card.html?showcase=typescript&amp;fix=true">Planet card</a>
  </p>
</div>

> GitHub PlanetはGitHub公式とは関係のない、オープンソースのインタラクティブ作品です。

## GitHub Planetとは

GitHub Planetは、開発者のGitHub活動を、宇宙空間に浮かぶ3D惑星として表現します。所有する公開リポジトリの言語構成、コントリビューション、Star、外部リポジトリへの貢献などを集計し、その結果を惑星の色、表面、大きさ、回転、周囲の星、実績に反映します。GitHubでピン留めした代表作品は惑星全体の言語集計から分け、作品ごとの構成言語を表示します。言語比率はリポジトリ全体の構成を表し、本人が追加したコードだけの比率ではありません。

この作品の中心は、数字の一覧ではなく、自分の開発履歴を反映した惑星を回転させて表面の質感や言語ごとの表現を観察し、他の開発者の惑星と見比べられることにあります。

## 🏆 受賞歴

- **CSS Winner Star** 受賞（Score 7.5）— https://www.csswinner.com/details/github-planet/19334
- **Demo Stage 最優秀賞**
- **技育CAMP Vol.14 優秀賞**
- **技育博 Vol.6 企業賞（ウイングアーク1st）**
- **ヒーローズ・リーグ 2025 決勝進出**

## 🎬 まずは1分で体験

[ログイン不要のデモを開く](https://githubplanet.dev/demo?showcase=typescript)

1. デモを開く
2. 惑星の色・表面・大きさ・回転を見る
3. 実績や言語ごとの表現を確認する
4. 言語別ショーケースを切り替えて比較する

このデモでは固定データを使っており、実在のGitHubユーザーや本番データベースに依存しません。

## 主な体験

- **自分だけの惑星:** GitHub OAuthで取得した活動データをもとに、個性のある惑星を生成します。
- **3D観測:** Three.js / WebGLで惑星を3D表示して回転させ、ステータスドロワーで言語構成、コントリビューション、称号を確認できます。
- **言語固有の表現:** 言語ごとに球体の色だけでなく、表面マテリアル、シェーダー、外殻、風、砂塵、結晶なども切り替えます。
- **宇宙の探索:** ユーザー名で検索したりランダムに訪問したりして、保存済みの他のユーザーの惑星を観測できます。
- **リアルタイム流星:** GitHub Push WebhookのイベントをSocket.IOで配信し、変更された言語と変更量に応じて流星の色と大きさを表示します。
- **実績と称号:** 初めての惑星、コントリビューション数、Star、外部リポジトリへの貢献、使用言語数などを条件に、実績と称号を解除できます。
- **プロフィールカード:** 惑星を横長の静止画カードやアニメーションGIFにして、GitHubプロフィールに掲載できます。
- **日英対応:** ホーム、カード、実績、設定、認証の主要な導線は日本語と英語に対応しています。

## データが惑星になるまで

```text
GitHub OAuth
    ↓
GitHub REST / GraphQL
    ↓
リポジトリ・言語・コントリビューション・PRを集計
    ↓
惑星の色 / 名前 / サイズ / 回転 / 実績 / 称号を決定
    ↓
PostgreSQLへ保存
    ↓
Three.jsの惑星として描画

GitHub Push Webhook → Express → Socket.IO → 閲覧中のブラウザに流星
```

### 反映されるデータ

| データ | 反映先 |
| --- | --- |
| 所有する公開リポジトリの最大構成言語 | 主言語、基本色、言語固有の惑星表現 |
| 所有する公開リポジトリごとの言語バイト数 | `languageStats`と主言語判定 |
| GitHubでピン留めしたリポジトリ | 代表作品欄と作品ごとの言語構成。Fork作品はFork元も表示 |
| 年間コントリビューション | 惑星の累計値、実績、周囲の星の密度 |
| 直近約8日間の活動 | 回転速度、週間コントリビューション、速度系実績 |
| Star数 | Star系実績 |
| 外部所有リポジトリへの貢献・マージ済みPR | 外部貢献・ファーストコンタクト系実績 |
| Pushされたファイルの拡張子・変更量 | リアルタイム流星の言語色・大きさ |

集計値にはドメイン上限があり、累計コントリビューションは最大`99,999`、週間コントリビューションは最大`100`までです。未登録言語の色と惑星名のフォールバックは、Geminiが設定されている場合に限り生成します。

## 惑星レンダリングの構成

惑星はひとつのエフェクトだけで描画するのではなく、複数のレイヤーを組み合わせて描画します。

1. **宇宙背景:** `front/img/skybox/`の空間テクスチャを使います。
2. **惑星表面:** `front/img/2k_mars.jpg`をベースにした球体に、法線、照明、AOを適用します。
3. **言語別表現:** 主言語に応じて、マテリアル、外殻、風、葉、結晶、砂塵、構造を表現します。
4. **大気・オーラ:** 言語や活動量に応じて縁取りや発光を加え、風のウェイクを表現します。
5. **活動の星:** 累計コントリビューションから計算した星を惑星の周囲に表示します。
6. **流星:** Webhookから配信される一時的なイベントを流星として表示します。

### 現在の言語別ビジュアル

言語の判定と描画は `front/js/planet-features/registry.js` に集約し、ホームとカードの両方から同じランタイムを利用します。

| 言語 | 表現 | 実装モジュール |
| --- | --- | --- |
| C | 鋼鉄の表面と控えめなリム | `c-planet-steel.js` |
| CSS | 一方向に流れる色の地形 | `css-planet-flow.js` |
| C++ | 安定したプラズマ／稲妻 | `cpp-planet-lightning.js` |
| Elm | 森と草地がつながる地表の植生 | `elm-planet-vegetation.js` |
| Go | 風の流れと大気ウェイク | `go-planet-wind.js` |
| Swift | Go系の風と羽根状パーティクル | `swift-planet-feathers.js` |
| Vue | 穏やかな風と葉のレイヤー | `vue-planet-circulation.js` |
| TypeScript | 防御的な多重シェル | `typescript-planet-shell.js` |
| JavaScript | 局所反応とゴールド系サーフェス | `javascript-planet-reactivity.js` |
| Java | 土壌と地表ダスト | `java-planet-soil.js` |
| Kotlin | 結晶・コア・電気的な線 | `kotlin-planet-crystal.js` |
| Perl | 海洋を思わせる地表表現 | `perl-planet-ocean.js` |
| Python | 構造的な地表と軌跡 | `python-planet-structure.js` |
| Rust | 砂漠地形と砂塵 | `rust-planet-desert.js` |
| Ruby | 太陽熱・コロナ・エンバー | `ruby-planet-solar.js` |

対応言語のカタログと色定義は、専用レンダラーの一覧とは別に `src/domain/planet/constants.js` で管理しています。未登録言語でも、色と名前のフォールバックによって惑星データを保持できます。

Python向けの表現では、構造的な地表とそれに対応する軌跡を表示します。

## 言語別ショーケース

各ショーケースでは、実在ユーザーやデータベースに依存しない固定データを使います。累計コントリビューションを`2,000`、週間コントリビューションを`24`、サイズ係数を`2`に固定し、言語ごとの表現を比較できます。

<table>
  <tr>
    <td align="center" width="50%">
      <strong>CSS — Directional Color Flow</strong><br>
      <a href="https://githubplanet.dev/card.html?showcase=css&amp;fix=true">
        <img width="400" alt="CSS showcase planet" src="https://raw.githubusercontent.com/nitr0yukkuri/githubplanet/card-assets/showcase_css.gif">
      </a>
    </td>
    <td align="center" width="50%">
      <strong>C++ — Idle Plasma Globe</strong><br>
      <a href="https://githubplanet.dev/card.html?showcase=cpp&amp;fix=true">
        <img width="400" alt="C++ showcase planet" src="https://raw.githubusercontent.com/nitr0yukkuri/githubplanet/card-assets/showcase_cpp.gif">
      </a>
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <strong>Go — Atmospheric Wind</strong><br>
      <a href="https://githubplanet.dev/card.html?showcase=go&amp;fix=true">
        <img width="400" alt="Go showcase planet" src="https://raw.githubusercontent.com/nitr0yukkuri/githubplanet/card-assets/showcase_go.gif">
      </a>
    </td>
    <td align="center" width="50%">
      <strong>TypeScript — Defensive Typed Shell</strong><br>
      <a href="https://githubplanet.dev/card.html?showcase=typescript&amp;fix=true">
        <img width="400" alt="TypeScript showcase planet" src="https://raw.githubusercontent.com/nitr0yukkuri/githubplanet/card-assets/showcase_typescript.gif">
      </a>
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <strong>JavaScript — Reactive Golden Surface</strong><br>
      <a href="https://githubplanet.dev/card.html?showcase=javascript&amp;fix=true">
        <img width="400" alt="JavaScript showcase planet" src="https://raw.githubusercontent.com/nitr0yukkuri/githubplanet/card-assets/showcase_javascript.gif">
      </a>
    </td>
    <td align="center" width="50%">
      <strong>Java — Java Roast</strong><br>
      <a href="https://githubplanet.dev/card.html?showcase=java&amp;fix=true">
        <img width="400" alt="Java showcase planet" src="https://raw.githubusercontent.com/nitr0yukkuri/githubplanet/card-assets/showcase_java.gif">
      </a>
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <strong>Kotlin — Electric Spark</strong><br>
      <a href="https://githubplanet.dev/card.html?showcase=kotlin&amp;fix=true">
        <img width="400" alt="Kotlin showcase planet" src="https://raw.githubusercontent.com/nitr0yukkuri/githubplanet/card-assets/showcase_kotlin.gif">
      </a>
    </td>
    <td align="center" width="50%">
      <strong>Rust — Desert Dust World</strong><br>
      <a href="https://githubplanet.dev/card.html?showcase=rust&amp;fix=true">
        <img width="400" alt="Rust showcase planet" src="https://raw.githubusercontent.com/nitr0yukkuri/githubplanet/card-assets/showcase_rust.gif">
      </a>
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <strong>Vue — Gentle Reactive Wind</strong><br>
      <a href="https://githubplanet.dev/card.html?showcase=vue&amp;fix=true">
        <img width="400" alt="Vue showcase planet" src="https://raw.githubusercontent.com/nitr0yukkuri/githubplanet/card-assets/showcase_vue.gif">
      </a>
    </td>
    <td align="center" width="50%">
      <strong>Ruby — Burning Ruby</strong><br>
      <a href="https://githubplanet.dev/card.html?showcase=ruby&amp;fix=true">
        <img width="400" alt="Ruby showcase planet" src="https://raw.githubusercontent.com/nitr0yukkuri/githubplanet/card-assets/showcase_ruby.gif">
      </a>
    </td>
  </tr>
  <tr>
    <td align="center" width="50%" colspan="2">
      <strong>Python — Paired Orbital Trails</strong><br>
      <a href="https://githubplanet.dev/card.html?showcase=python&amp;fix=true">
        <img width="400" alt="Python showcase planet" src="https://raw.githubusercontent.com/nitr0yukkuri/githubplanet/card-assets/showcase_python.gif">
      </a>
    </td>
  </tr>
</table>

カードを画像付きでまとめた一覧は[カードギャラリー](docs/cards/README.md)（[English](docs/cards/README.en.md)）を参照してください。

ローカル環境ではDBなしでも、次のURLから確認できます。

```text
http://localhost:3000/showcase/typescript
http://localhost:3000/demo?showcase=ruby
```

## 画面とルート

| 画面 | URL | 用途 |
| --- | --- | --- |
| ホーム | `/` / `/en` | 自分の惑星、検索、ランダム訪問、メニュー |
| 展示導線 | `/exhibition` | 初回説明を含む展示入口 |
| 惑星ショーケース | `/showcase/:slug` | 固定データの言語別惑星 |
| 惑星デモ | `/demo?showcase=:slug` | UIを省いた惑星確認 |
| プロフィールカード | `/card.html?username=:name` | ユーザー惑星と共有用Markdown |
| スクリーンショットカード | `/card.html?username=:name&fix=true` | OGP・静止画キャプチャ向け |
| 実績 | `/achievements` | 実績と達成率の確認 |
| 設定 | `/settings` | 解放済み称号の組み合わせを保存 |

英語版の画面は`/en`または`/english`のプレフィックスで利用できます。

### 主なAPI

| Method | Path | 説明 |
| --- | --- | --- |
| `GET` | `/api/me` | ログイン中の惑星、更新通知、進捗を返す |
| `GET` | `/api/planets/showcase/:slug` | 固定ショーケース惑星を返す。DB不要 |
| `GET` | `/api/planets/user/:username` | 保存済みユーザー惑星を返す。必要に応じて更新 |
| `GET` | `/api/planets/random` | 前回と自分を避けてランダム惑星を返す |
| `POST` | `/api/save-title` | 解放済みの称号だけをサーバー側で検証して保存 |
| `POST` | `/webhook` | GitHub Push Webhookを受けて流星イベントを配信 |

`/api/meteor`、`/api/test-gemini`、`/api/debug-color/:lang`、`/api/debug-name/:lang` は開発・運用向けの内部エンドポイントです。公開環境では内部認証やWebhook署名検証の設定を確認してください。

## プロフィールカード

### 静止カード（標準）

GitHubプロフィールのREADMEには、静止カードをそのまま貼り付けられます。リポジトリへのファイル追加やGitHub Actionsの設定は不要です。

```markdown
[![GitHub Planet](https://image.thum.io/get/width/800/crop/400/noanimate/wait/8/https://githubplanet.dev/card.html?username=ユーザー名&fix=true)](https://githubplanet.dev/card.html?username=ユーザー名)
```

### アニメーションGIFカード（任意、GitHub Actionsを使用）

惑星の動きを表示する場合は、プロフィールREADMEのリポジトリから再利用可能ワークフローを呼び出します。GitHub **Actions** の **Update Planet Card** を一度手動で実行すると、以降はスケジュールに沿って更新できます。

```yaml
name: Update Planet Card

on:
  schedule:
    - cron: '0 0 * * *'
  workflow_dispatch:

jobs:
  generate:
    permissions:
      contents: read
    uses: nitr0yukkuri/githubplanet/.github/workflows/generate-profile-card-gif.yml@main
    with:
      username: あなたのGitHubユーザー名

  publish:
    needs: generate
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v5
      - uses: actions/download-artifact@v4
        with:
          name: planet-card
          path: .
      - name: Commit updated GIF
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add planet-card.gif
          git diff --cached --quiet && exit 0
          git commit -m "Update animated planet card [skip ci]"
          git push
```

生成物がGIF画像であることを、次のコマンドで確認できます。

```bash
file planet-card.gif | grep -q "GIF image data"
```

公開時の詳しい処理は`.github/workflows/generate-profile-card-gif.yml`と`.github/workflows/update-card.yml`を参照してください。公式リポジトリの定期実行ワークフローでは、プロフィールカードと11種類のショーケースGIFをPlaywrightとFFmpegで生成し、`card-assets`ブランチへ公開します。

生成したGIFをプロフィールREADMEに表示する場合は、次の形式を使います。

```markdown
[![GitHub Planet](https://raw.githubusercontent.com/GitHubユーザー名/GitHubユーザー名/main/planet-card.gif)](https://githubplanet.dev/card.html?username=GitHubユーザー名)
```

公式プロフィールカードのGIFは、次のURLから取得できます。

```text
https://raw.githubusercontent.com/nitr0yukkuri/githubplanet/card-assets/profile_card.gif
```

## 技術構成

GitHub Planetは、Node.jsアプリケーションを責務ごとのレイヤーに分けたモジュラーモノリスです。

| レイヤー | 技術 | 主な責務 |
| --- | --- | --- |
| Frontend | HTML / CSS / ES Modules | 画面、操作、日英ローカライズ |
| 3D / Graphics | Three.js `0.160.0` / WebGL / GLSL | 惑星、シェーダー、星、オーラ、流星 |
| Presentation | Express | ページ、認証、API、WebhookのHTTP境界 |
| Application | Node.js ES Modules | GitHubデータの集計、惑星更新、検索、進捗 |
| Domain | JavaScript | 実績、称号、上限値、惑星の個性ルール |
| Infrastructure | PostgreSQL / GitHub API / Gemini | 永続化と外部サービス接続 |
| Realtime | Socket.IO | Pushイベントからブラウザへの流星配信 |
| Operations | Docker / Google Cloud Run / GitHub Actions | 開発環境、ホスティング、カード生成 |
| Testing | Node.js Test Runner | HTTP、ドメイン、DB、外部API、シェーダーの回帰テスト |

### ディレクトリの役割

```text
server.js                         Composition Root / HTTPサーバー
src/presentation/http/            ルートとHTTP入出力
src/application/                  ユースケースとデータ集計
src/domain/planet/                惑星・実績・称号のルール
src/infrastructure/               PostgreSQL / GitHub / Geminiアダプター
front/js/home.js                  ホームのThree.jsランタイム
front/js/card.js                  共有カードのThree.jsランタイム
front/js/planet-features/         言語別表現の共通レジストリ
front/img/                        Marsテクスチャ、skybox、アイコン
migrations/                       PostgreSQLの順序付きマイグレーション
scripts/                          カード録画、性能計測、DB補助
.github/workflows/                DB・カード生成の自動化
test/                             Node.jsテスト
```

依存方向は`Presentation → Application → Domain`を基本とし、外部サービスの具体的な通信は`Infrastructure`に閉じ込めます。起動時はDBがある場合に適用済みマイグレーションを検証し、実行は`npm run migrate`で別に行います。

## 📣 紹介ポスト

- [DemoStage Summer 最優秀賞の受賞報告](https://x.com/lena_gig/status/2083880465019338867)（@lena_gig、2026年8月）
- [CSS Winner STAR 獲得の投稿](https://x.com/lena_gig/status/2088272346117455987)（@lena_gig、2026年8月）
- [プラネット技育展 予選進出の報告](https://x.com/lena_gig/status/2111454798038159431)（@lena_gig、2026年10月）

## セットアップ

### 必要なもの

- Docker Desktop（推奨）またはNode.js 24.22.1（25未満）とPostgreSQL 15以上
- GitHub OAuth App
- GitHub Personal Access Tokenは不要です。ログイン後のOAuthアクセストークンをサーバーが利用します。
- Gemini APIキーは任意です。未登録言語の色・名前フォールバックを使う場合だけ必要です。

### 1. 環境変数を作成

リポジトリ直下に`.env`を作成します。`.env`はGit管理対象外です。

```ini
NODE_ENV=development
PORT=3000
SESSION_SECRET=local-development-secret

# Docker Composeではapp/dbサービス間の値を使います。
# node server.jsをホストから直接起動する場合はlocalhostのPostgreSQLへ変更してください。
DATABASE_URL=postgres://githubplanet:password@db:5432/githubplanet

# GitHub OAuth App（Homepage URL: http://localhost:3000）
# Authorization callback URL: http://localhost:3000/callback
GITHUB_CLIENT_ID_LOCAL=your-client-id
GITHUB_CLIENT_SECRET_LOCAL=your-client-secret

# 任意
GEMINI_API_KEY=your-gemini-api-key
SYSTEM_API_KEY=local-system-key
GITHUB_WEBHOOK_SECRET=local-webhook-secret
```

ローカル環境のOAuth callback URLは、実行ポートに応じて`http://localhost:<PORT>/callback`になります。本番環境では`GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET`、`CALLBACK_URL`を使います。

### 2. Docker Composeで起動（推奨）

```bash
docker compose up --build
```

Docker ComposeはPostgreSQL、マイグレーション、Node.jsアプリを起動します。マイグレーションが成功してからアプリが起動します。

ブラウザで <http://localhost:3000/> を開きます。アプリの停止には`Ctrl+C`を使います。

### 3. ホスト上で起動する場合

PostgreSQLを用意し、`DATABASE_URL`に接続先を設定してから、次のコマンドを実行します。

```bash
npm ci
npm run migrate
npm start
```

開発中はファイル変更を監視する`npm run dev`も使えます。

```bash
npm run dev
```

### DBなしでショーケースだけ確認する場合

開発環境では`DATABASE_URL`を設定しなくてもアプリを起動できます。DBへの保存、ログイン後の惑星表示、ユーザー検索、ランダム検索は利用できませんが、固定ショーケースAPIと画面は確認できます。

```bash
$env:PORT=3000
$env:NODE_ENV='development'
npm start
```

```text
http://localhost:3000/showcase/typescript
http://localhost:3000/api/planets/showcase/ruby
```

### テスト用シード惑星

CSSの固定データをPostgreSQLに投入するCompose profileを利用できます。

```bash
docker compose --profile css-test up --build
```

## 環境変数

| 変数 | 必須 | 用途 |
| --- | --- | --- |
| `PORT` | No | HTTPポート。既定値は`3000` |
| `NODE_ENV` | No | `production`で本番向け設定と署名検証を有効化 |
| `DATABASE_URL` | 本番必須 | PostgreSQL接続文字列 |
| `SESSION_SECRET` | 推奨 | Express Sessionの署名 |
| `GITHUB_CLIENT_ID_LOCAL` / `GITHUB_CLIENT_SECRET_LOCAL` | 開発OAuth時 | ローカル用GitHub OAuth App |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | 本番OAuth時 | 本番用GitHub OAuth App |
| `CALLBACK_URL` | 本番では推奨 | OAuth callback URL |
| `GEMINI_API_KEY` | No | 未登録言語の色・名前フォールバック |
| `SYSTEM_API_KEY` | 内部連携時 | カード生成などの内部API認証 |
| `GITHUB_WEBHOOK_SECRET` | 本番推奨 | Push Webhookの署名検証 |
| `PUBLIC_BASE_URL` | No | 外部URL生成に使う公開ベースURL |
| `RANDOM_HISTORY_STORAGE` | No | ランダム訪問履歴。`cookie`または`session` |
| `RANDOM_QUERY_STRATEGY` | No | ランダム検索戦略。既定値は`indexed` |
| `RANDOM_QUERY_SMALL_TABLE_THRESHOLD` | No | 小規模テーブルで旧方式へ切り替える件数 |
| `PERF_TRACE_RANDOM` | No | ランダム検索の段階別計測 |
| `PERF_TRACE_EXTERNAL` | No | GitHub・Gemini外部通信の計測 |

## 開発コマンド

```bash
npm ci                  # 依存関係をlockfileどおりにインストール
npm start               # Node.jsサーバーを起動
npm run dev             # node --watchで起動
npm run migrate         # 未適用DBマイグレーションを適用
npm test                # 直列実行の全テスト
```

性能を調査するスクリプトも用意しています。

```bash
npm run perf:compare-random
npm run perf:random-sql
npm run perf:random-http
```

### マイグレーションの運用

- migrationは未使用の次の3桁番号で追加し、適用後はファイルの内容を変更・再利用しません。
- 起動時は`schema_migrations`のchecksumを検証します。
- `002`と`003`はユーザー名検索とランダム検索用のPostgreSQL indexを`CONCURRENTLY`で作成します。
- 本番起動前に、必ず`npm run migrate`を実行します。

## 自動化

- `database-migrations.yml`: DBマイグレーションの検証・適用。
- `generate-profile-card-gif.yml`: 他リポジトリから呼び出せるプロフィール用GIF生成ワークフロー。
- `update-card.yml`: テスト、デプロイ済みショーケースのSmoke test、Playwright録画、FFmpeg変換、`card-assets`ブランチへの公開。

GIF生成ではPlaywrightでカードを録画し、FFmpegで`800x266`のGIFへ変換します。生成物が10 MiB以下であることを確認してから公開します。

公式プロフィールカードは、毎日の録画前にGitHubから惑星データを更新します。認証トークンはリポジトリSecretではなく、[Actions Environments設定](https://github.com/nitr0yukkuri/githubplanet/settings/environments)で`official-card`環境を作成し、Deployment branchesを`main`だけに制限したうえで、Environment secret `CARD_REFRESH_TOKEN`に登録してください。値には本人のPersonal Access Token (classic)を使い、権限は`read:user`だけにします。`repo`権限は付けません。GitHubの設定によっては、`read:user`で取得できるprivate/internal contributionの合計が公開GIFに表示されます。トークンはActions内からHTTPSで送られ、ログや生成物には含めません。未設定または更新失敗時はGIFを公開せず、古いデータを新しいカードとして扱いません。日次実行はUTC 00:00の予定です。

## セキュリティと運用上の注意

- `.env`、OAuth client secret、Gemini API key、Webhook secretはコミットしないでください。
- 本番環境では`DATABASE_URL`がない場合、起動を失敗させます。
- GitHub OAuthではstateとPKCE verifierを使い、callback時に照合します。
- 本番のPush Webhookでは`GITHUB_WEBHOOK_SECRET`を設定し、署名検証を有効にしてください。
- カードページは共有用途のため、通常ページと異なる埋め込みポリシーを使います。カードへ渡すユーザー名や署名付きURLの扱いを変更する場合は、`src/presentation/http/page-routes.js`を確認してください。
- 外部APIにはタイムアウトを設定しています。タイムアウト時に既存データやフォールバックを使える箇所があります。実データの取得に失敗した場合は、新しい惑星を無理に保存しません。

## ライセンス

[MIT License](LICENSE)

## 開発者

- Backend / deployment: [@nitr0yukkuri](https://github.com/nitr0yukkuri)
- Frontend / design: [@lenagig](https://github.com/lenagig)

<div align="center">
  <a href="https://githubplanet.dev/">
    <img width="720" alt="nitr0yukkuri's planet card" src="https://raw.githubusercontent.com/nitr0yukkuri/githubplanet/card-assets/profile_card.gif">
  </a>
  <br>
  <a href="https://githubplanet.dev/">
    <img width="720" alt="lenagig's planet card" src="https://image.thum.io/get/width/800/crop/400/noanimate/wait/8/https://githubplanet.dev/card.html?username=lenagig&amp;fix=true">
  </a>
</div>


