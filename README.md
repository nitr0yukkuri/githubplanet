<img src="front/img/GitHubPlanet_logo.png" width="80%" alt="GitHub Planet Logo">

  <br>
  
  
 
## 🛸 作品
このプロジェクトを開発しているコア・メンバーの惑星です。

#### 🪐 バックエンド ＆ デプロイ
**@nitr0yukkuri**
![GitHub Planet](https://image.thum.io/get/width/800/crop/400/noanimate/wait/6/https://githubplanet.onrender.com/card.html?username=nitr0yukkuri&fix=responsive9)

#### 🪐 フロントエンド & デザイン
**@lenagig**
![GitHub Planet](https://image.thum.io/get/width/800/crop/400/noanimate/wait/6/https://githubplanet.onrender.com/card.html?username=lenagig&fix=responsive9=v0)



# 🪐 GitHub Planet
**GitHubの活動データを基に、ユーザーごとにパーソナライズされた3Dのオリジナル惑星を生成・表示するWebアプリケーションです。** あなたの開発履歴が、宇宙に浮かぶ一つの星として表現されます。✨

---

## 🌟 主な特徴

### 1. パーソナライズされた惑星生成
- **カラー:** リポジトリで最も多く使用されているプログラミング言語に応じて、惑星の色が変化します。

### 2. 生成AIによるユニークな命名 (Powered by Gemini)
- **AI命名:**  システムに登録されていない言語が、AIが適切なイメージカラーを解析して適用します。

### 3. 実績（Achievements）システム
- **トロフィー解除:** 「初コミット」「累計1000コミット」など、開発のマイルストーンに応じて実績が解除されます。
- **可視化:** 専用の実績ページで、獲得したトロフィーと進捗率（Achievement Rate）を確認できます。

### 4. リアルタイム流星群 (Real-time Interaction)
- **Socket.io連携:** 誰かがリポジトリに `push` してWebhookがトリガーされると、接続している全ユーザーの宇宙空間に、その言語色の「流星」がリアルタイムで降り注ぎます。

### 5. シェア用3Dカード生成
- **OGP画像生成:** あなたの惑星の現在のステータス（言語、コミット数、惑星の姿）を収めた専用のカードページ (`card.html`) を生成します。
### 🌌 あなたのGitHubプロフィールに惑星を飾ろう！
github planetに訪れて、以下のコードを自分の `README.md` に貼るだけで、あなたの惑星カードが表示されます。

\`\`\`markdown
![GitHub Planet](https://githubplanet.onrender.com/api/card/あなたのユーザー名)
\`\`\`
## 🛠️ 技術構成（Tech Stack）

このプロジェクトは、フロントエンドからインフラまで一貫して設計された、モダンなWeb技術スタックで構築されています。

| カテゴリ | 技術 | 役割 |
| :-- | :-- | :-- |
| **Frontend** | Three.js / Anime.js | 惑星・スター・エフェクトのリアルタイム3D描画およびアニメーション制御 |
| **Backend** | Node.js / Express | APIエンドポイントの提供、データ処理ロジックの実装 |
| **AI** | Google Gemini API | 言語に応じた色生成、惑星に付与するユニークな二つ名の生成 |
| **Real-time** | Socket.IO | Webhookと連携したリアルタイムな流星エフェクトの配信 |
| **Database** | PostgreSQL | ユーザーの惑星データ、実績、セッション情報の永続化 |
| **Authentication** | GitHub OAuth 2.0 | GitHubアカウントを用いたセキュアな認証およびユーザーデータ取得 |
| **deployment** | Render  | アプリケーションのホスティング |


## 🚀 セットアップと実行方法

ローカル環境で本プロジェクトを実行するための手順です。

### 1. 依存関係のインストール

プロジェクトのルートディレクトリで以下のコマンドを実行し、必要なパッケージをインストールします。
```bash

npm install


##  作業する前にすること

###  クローン（コードのコピー）

git clone https://github.com/nitr0yukkuri/githubplanet

→ 現時点のGitHubにあるコードをローカルにコピーする


###  プル（既にクローンしたあとにgithubからコードを読み込み） 更新みたいなもん

git pull origin main

→ 最新の変更を反映する



###  ブランチ（枝分かれコピー）

#### 新しく作業ブランチを作るとき
git checkout -b "やることをここに入力"
→ branchの作成と移動を同時に行う

####  既存のブランチに移動するとき

git checkout ブランチ名

####  ブランチ一覧を確認するとき

git branch

→ 現在地とブランチ一覧が見れる  
（`*` が付いているのが現在のブランチ）

####  ブランチを削除するとき

git branch -d ブランチ名

→ マージ済みのローカルブランチを削除


##  作業後にすること

###  ステージング(githubに送るファイル・フォルダの設定)

git add . (ドットは全部のフォルダ・ファイル送るよってやつ)

→ 変更したファイルを全て選択（ステージング）



###  コミット(なにしたか教えるやつ)

git commit -m "ここにコミットメッセージ"

→ 変更を確定して記録  
（コミットはこまめに分けるとバグ対応が楽）


###  プッシュ(自分の変えたコードをgithubに反映させる)

git push origin ブランチ名

→ 変更をGitHubに送る


### ✅ **Tips**
- チーム開発では、`main`ブランチに直接pushしないよう注意  (できないようにするつもり)
- 作業ごとにブランチを分けると、レビューや修正がしやすくなる (コンフリクトっていうめんどいのも防ぐために)





