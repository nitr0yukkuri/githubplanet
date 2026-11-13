# Cloudflare移行

最新の状態は [本番切替と検証結果（2026-11-13）](cloudflare-cutover.md) を参照。Cloudflare Freeへ切替済みで、実OAuth・セッション保持・本人カードの描画を確認し、Cloud Runを手動0台、旧Cloud Buildトリガーをdisabledにした。過去の [公開プレビュー検証（2026-11-12）](cloudflare-preview-validation.md) は切替前の調査記録として残す。

## 構成と互換性

| 責務 | 現行Node / Cloud Run | Cloudflare |
| --- | --- | --- |
| HTTP / OAuth / API | Express | 同じExpressアプリをWorkersのNode HTTP adapterで実行 |
| HTML / CSS / texture | filesystem / express.static | 埋め込みHTML / Workers Assets |
| 永続データ / session | Neon PostgreSQL | 同じPostgreSQLへHyperdrive経由で接続 |
| 流星 | Socket.IO | Hibernation WebSocket対応Durable Object |
| Webhook / 履歴 | Nodeプロセス内 | Queues + Durable Objectの重複排除・lease |
| 利用回数制限 | Expressメモリ | アカウントまたはIP単位のDurable Object |
| 期限切れsession | connect-pg-simpleのtimer | 毎時Cronで最大1000行を削除 |

惑星のshader、テクスチャ、カードテーマ、UI配置は変更しない。Node入口は残し、旧方式のSocket.IOもメタ情報のないページでは維持する。

共有Composition Rootは src/bootstrap/create-application.js。Application/DomainからCloudflare、Express、pgを参照させない。Workers側のbinding、Queue、接続ライフサイクルは cloudflare/ に閉じ込める。

Hyperdriveではsession単位のadvisory lockを使うmigrationは実行しない。既存のNode CLIで直接DBへ npm run migrate を実行し、Workerの /healthz は埋め込んだmigration checksumをSELECTで照合する。今回の移行用migrationや本番DDLはない。

## ローカル検証

Node 24.22.1以上24系、ローカルPostgreSQL15、Chromeを用意する。

~~~powershell
npm ci --ignore-scripts
npm test
npm run check:cloudflare
$env:TEST_DATABASE_URL = 'postgresql://githubplanet:local-test-only@127.0.0.1:55435/githubplanet_cf'
npm run test:cloudflare
~~~

test:cloudflare は localhost / 127.0.0.1 の githubplanet_cf から始まる専用DBだけを受け付ける。本番DBを渡さない。使い捨てDBへmigration、fixture惑星、session、履歴を保存する。GitHub通信はfixtureに置き換え、Workers本体・Hyperdriveのローカル接続・Queue・DOは実ランタイムで動かす。

検証対象はOAuth state/PKCE/session往復、callback再利用拒否、匿名401、管理キー401、2接続への流星配信、ping/pong、Webhook署名と再送の重複排除、履歴Queue、共有レート制限、不正Origin403、スマホ幅のホームとカード。CIはUbuntu24.04とPostgreSQL15で同じ手順を実行する。

## 配備前に必要な設定

