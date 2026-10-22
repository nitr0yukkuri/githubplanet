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

GitHub Planetは、開発者のGitHub活動を宇宙空間の3D惑星へ変換します。所有する公開リポジトリの言語構成、コントリビューション、Star、外部リポジトリへの貢献などを集計し、惑星の色・表面・大きさ・回転・周囲の星・実績へ反映します。GitHubでピン留めした代表作品は惑星の言語集計と分け、作品ごとの構成言語を表示します。言語比率はリポジトリ全体の構成を表し、本人が追加したコードだけの比率ではありません。

この作品の中心は、数字を一覧で見ることではありません。自分の開発履歴を直接回転させ、表面の質感や言語固有のエフェクトを観測し、他の開発者の惑星と見比べられることにあります。

## 主な体験

- **自分だけの惑星:** GitHub OAuth後に取得した活動データから、惑星の個性を生成します。
- **3D観測:** Three.js / WebGLの惑星を回転させ、ステータスドロワーで言語構成・コントリビューション・称号を確認できます。
- **言語固有の表現:** 同じ色違いの球体ではなく、言語ごとに表面マテリアル、シェーダー、外殻、風、砂塵、結晶などを切り替えます。
- **宇宙の探索:** ユーザー名検索やランダム訪問で、保存済みの他ユーザーの惑星を観測できます。
- **リアルタイム流星:** GitHub Push WebhookをSocket.IOで配信し、変更された言語と変更量を流星の色・大きさとして表示します。
- **実績と称号:** 初めての惑星、コントリビューション数、Star、外部リポジトリへの貢献、使用言語数などの条件で実績と称号を解除できます。
- **プロフィールカード:** 惑星を横長の静止画カードまたはアニメーションGIFとしてGitHubプロフィールに貼れます。
- **日英対応:** ホーム、カード、実績、設定、認証の主要導線を日本語・英語で提供します。

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
| 所有する公開リポジトリごとの言語バイト数 | `languageStats`、主言語判定、2位・3位言語の軌跡 |
| GitHubでピン留めしたリポジトリ | 代表作品欄と作品ごとの言語構成。Fork作品はFork元も表示 |
| 年間コントリビューション | 惑星の累計値、実績、周囲の星の密度 |
| 直近約8日間の活動 | 回転速度、週間コントリビューション、速度系実績 |
| Star数 | Star系実績 |
| 外部所有リポジトリへの貢献・マージ済みPR | 外部貢献・ファーストコンタクト系実績 |
| Pushされたファイルの拡張子・変更量 | リアルタイム流星の言語色・大きさ |

集計値にはドメイン上限があります。累計コントリビューションは最大`99,999`、週間コントリビューションは最大`100`として扱います。未登録言語は、設定されている場合のみGeminiを使って色と惑星名のフォールバックを生成します。

## 惑星レンダリングの構成

惑星は一枚のエフェクトではなく、複数のレイヤーを組み合わせて描画します。

1. **宇宙背景:** `front/img/skybox/` の実際の空間テクスチャ。
2. **惑星表面:** `front/img/2k_mars.jpg` をベースにした球体、法線・照明・AO・言語別マテリアル。
3. **言語レイヤー:** 1位言語の表面シェーダー、外殻、風、葉、結晶、砂塵、文書構造など。
4. **言語構成の軌跡:** 2位・3位言語を色付きの短い周回軌跡として重ね、構成比の平方根に応じて強さを抑える。
5. **大気・オーラ:** 言語や活動量に応じた縁取り、発光、風のウェイク。
6. **活動の星:** 累計コントリビューションから計算した周囲の星。
7. **流星:** Webhookやデバッグイベントから追加される一時的なイベントレイヤー。

### 現在の言語別ビジュアル

言語の判定と描画は `front/js/planet-features/registry.js` に集約し、ホームとカードの両方から同じランタイムを利用します。

| 言語 | 表現 | 実装モジュール |
| --- | --- | --- |
| C | 鋼鉄の表面と控えめなリム | `c-planet-steel.js` |
| CSS | 一方向に流れる色の地形 | `css-planet-flow.js` |
| C++ | 安定したプラズマ／稲妻 | `cpp-planet-lightning.js` |
| Go | 風の流れと大気ウェイク | `go-planet-wind.js` |
| Swift | Go系の風と羽根状パーティクル | `swift-planet-feathers.js` |
| Vue | 穏やかな風と葉のレイヤー | `vue-planet-circulation.js` |
| TypeScript | 防御的な多重シェル | `typescript-planet-shell.js` |
| JavaScript | 局所反応とゴールド系サーフェス | `javascript-planet-reactivity.js` |
| Java | 土壌と地表ダスト | `java-planet-soil.js` |
| Kotlin | 結晶・コア・電気的な線 | `kotlin-planet-crystal.js` |
| Rust | 砂漠地形と砂塵 | `rust-planet-desert.js` |
| Ruby | 太陽熱・コロナ・エンバー | `ruby-planet-solar.js` |
| Shell | 白い地形と冷たい雲層 | `shell-planet-clouds.js` |
| XML | 入れ子構造のサーフェス | `xml-planet-nesting.js` |

