# Cloudflare本番切替（2026-11-13）

githubplanet.devはCloudflare FreeのWorkerへ切替済み。11月11日・12日の調査文書にある「本番未切替」「実OAuth未確認」は、その調査時点の記録として残している。

## 配備と停止

- 本番Workerは`githubplanet`。HTTPアプリをApplicationGateway Durable Objectで実行し、静的ファイルはAssets、流星接続はMeteorHub、Webhook受付はWebhookIngressへ分ける。
- NeonへのHyperdrive query cacheは無効。既存の本番secretを再利用し、移行用DDLは実行していない。
- Name.comのNSをCloudflareの`mallory.ns.cloudflare.com`と`merlin.ns.cloudflare.com`へ変更し、zone activeと独自ドメインの応答を確認した。
- Cloud Runの`githubplanet`と`githubplanet-git`は`asia-northeast2`でmanual scaling 0。サービス設定と既存revisionは保持している。
- Cloud BuildのGitHubPlanet専用トリガー2件はdisabled。Cloud Runへの自動再配備を停止した。
- `.github/workflows/cloudflare.yml`は互換性検証用で、自動本番配備は行わない。本番更新は既存secretを保つ`deploy:cloudflare`で実施する。

## 動作確認

Chromeで既存ユーザーのGitHub OAuth往復を完了し、ホームの惑星・コントリビューション数を表示した。再読込みでもセッションを保持し、本人カードの3D描画と実績一覧の取得を確認した。設定画面の保存や、本番向けのテスト流星送信は行っていない。

本番HTTPの確認は次のとおり。すべてCloudflare経由を示す`cf-ray`を含む。

| 対象 | 結果 |
| --- | --- |
| healthz、ホーム、設定、実績、sender | 200 |
| 本人カード、英語Perlカード | 200 |
| showcase API、通常ユーザーAPI | 200 |
| 匿名の本人API、不正管理キー、不正Webhook署名 | 401 |
| WebSocket | ping/pong成功、不正Originは403 |
| CSP | HTTPヘッダーのnonceとホームの全scriptタグが一致 |

通常ユーザーAPIのGitHub匿名枠429は、公開REST通信へ既存OAuthアプリ資格情報を使用して解消した。ユーザー本人の処理では本人のBearer tokenを優先し、GitHubのRetry-After/resetを呼出元へ伝える。

## 回帰検証とレビュー

- 全回帰テスト351件成功、Workers dry-run成功。
- 実workerdのQueue/WebSocket検証は2048件・64batch・重複0件。遅いpublisherが完了状態を上書きしないことも確認した。
- レビューで履歴Queueが未生成Poolを参照する問題を発見。遅延接続を再現する回帰テストを先に失敗させ、`ensurePool()`を呼んでからsession/履歴へアクセスするよう修正した。
- 最新mainの本番環境チェック、CSP nonce、通常APIの本文制限、URL経由の内部キー認証廃止を共有bootstrap/routeで維持する。Node入口はDB接続前にも共通の環境チェックを実行する。
- PostgreSQLを含むQueue履歴完了・session・Webhook・ブラウザー統合検証はPRのCloudflare workflowでも実行する。

本番では大量履歴や署名の有効なWebhookを負荷試験していない。日次枠、CPU、memory、Queueの再試行とDLQの監視は必要で、今回の疎通成功を無制限の稼働保証として扱わない。Cloud Runの停止後もArtifact Registryなどの保存料金は別に残る。

## 再配備

`CF_ACCOUNT_ID`、`CF_HYPERDRIVE_ID`、`CF_TARGET=production`、`CF_FREE_PLAN=true`、`CF_PUBLIC_BASE_URL=https://githubplanet.dev`、`CF_ATTACH_DOMAIN=true`、`CF_CUTOVER_VERIFIED=true`と既存の履歴停止設定を用いて`npm run deploy:cloudflare`を実行する。`CF_SECRETS_FILE`を渡さない再配備では既存の暗号化secretを維持する。

アカウント固有設定・検証ログ・生成Assetsはgitignore対象の`.cloudflare/`に置き、認証値やOAuthトークンをGitへ追加しない。
