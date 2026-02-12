<img src="front/img/GitHubPlanet_logo.png" width="80%" alt="GitHub Planet Logo">

  <br>
  
  
 



# 🪐 GitHub Planet
**GitHubの活動データを基に、ユーザーごとに3Dの固有の惑星を生成・表示するWebアプリケーションです。** あなたの開発履歴が、宇宙に浮かぶ一つの星として表現されます。✨

---

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
github planetに訪れて、以下のコードを自分の `README.md` に貼るだけで、あなたの惑星カードが表示されます。

\`\`\`markdown
  `[![GitHub Planet](https://image.thum.io/get/width/800/crop/400/noanimate/wait/6/https://githubplanet.onrender.com/card.html?username=ユーザー名&fix=true&refresh=97)](https://githubplanet.onrender.com/card.html?username=ユーザー名)`

\`\`\`
## 🛠️ 技術構成（Tech Stack）

このプロジェクトは、フロントエンドからインフラまで一貫して設計された、モダンなWeb技術スタックで構築されています。

| カテゴリ | 技術 | 役割 |
| :-- | :-- | :-- |
| **Frontend** | Three.js / Anime.js | 惑星・スター・エフェクトのリアルタイム3D描画およびアニメーション制御 |
| **Backend** | Node.js / Express | APIエンドポイントの提供、データ処理ロジックの実装 |
| **AI** | Google Gemini API | 言語に応じた色生成、惑星に付与するユニークな二つ名の生成 |
| **Real-time** | Socket.IO | Webhookと連携したリアルタイムな流星エフェクトの配信 |
| **Database** | PostgreSQL | ユーザーの惑星データ、実績、情報の永続化 |
| **Authentication** | GitHub OAuth 2.0 | GitHubアカウントを用いた認証およびユーザーデータ取得 |
| **deployment** | Render  | アプリケーションのホスティング |


## 🛸 開発者
このプロジェクトを開発しているコア・メンバーの惑星です。

#### 🪐 バックエンド ＆ デプロイ
**@nitr0yukkuri**
<div align="center">
  <a href="https://githubplanet.onrender.com/">
    <img src="https://image.thum.io/get/width/800/crop/400/noanimate/wait/8/https://githubplanet.onrender.com/card.html?username=nitr0yukkuri&fix=true&time=1769___" width="100%" alt="GitHub Planet Card">
  </a>


#### 🪐 フロントエンド & デザイン
**@lenagig**
![GitHub Planet](https://image.thum.io/get/width/800/crop/400/noanimate/wait/6/https://githubplanet.onrender.com/card.html?username=lenagig&fix=responsive9=v0)



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
```

## 3. 起動コマンド

以下のコマンドを実行すると、アプリとデータベースが立ち上がります。

```bash
docker-compose up --build
```

- ブラウザで [http://localhost:3000](http://localhost:3000) にアクセスしてください。
- 停止するには `Ctrl+C` を押します。
