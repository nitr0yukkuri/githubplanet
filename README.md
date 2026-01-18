
  <img src="front/img/GitHubPlanet_logo.png" width="80%" alt="GitHub Planet Logo">

  <br>
  
  
 

![GitHub Planet](https://image.thum.io/get/width/800/crop/400/noanimate/wait/6/https://githubplanet.onrender.com/card.html?username=nitr0yukkuri&fix=responsive9)


![GitHub Planet](https://image.thum.io/get/width/800/crop/400/noanimate/wait/6/https://githubplanet.onrender.com/card.html?username=lenagig&fix=responsive9)




# 🪐 GitHub Planet
**GitHubの活動データを基に、ユーザーごとにパーソナライズされた3Dのオリジナル惑星を生成・表示するWebアプリケーションです。**  
あなたの開発履歴が、宇宙に浮かぶ一つの星として表現されます。✨

---

## 🌟 主な特徴

### パーソナライズされた惑星
- **サイズ:** GitHubの総コミット数に基づき、惑星の大きさが変化します。  
- **周囲の星:** コミット数に応じて、惑星を囲む周囲の星の数が変化します。  
- **カラー:** リポジトリで最も多く使用されているプログラミング言語（バイト数基準）に応じて、惑星の色が決定されます。  
- **ユニークな惑星名:** コミット数や惑星の色などの要素を組み合わせ、その惑星に固有のユニークな名前が自動で生成されます（例: 「柔軟な黄金の巨星」、「堅牢な青い帝星」）。  

### 宇宙の探索
- ログインユーザーの惑星だけでなく、ユーザー名を入力するかランダム検索を行うことで、他の開発者の惑星を見ることができます。

---
### 5. Markdownでの惑星共有機能
- 自分の惑星をGitHubのプロフィールやREADMEに埋め込むための専用カード生成機能を備えています。`/api/card/:username` を通じて、最新の惑星ステータスが画像として生成され、マークダウン一行でどこでも共有可能です。

---

## 🌌 あなたの惑星をGitHubで共有しよう！
自分のGitHubプロフィール（README.md）に以下のコードを貼り付けるだけで、あなたの惑星カードを表示できます。

```markdown
![GitHub Planet](https://githubplanet.onrender.com/api/card/あなたのユーザー名)

| 分野 | 技術 | 役割 |
|---|---|---|
| Frontend | Three.js / Anime.js | 惑星・スター・エフェクトのリアルタイム3D描画とアニメーション |
| Backend | Node.js / Express | APIエンドポイントの提供、データ処理ロジックの実装 |
| AI | Google Gemini API | 言語に応じた色生成、惑星のユニークな二つ名の命名 |
| Real-time | Socket.IO | Webhookと連携したリアルタイムな流星エフェクトの配信 |
| Database | PostgreSQL | ユーザーの惑星データ、実績、セッション情報の永続化 |
| Auth | GitHub OAuth 2.0 | GitHubアカウントを用いたセキュアな認証とデータ取得 |
| Infrastructure | Render / GitHub Actions | アプリケーションのホスティングとCI/CDの自動化 |


## 🚀 セットアップと実行方法

ローカル環境で本プロジェクトを実行するための手順です。

### 1. 依存関係のインストール

プロジェクトのルートディレクトリで以下のコマンドを実行し、必要なパッケージをインストールします。
```bash
npm install
```


### 3. サーバーの起動

サーバーを起動します。
```bash
node server.js
# 開発中は nodemon などを使用することをお勧めします。
```

### 4. アクセス

サーバーが起動したら、ブラウザで以下のURLにアクセスしてください。。
```
http://localhost:3000/
```

GitHubアカウントでログインすると、あなた自身の「GitHub Planet」が生成・表示されます。


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