対応言語のカタログと色定義は、専用レンダラーの一覧とは別に `src/domain/planet/constants.js` で管理しています。未登録言語でも、色と名前のフォールバックによって惑星データを保持できます。

Python専用の惑星演出はありません。Pythonを含むどの言語も、2位・3位になったときは共通の軌跡レイヤーで表示します。

## 言語別ショーケース

ショーケースは実在ユーザーやデータベースに依存しない固定データです。すべて累計`2,000`、週間`24`、サイズ係数`2`の同じ条件で、言語固有の違いを比較できます。

| URL slug | 言語 | 表現 | アニメーションGIF |
| --- | --- | --- | --- |
| [`css`](https://githubplanet.dev/card.html?showcase=css&fix=true) | CSS | Directional Color Flow | [`showcase_css.gif`](https://raw.githubusercontent.com/nitr0yukkuri/githubplanet/card-assets/showcase_css.gif) |
| [`cpp`](https://githubplanet.dev/card.html?showcase=cpp&fix=true) | C++ | Idle Plasma Globe | [`showcase_cpp.gif`](https://raw.githubusercontent.com/nitr0yukkuri/githubplanet/card-assets/showcase_cpp.gif) |
| [`go`](https://githubplanet.dev/card.html?showcase=go&fix=true) | Go | Atmospheric Wind | [`showcase_go.gif`](https://raw.githubusercontent.com/nitr0yukkuri/githubplanet/card-assets/showcase_go.gif) |
| [`typescript`](https://githubplanet.dev/card.html?showcase=typescript&fix=true) | TypeScript | Defensive Typed Shell | [`showcase_typescript.gif`](https://raw.githubusercontent.com/nitr0yukkuri/githubplanet/card-assets/showcase_typescript.gif) |
| [`javascript`](https://githubplanet.dev/card.html?showcase=javascript&fix=true) | JavaScript | Reactive Golden Surface | [`showcase_javascript.gif`](https://raw.githubusercontent.com/nitr0yukkuri/githubplanet/card-assets/showcase_javascript.gif) |
| [`java`](https://githubplanet.dev/card.html?showcase=java&fix=true) | Java | Java Roast | [`showcase_java.gif`](https://raw.githubusercontent.com/nitr0yukkuri/githubplanet/card-assets/showcase_java.gif) |
| [`kotlin`](https://githubplanet.dev/card.html?showcase=kotlin&fix=true) | Kotlin | Electric Spark | [`showcase_kotlin.gif`](https://raw.githubusercontent.com/nitr0yukkuri/githubplanet/card-assets/showcase_kotlin.gif) |
| [`rust`](https://githubplanet.dev/card.html?showcase=rust&fix=true) | Rust | Desert Dust World | [`showcase_rust.gif`](https://raw.githubusercontent.com/nitr0yukkuri/githubplanet/card-assets/showcase_rust.gif) |
| [`vue`](https://githubplanet.dev/card.html?showcase=vue&fix=true) | Vue | Gentle Reactive Wind | [`showcase_vue.gif`](https://raw.githubusercontent.com/nitr0yukkuri/githubplanet/card-assets/showcase_vue.gif) |
| [`ruby`](https://githubplanet.dev/card.html?showcase=ruby&fix=true) | Ruby | Burning Ruby | [`showcase_ruby.gif`](https://raw.githubusercontent.com/nitr0yukkuri/githubplanet/card-assets/showcase_ruby.gif) |

issue由来の追加演出も、カード素材をまだ公開していないプレビュー惑星として同じ画面で確認できます。

| プレビュー | 言語 | 表現 |
| --- | --- | --- |
| [`shell`](https://githubplanet.dev/showcase/shell) | Shell | Cold Cloud Layers |
| [`xml`](https://githubplanet.dev/showcase/xml) | XML | Nested Surface |

ローカルでは、DBなしでも次のURLで確認できます。

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

英語画面は `/en` または `/english` プレフィックスで利用できます。

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

GitHubプロフィールのREADMEには、まず静止カードを使うのが簡単です。追加のリポジトリファイルやActionsは必要ありません。

```markdown
[![GitHub Planet](https://image.thum.io/get/width/800/crop/400/noanimate/wait/8/https://githubplanet.dev/card.html?username=ユーザー名&fix=true)](https://githubplanet.dev/card.html?username=ユーザー名)
```

### 任意（GitHub Actions使用）：動くGIFカード

惑星の動きも表示したい場合は、プロフィールREADMEリポジトリから再利用可能ワークフローを呼び出します。GitHub **Actions** の **Update Planet Card** を一度手動実行すると、以降はスケジュールで更新できます。

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

生成物の検証には、次のチェックも含めます。

```bash
file planet-card.gif | grep -q "GIF image data"
```

より完全な公開用ワークフローは `.github/workflows/generate-profile-card-gif.yml` と `.github/workflows/update-card.yml` を参照してください。公式リポジトリの定期ワークフローでは、プロフィールカードと11種類のショーケースGIFをPlaywrightとFFmpegで生成し、`card-assets` ブランチへ公開します。

生成されたGIFを貼る場合は、次の形式です。

```markdown
[![GitHub Planet](https://raw.githubusercontent.com/GitHubユーザー名/GitHubユーザー名/main/planet-card.gif)](https://githubplanet.dev/card.html?username=GitHubユーザー名)
```

公式プロフィールカードの生成物は、次のURL形式でも参照できます。

```text
https://raw.githubusercontent.com/nitr0yukkuri/githubplanet/card-assets/profile_card.gif
```

## 技術構成

GitHub Planetは、Node.jsアプリケーションの中を責務ごとに分けたレイヤードなモジュラーモノリスです。

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

依存方向は `Presentation → Application → Domain` を基本とし、外部サービスの具体的な通信は `Infrastructure` に閉じ込めます。起動時はDBが存在する場合に適用済みマイグレーションを検証し、マイグレーションの実行自体は `npm run migrate` に分離しています。

## セットアップ

### 必要なもの

- Docker Desktop（推奨）またはNode.js 18以上とPostgreSQL 15以上
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

ローカル環境のOAuth callback URLは、実行ポートから`http://localhost:<PORT>/callback`として組み立てられます。本番環境では`GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET`、`CALLBACK_URL`を使います。

### 2. Docker Composeで起動（推奨）

```bash
docker compose up --build
```

ComposeはPostgreSQL、マイグレーション、Node.jsアプリを起動します。マイグレーションが成功してからアプリが起動する構成です。

ブラウザで <http://localhost:3000/> を開きます。停止は`Ctrl+C`です。

### 3. ホスト上で起動する場合

PostgreSQLを用意し、`DATABASE_URL`をその接続先にしたうえで実行します。

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

開発環境では`DATABASE_URL`を設定しない状態でもアプリを起動できます。この場合、DB保存・ログイン後の惑星・ユーザー検索・ランダム検索は利用できませんが、固定ショーケースAPIとショーケース画面は確認できます。

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

CSSとJavaの固定データをPostgreSQLへ投入するCompose profileがあります。

```bash
docker compose --profile css-test up --build
docker compose --profile java-test up --build
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

性能調査用のスクリプトも用意しています。

```bash
npm run perf:compare-random
npm run perf:random-sql
npm run perf:random-http
```

### マイグレーションの運用

- migrationは未使用の次の3桁番号で追加します（現在の次番号は`016`）。本番には別内容の旧`004`があるため、再利用しません。
- 適用済みマイグレーションの内容は変更せず、新しい番号を追加します。
- 起動時は`schema_migrations`のchecksumを検証します。
- `002`と`003`は、ユーザー名検索とランダム検索用のPostgreSQL indexを`CONCURRENTLY`で作成します。
- 本番起動前に、必ず`npm run migrate`を実行します。

## 自動化

- `database-migrations.yml`: DBマイグレーションの検証・適用。
- `generate-profile-card-gif.yml`: 他リポジトリから呼び出せるプロフィール用GIF生成ワークフロー。
- `update-card.yml`: テスト、デプロイ済みショーケースのSmoke test、Playwright録画、FFmpeg変換、`card-assets`ブランチへの公開。

GIF生成では、Playwrightでカードを録画し、FFmpegで`800x266`のGIFへ変換します。生成物は10 MiB以下であることを検証してから公開します。

## セキュリティと運用上の注意

- `.env`、OAuth client secret、Gemini API key、Webhook secretはコミットしないでください。
- 本番環境では`DATABASE_URL`がない場合、起動を失敗させます。
- GitHub OAuth callbackにはstateとPKCE verifierを使い、callback時に照合します。
- 本番のPush Webhookでは`GITHUB_WEBHOOK_SECRET`を設定し、署名検証を有効にしてください。
- カードページは共有用途のため、通常ページと異なる埋め込みポリシーを使います。カードへ渡すユーザー名や署名付きURLの扱いを変更する場合は、`src/presentation/http/page-routes.js`を確認してください。
- 外部APIにはタイムアウトを設定しています。タイムアウト時は既存データやフォールバックを使える箇所がありますが、実データ取得に失敗した場合は無理に新しい惑星を保存しません。

## ライセンス

[MIT License](LICENSE)

## 開発者

- Backend / deployment: [@nitr0yukkuri](https://github.com/nitr0yukkuri)
- Frontend / design: [@lenagig](https://github.com/lenagig)

