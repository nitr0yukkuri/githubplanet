# 本番安定性の再確認（2026-11-11）

追補（2026-11-12）: この文書の未配備状態は11月11日の調査結果。ユーザーの明示許可後、実DBへ接続する公開プレビューを配備し、Hyperdrive・Queue・DO経路を確認した。無料枠CPU10msに対して最大21msを観測したため、本番切替は引き続き保留する。最新結果は [cloudflare-preview-validation.md](cloudflare-preview-validation.md) を参照。

## 判定

公開中のCloud Runに、調査時点で停止やサーバーエラーの兆候は見つからなかった。作業中のCloudflare版は、実配備・実Hyperdrive・実OAuth・負荷時の上限が未確認なので、本番投入の判断を保留する。

前回の332件成功は通常経路を中心とした結果だった。今回、障害時の検証を追加し、下記を修正した。ローカルの成功と、Cloudflare本番の安定性を区別する。

## 公開中環境の確認結果

| 対象 | 結果 |
| --- | --- |
| Cloud Run | githubplanet-git-00148-7j9、Ready=True、traffic=100% |
| commitラベル | 404a115980c09e941d8b09e445f334dcb551148a。移行worktreeの基点と同じ |
| 設定 | 1 vCPU、512Mi、同時80、最大20 instance、最小0、timeout300秒 |
| 直近24時間の5xx検索 | 0件。最新1000件の抽出とは別に5xx条件で検索 |
| 直近24時間のERROR検索 | 対象サービスで0件 |
| 最新1000リクエスト | 5xxなし。Cloud Run記録のp95約30ms。静的ファイル・404等を含み、APIだけや画面全体のp95ではない |
| HTTP疎通 | ホーム200、Perlカード200、Elm showcase API200、匿名 /api/me は期待どおり401 |
| Chrome | ホームとPerlカードを描画。pageerror=0。自サイト側の失敗は匿名 /api/me の401のみ |
| 本番DB schema | READ ONLY transactionで番号とchecksumを照合。001/002/003/009/010/011/012に不足・不一致なし |
| Cloudflare | 対象アカウントにgithubplanet Worker、Hyperdrive、githubplanet.dev zoneは未作成 |

404には /api/.env、actuator、phpinfo等の探索と、配信していないsource map、現在参照していないJS名への要求が含まれた。カードの個別404や未登録showcaseへの要求もあり、全404をbotとは断定しない。今回確認した通常ホーム・カードの描画には影響がなかった。

本番の設定、DNS、認証キー、ユーザーデータは変更していない。管理流星送信・本物のOAuthログイン・Webhook投稿は公開中環境では実施していない。

## 再現・修正した問題

| 問題 | 変更前のリスク | 対応と検証 |
| --- | --- | --- |
| 異常終了後のlease | lease15分に対しbusy時60秒retryなので、解除前に再試行8回を使い切る | 残りlease終了直後まで待つ。古いDO応答に残り時間がなくても15分待つテストを追加 |
| 応答停止したDB | 接続開始の10秒制限だけでは、接続後のquery停止を制限できない | query_timeout=15000を追加。接続だけ受け付けてqueryへ応答しない疑似PGで、変更前失敗・変更後timeoutとPoolからの除去を確認 |
| 大量push | 最大2048コミットなら2048回の保存RPCを応答前に直列実行 | 最大32件・96KiBずつのbatchへ変更。各流星はjob ID＋位置で安定IDを持つ |
| Queue保存中の排他 | 外部I/OをblockConcurrencyWhile内で待つと、30秒超でObjectがresetされ、他のRPCも待つ | 外部I/Oを排他区間から除外。publication tokenで遅いpublisherがconsumerのrunning/completeを上書きしないようにした |

DBの15秒は各query呼出しの期限であり、HTTP操作全体が15秒以内に完了する保証でも、DB側のSQL取消の保証でもない。[pgのtimeout仕様](https://node-postgres.com/apis/client)

大量pushは、RPC平均5msでも2048回で10秒を越える計算になる。これは設計上の予算計算であり、本番latencyの実測ではない。GitHubは10秒以内の応答を要求する。[GitHubの推奨](https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks)

ローカル実workerd＋Queue＋DO＋WebSocketでは、2048件すべての到着、64ジョブ、再送による追加配信0を確認した。受付は約2.3〜2.4秒。実Cloudflareで応答期限を満たすかは別に測る。

実DOのQueue保存だけを止めたfixtureでは、consumerが処理を進め、遅いpublisherが戻った後もcompleteが保たれることを確認した。[DOの排他設計指針](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/)

変更箇所: cloudflare/job-policy.js、jobs.js、database.js、durable-objects.js、worker.js、src/application/meteor-service.js。

## 残る本番投入の条件

| 優先 | 未確認事項 | 必要な対応 |
| --- | --- | --- |
| 高 | 実HyperdriveのTLS、query cache、接続枠 | cache disabledで作成し、session保存直後の読取りと同時APIを確認。本番schemaの一致だけでは経路の動作確認にならない |
| 高 | CPUとプラン | 設定は30秒。無料枠CPU10msを前提にしていない。実プラン、startup time、CPUを確認。有料契約は自動変更しない |
| 高 | 128MBのmemory枠 | isolate全体の上限。履歴行・既知キーの全件読取りとHTTP body bufferがあり、大きい履歴と同時要求でmemory/1102を測る必要がある |
| 高 | 本番相当originでの実OAuth・sender・署名Webhook | 今回のCookieテストはHTTPS終端後のExpress経路。公開プレビューで本物の往復を確認 |
| 中 | Queue自動並列数とDBの実接続枠 | 予定負荷でDB待ち・retry・backlogを測り、両方を合わせて調整 |
| 中 | 流星の同時接続 | MeteorHubは最大1000接続。それ以上の新規接続は503。HTTPサイト全体の停止とは区別する |
| 中 | DLQと失敗deliveryの復旧 | 再試行超過の監視、保持期限内の再投入が必要。GitHubは失敗deliveryを自動再送しない |
| 中 | 既存依存のadvisory | follow-redirects 1.16.1にhighが1件。移行前から存在し、別の焦点を絞った修正対象として残す |

[WorkersのCPU・memory制限](https://developers.cloudflare.com/workers/platform/limits/)、[Hyperdriveの接続・query制限](https://developers.cloudflare.com/hyperdrive/platform/limits/)、[GitHub失敗deliveryの扱い](https://docs.github.com/en/webhooks/using-webhooks/handling-failed-webhook-deliveries)

## 検証範囲

- npm test: 障害時、batch、本番Cookieを含む。最終件数は追補へ記録する。
- npm run check:cloudflare: 実配備をしないbundle検証。
- npm run test:cloudflare:realtime: 実workerdで2048件配信・再送・publisher競合を検証。外部DB/GitHubは不使用。
- 前回のPostgreSQL＋workerd統合10グループは成功済み。この追補ではDockerを再起動しての再実行はしていない。

fixtureの診断routeはローカル/CI専用entryに限定。本番Worker entryへは追加していない。惑星shader・テクスチャ・CSS・カード配置も変更していない。

最終結果: npm test **337/337成功**、npm run check:cloudflare 成功。実workerdの保存待機競合テスト成功、2048流星・64batch・重複0、ローカル受付2281ms。Windowsの長い保存先では内部エラーが出たが、保存先を短くした同一コードで成功したため、検証stateの短いパスを使用する。これを実Cloudflareでの503と混同しない。