1. 既存プランのWorkers CPU枠が適切か確認する。wrangler.json の cpu_ms=30000 は無料プランの10ms CPU枠を前提にしていない。無料枠で動くと断言しない。有料化や契約変更はこのコードでは行わない。
2. 対象アカウントにHyperdriveを作成する。Neonの直接接続用hostを用い、query cachingを必ず無効化する。session更新直後の読取り、条件付きscan lockを古いキャッシュへ戻さないため。
3. previewでは githubplanet-background-preview と githubplanet-background-preview-dlq、productionでは githubplanet-background-production と同名-dlqを作成する。previewと本番のQueue/DOを混在させない。
4. GitHub OAuth Appのcallbackを公開originと一致させる。workers.devで実OAuthまで試す場合は、プレビュー専用のOAuth Appを使うか、既存Appにプレビューcallbackを追加できるか確認する。既存本番callbackは維持し、認可後の往復まで確認する。[GitHubのredirect URL仕様](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#redirect-urls)
5. SESSION_SECRET、SYSTEM_API_KEY、GITHUB_WEBHOOK_SECRET、GITHUB_CLIENT_ID、GITHUB_CLIENT_SECRET、GEMINI_API_KEYを私有JSONファイルに用意する。既存のsessionを引き継ぐなら同じSESSION_SECRETを使用する。値はPRやCLI引数へ書かない。

~~~powershell
$env:CF_TARGET = 'preview'
$env:CF_ACCOUNT_ID = '<account id>'
$env:CF_HYPERDRIVE_ID = '<cache disabled Hyperdrive id>'
$env:CF_PUBLIC_BASE_URL = 'https://githubplanet-preview.<subdomain>.workers.dev'
# 無料プランでの検証時だけ指定する。productionには使用できない。
$env:CF_FREE_PREVIEW = 'true'
$env:CF_SECRETS_FILE = '<private absolute path>/secrets.json'
# 現行サービスに停止対象ユーザーの設定がある場合は、その値も引き継ぐ。
$env:PLANET_HISTORY_DISABLED_USERNAMES = '<existing setting>'
npm run preflight:cloudflare
npm run deploy:cloudflare
~~~

認証は CLOUDFLARE_API_TOKEN または wrangler login を使う。スクリプトはHyperdriveの存在・キャッシュ無効化、Queue/DLQ、必要なsecret名、公開URLを検査する。秘密値を含まない設定のみ .cloudflare/deploy-wrangler.json に生成する。secretsはWranglerの --secrets-file JSON経由で同一versionへ設定する。rootのplaceholder IDをそのまま配備しない。

previewにはCronを登録せず、本番DBの期限切れsession保守を二重実行しない。versionごとのpreview URLも無効化し、固定のworkers.dev originでCookieとOAuthを検証する。配備用の私有JSONは確認終了後に削除する。再配備する場合も秘密値をログへ出さない方法で用意し直す。

起動成功だけでは切替成功にならない。公開環境でも /healthz、showcase、保存済み惑星、実OAuth、管理sender、Webhook、履歴再開、カード埋め込みとGitHub ActionsのGIF生成経路を確認する。

## 本番切替と戻し方

- まずworkers.devへ配備し、Cloud Runはそのまま維持する。API/session/RealtimeにはCDNキャッシュを使わない。
- Cloudflareアカウント内で githubplanet.dev zone を有効にし、既存DNSレコード・DNSSEC・メール用レコードを保存して照合する。ネームサーバー変更はDNSレコードの移行完了後に行う。
- production Workerを、PUBLIC_BASE_URL=https://githubplanet.dev、既存OAuth callback=https://githubplanet.dev/callback で用意する。検証後のみ CF_TARGET=production、CF_ATTACH_DOMAIN=true、CF_CUTOVER_VERIFIED=true でCustom Domainを付ける。これらのフラグは承認を代わりに行うものではなく、誤設定防止。
- 段階切替中はSocket.IOとDOの間で流星が共有されない。旧タブは再読み込みでnative WebSocketへ移る。切替中の一時的なリアルタイム演出差を確認する。
- 問題があればCloudflareのWorker用Custom Domain/routeを外し、保存したFirebase Hosting向けDNSへ戻す。Nodeコード・DB構造・元のCloud Run Revisionを残す。DNS TTL分の復旧待ちはありうる。
- 安定後にCloud Build自動配備とCloud Runの後片付けを別に行う。先にCloud Runを削除しない。

## 障害時の性質

- Webhookは署名検証後、本文をストリーム解析して必要な言語/サイズだけを最大32件・96KiBのbatchでQueueへ入れる。全文、コミットメッセージ、ファイル一覧、OAuthトークンをQueueに残さない。保存失敗は503で返す。GitHub側の失敗deliveryは運用で再送する必要があり、自動再配達を仮定しない。
- Queueは最大8回再試行後DLQへ送る。DLQの件数とretentionを監視し、保持期限内に原因を解消して再投入する。配信IDはDOとブラウザーで重複排除するが、接続していないブラウザーへの過去の流星再生は行わない。
- 履歴QueueにはGitHub IDだけを保存し、実行時に有効な本人sessionからアクセストークンを取得する。tokenが消えた場合はジョブを終了し、再ログイン後のscan要求で再開する。部分スキャンとAPI cooldownはQueueへ再予約する。
- Poolはリクエスト/Queue実行ごとに生成・解放し、session保存とHTTP body完了前には閉じない。SQL query cacheは常に無効。GitHubの短期キャッシュとGeminiのモデル一覧は取得済みの値だけをisolate内で再利用し、処理中Promiseを別リクエストへ渡さない。Express圧縮はWorkerでは使わずCloudflareへ任せる。
- DOのWebSocketは自動ping/pongとHibernationを使う。常駐intervalや外向き接続をDO内に作らない。現在のMeteorHubは最大1000接続の単一配信先で、それ以上は503を返す。

## 料金と未検証事項

Workers Paidはアカウント単位で月額最低5 USD。既存のNeon、ドメイン、超過CPU/Queue/DO等の料金は別。Cloud Runは現在min instances=0なので、移行だけで必ず安くなるとは限らない。実課金とアクセス量の比較後に判断する。HyperdriveがNeon接続を保持する時間もDBの稼働時間へ影響しうる。

2026-11-11時点では外部リソースと実DB接続は未作成だった。その後、2026-11-12のユーザーによる明示許可を受け、既存無料プランのままプレビューへ資格情報を登録し、Hyperdrive・Queue・DOを配備した。8同時・計24件の読取りはすべて200だったが、採取したtraceのCPU時間は最大21msで、無料枠10msを上回る。無料枠での本番安定性・実課金・本番DNS切替を確認済みとは扱わない。[公開検証の詳細](cloudflare-preview-validation.md)

参考: [Express on Workers](https://developers.cloudflare.com/workers/tutorials/deploy-an-express-app/)、[Hyperdrive query caching](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/)、[Hibernating WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)、[Queue limits](https://developers.cloudflare.com/queues/platform/limits/)、[Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)。

本番安定性の追補: [cloudflare-production-readiness.md](cloudflare-production-readiness.md)。lease待機・query timeout・batch配信・publisher競合は追加検証済み。本番切替の判断は実Cloudflareでの確認後とする。
