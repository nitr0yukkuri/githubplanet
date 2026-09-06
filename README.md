<p align="right"><strong>日本語</strong> | <a href="README.en.md">English</a></p>

<img src="front/img/GitHubPlanet_logo.png" width="80%" alt="GitHub Planet Logo">

  <br>
  
  
 


# 🪐 GitHub Planet
**GitHubの活動データを基に、ユーザーごとに3Dの固有の惑星を生成・表示するWebアプリケーションです。** あなたの開発履歴が、宇宙に浮かぶ一つの星として表現されます。✨

---

## 🎨 作品内容

GitHub Planetは、開発者のGitHub活動を「宇宙に浮かぶ、自分だけの3D惑星」として表現するインタラクティブWeb作品です。

GitHub OAuthで取得した公開リポジトリ、使用言語、コントリビューション、Star、外部リポジトリへの貢献を集計し、惑星の色・表面・大きさ・回転速度・周囲の星・実績へ反映します。C、CSS、C++、Go、TypeScript、JavaScript、Rustには、鋼鉄、色の流れ、プラズマ、風、大気、外殻、砂塵などの言語固有表現があります。

GitHubのPush Webhookを受信すると、変更されたファイルの言語と変更量から流星の色・大きさを決定し、Socket.IOを通して閲覧中の宇宙へリアルタイムに流星を表示します。生成した惑星は、他ユーザーの訪問、実績・称号、静止画やアニメーションGIFのプロフィールカードとしても楽しめます。

## 🌟 主な特徴

### 1. 固有された惑星生成
- **カラー:** リポジトリで最も多く使用されているプログラミング言語に応じて、惑星の色が変化します。

### 2. 生成AIによる命名
- **AI命名:**  システムに登録されていない言語が、AIが適切なイメージカラーを解析して適用します。

### 3. 実績システム
- **トロフィー解除:** 「初コミット」「累計1000コミット」など、開発のマイルストーンに応じて実績が解除されます。
- **可視化:** 専用の実績ページで、獲得したトロフィーと進捗率（Achievement Rate）を確認できます。

### 4. 流れ星
- **Socket.io連携:** 誰かがリポジトリに `push` してWebhookがトリガーされると、接続している全ユーザーの宇宙空間に、その言語色の「流星」がリアルタイムで降り注ぎます。

### 5. プロフィール用3Dカード生成
- **OGP画像生成:** あなたの惑星の現在のステータス（言語、コミット数、惑星の姿）を収めた専用のカードページ (`card.html`) を生成します。
### 🌌 あなたのGitHubプロフィールに惑星を飾ろう！

| 表示方法 | おすすめ用途 | GitHub Actions | 更新方法 |
| --- | --- | --- | --- |
| 静止カード（標準） | まず表示したい人 | 不要 | カードを開いた時点の画像 |
| GIFカード（任意） | 惑星の動きも見せたい人 | 必要 | 毎日自動更新 |

通常は静止カードがおすすめです。`ユーザー名` を置き換えてプロフィールの `README.md` に貼るだけで利用でき、リポジトリへのファイル追加やGitHub Actionsの設定は必要ありません。

#### 標準（おすすめ・GitHub Actions不要）：静止カード

```markdown
[![GitHub Planet](https://image.thum.io/get/width/800/crop/400/noanimate/wait/8/https://githubplanet.dev/card.html?username=ユーザー名&fix=true)](https://githubplanet.dev/card.html?username=ユーザー名)
```

#### 任意（GitHub Actions使用）：動くGIFカード

惑星を動かしたい場合だけ、次の手順を行います。

1. 自分のプロフィールREADMEリポジトリ（`GitHubユーザー名/GitHubユーザー名`）を開きます。
2. `.github/workflows/update-planet-card.yml` を作成し、次の内容を追加します。
3. `あなたのGitHubユーザー名` を自分のユーザー名へ置き換えます。
4. GitHubの **Actions** タブから **Update Planet Card** を一度手動実行します。
5. `planet-card.gif` がプロフィールリポジトリへ追加されたことを確認します。以降は毎日自動更新されます。

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
      - name: Validate downloaded GIF
        run: |
          file planet-card.gif | grep -q "GIF image data"
          test "$(stat --format=%s planet-card.gif)" -le 10485760
      - name: Commit updated GIF
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add planet-card.gif
          git diff --cached --quiet && exit 0
          git commit -m "Update animated planet card [skip ci]"
          git push
```

生成後は `GitHubユーザー名` を置き換え、プロフィールREADMEに次のコードを貼るとアニメーションが表示されます。GIFがまだ生成されていない状態では画像が表示されないため、先にワークフローの完了を確認してください。

```markdown
[![GitHub Planet](https://raw.githubusercontent.com/GitHubユーザー名/GitHubユーザー名/main/planet-card.gif)](https://githubplanet.dev/card.html?username=GitHubユーザー名)
```

## 🪐 Language Feature Showcase

DBや実在ユーザーに依存しない固定テストデータから生成した、言語別のショーケース惑星です。各カードは本番環境の読み取り専用ショーケースAPIを使用します。

<table>
  <tr>
    <td align="center">
      <strong>CSS — Directional Color Flow</strong><br>
      <a href="https://githubplanet.dev/card.html?showcase=css&amp;fix=true">
        <img width="400" alt="CSS showcase planet" src="https://raw.githubusercontent.com/nitr0yukkuri/githubplanet/card-assets/showcase_css.gif">
      </a>
    </td>
    <td align="center">
      <strong>C++ — Idle Plasma Globe</strong><br>
      <a href="https://githubplanet.dev/card.html?showcase=cpp&amp;fix=true">
        <img width="400" alt="C++ showcase planet" src="https://raw.githubusercontent.com/nitr0yukkuri/githubplanet/card-assets/showcase_cpp.gif">
      </a>
    </td>
  </tr>
  <tr>
    <td align="center">
      <strong>Go — Atmospheric Wind</strong><br>
      <a href="https://githubplanet.dev/card.html?showcase=go&amp;fix=true">
        <img width="400" alt="Go showcase planet" src="https://raw.githubusercontent.com/nitr0yukkuri/githubplanet/card-assets/showcase_go.gif">
      </a>
    </td>
    <td align="center">
      <strong>TypeScript — Defensive Typed Shell</strong><br>
      <a href="https://githubplanet.dev/card.html?showcase=typescript&amp;fix=true">
        <img width="400" alt="TypeScript showcase planet" src="https://raw.githubusercontent.com/nitr0yukkuri/githubplanet/card-assets/showcase_typescript.gif">
      </a>
    </td>
  </tr>
  <tr>
    <td align="center">
      <strong>JavaScript — Reactive Golden Surface</strong><br>
      <a href="https://githubplanet.dev/card.html?showcase=javascript&amp;fix=true">
        <img width="400" alt="JavaScript showcase planet" src="https://raw.githubusercontent.com/nitr0yukkuri/githubplanet/card-assets/showcase_javascript.gif">
      </a>
    </td>
    <td align="center">
      <strong>Java — Java Roast</strong><br>
      <a href="https://githubplanet.dev/card.html?showcase=java&amp;fix=true">
        <img width="400" alt="Java showcase planet" src="https://raw.githubusercontent.com/nitr0yukkuri/githubplanet/card-assets/showcase_java.gif">
      </a>
    </td>
  </tr>
  <tr>
    <td align="center">
        <strong>Kotlin — Electric Spark</strong><br>
      <a href="https://githubplanet.dev/card.html?showcase=kotlin&amp;fix=true">
        <img width="400" alt="Kotlin showcase planet" src="https://raw.githubusercontent.com/nitr0yukkuri/githubplanet/card-assets/showcase_kotlin.gif">
      </a>
    </td>
    <td align="center">
      <strong>Rust — Desert Dust World</strong><br>
      <a href="https://githubplanet.dev/card.html?showcase=rust&amp;fix=true">
        <img width="400" alt="Rust showcase planet" src="https://raw.githubusercontent.com/nitr0yukkuri/githubplanet/card-assets/showcase_rust.gif">
      </a>
    </td>
  </tr>

  <tr>
    <td align="center">
      <strong>Vue — Gentle Reactive Wind</strong><br>
      <a href="https://githubplanet.dev/card.html?showcase=vue&amp;fix=true">
        <img width="400" alt="Vue showcase planet" src="https://raw.githubusercontent.com/nitr0yukkuri/githubplanet/card-assets/showcase_vue.gif">
      </a>
    </td>
    <td align="center">
      <strong>Ruby — Burning Ruby</strong><br>
      <a href="https://githubplanet.dev/card.html?showcase=ruby&amp;fix=true">
        <img width="400" alt="Ruby showcase planet" src="https://raw.githubusercontent.com/nitr0yukkuri/githubplanet/card-assets/showcase_ruby.gif">
      </a>
    </td>
  </tr>
</table>

## 🛠️ 技術構成

GitHub Planetは、1つのNode.jsアプリケーション内を責務ごとに分けた、レイヤード構成のモジュラーモノリスです。

| 領域 | 技術 | 役割 |
| :-- | :-- | :-- |
| **Frontend** | HTML / CSS / JavaScript ES Modules | 画面、操作、日英ローカライズ |
| **3D / Graphics** | Three.js / WebGL / GLSL / Anime.js | 惑星、言語別シェーダー、星、流星、アニメーション |
| **Backend** | Node.js / Express | ページ配信、認証、API、アプリケーション処理 |
| **Real-time** | Socket.IO / GitHub Webhook | Pushイベントを流星としてリアルタイム配信 |
| **GitHub連携** | GitHub OAuth 2.0 / REST API / GraphQL API | 認証、ユーザー情報、リポジトリ、言語、活動データの取得 |
| **Generative AI** | Google Gemini API | 未登録言語の色決定と惑星名生成の補助 |
| **Database / Session** | PostgreSQL / connect-pg-simple | 惑星、実績、称号、ログイン差分、セッションの永続化 |
| **Infrastructure** | Docker / Google Cloud Run | ローカル環境と本番ホスティング |
| **Automation** | GitHub Actions / Playwright / FFmpeg | 3Dカードの録画、GIF変換、定期更新 |
| **Testing** | Node.js Test Runner | ドメイン、API、DB、セキュリティ、シェーダーの回帰テスト |

### バックエンドの構成

```text
Browser
  ↓
Presentation（Expressのルート・HTTP入出力）
  ↓
Application（惑星生成・検索・ログイン進捗）
  ↓
Domain（実績・称号・惑星のルール）
  ↓
Infrastructure（PostgreSQL・GitHub API・Gemini API）

GitHub Webhook → Express → Socket.IO → Browser
```

- **Presentation:** HTTPリクエストを受け取り、JSONやHTMLを返します。
- **Application:** GitHubデータ取得から集計・保存まで、ユースケースの流れを組み立てます。
- **Domain:** 実績解除、コミット数の制限、惑星名など、GitHub Planet固有のルールを持ちます。
- **Infrastructure:** PostgreSQLと外部APIの具体的な通信処理を担当します。

## 🛸 開発者
このプロジェクトを開発しているコア・メンバーの惑星です。

#### 🪐 バックエンド ＆ デプロイ
**@nitr0yukkuri**

<div align="center">
  <p><strong>@nitr0yukkuri</strong></p>
  <a href="https://githubplanet.dev/">
    <img src="https://raw.githubusercontent.com/nitr0yukkuri/githubplanet/card-assets/profile_card.gif" />
  </a>
</div>
 


#### 🪐 フロントエンド & デザイン
**@lenagig**
<div align="center">
  <a href="https://githubplanet.dev/">
    <img src="https://image.thum.io/get/width/800/crop/400/noanimate/wait/8/https://githubplanet.dev/card.html?username=lenagig&fix=true" />
  </a>
</div>


## 🚀 セットアップと実行方法

ローカル環境で本プロジェクトを実行するための手順です。

### 1. 依存関係のインストール

プロジェクトのルートディレクトリで以下のコマンドを実行し、必要なパッケージをインストールします。
```bash

# 🚀 開発環境のセットアップ (Docker)

GitHub Planetをローカルで起動するための手順です。
Dockerを使用することで、データベース(PostgreSQL)の設定も自動で行われます。

## 1. 事前準備

1. **GitHub OAuthアプリの作成**
   - [GitHub Developer Settings](https://github.com/settings/developers) で「New OAuth App」を作成。
   - **Homepage URL**: `http://localhost:3000`
   - **Callback URL**: `http://localhost:3000/callback`
   - Client IDとClient Secretを控えます。

2. **Gemini APIキーの取得 (任意)**
   - 惑星の色や名前をAI生成する場合、[Google AI Studio](https://aistudio.google.com/) でキーを取得します。

## 2. 環境変数の設定

プロジェクトルートに `.env` ファイルを作成し、以下を記述してください。

```ini
# --- 基本設定 ---
PORT=3000
NODE_ENV=development
SESSION_SECRET=dev_secret_key_123

# --- データベース (Docker内設定) ---
# 変更不要
DATABASE_URL=postgres://githubplanet:password@db:5432/githubplanet

# --- APIキー設定 ---
# 手順1で取得したIDとSecret
GITHUB_CLIENT_ID_LOCAL=ここにClientID
GITHUB_CLIENT_SECRET_LOCAL=ここにClientSecret

# 手順2で取得したKey (なしでも動作可)
GEMINI_API_KEY=ここにGeminiKey

# システム連携用 (任意の文字列)
SYSTEM_API_KEY=dev_system_key

# GitHub Webhookの署名検証用 (Webhook設定と同じSecret)
GITHUB_WEBHOOK_SECRET=dev_webhook_secret
```
## 3. 起動コマンド

以下のコマンドを実行すると、アプリとデータベースが立ち上がります。

```bash
docker-compose up --build
```

Docker Composeは、`migrate`サービスで未適用のDBマイグレーションを完了してからアプリを起動します。
Dockerを使わず直接起動する場合や本番デプロイでは、各デプロイでアプリの新しいバージョンを起動する前に次を実行してください。

```bash
npm run migrate
npm start
```

- ブラウザで [http://localhost:3000](http://localhost:3000) にアクセスしてください。
- 停止するには `Ctrl+C` を押します。
