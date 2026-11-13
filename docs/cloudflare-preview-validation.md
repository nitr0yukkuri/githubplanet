# Cloudflare公開プレビュー検証（2026-11-12）

追加調査: [無料枠での停止リスク](cloudflare-free-plan-risk-analysis.md)。HTTP CPUは当日集計で最大49.107ms、通常ホームでも10ms超を観測。通常ユーザーAPIの500も再現したため、以下のshowcase成功を通常ユーザーカードの成功と扱わない。

## 現在の判定

実DBにつながるプレビューは配備済み。通常の読取り、セッション保存、管理流星、署名WebhookからQueue・DOを経由する配信は動作した。一方、無料枠CPUの余裕とGitHub認可後の実ログイン完了、大きな履歴処理は未確認なので、本番切替の条件は満たしていない。

- [ホーム](https://githubplanet-preview.nitr0yukkuri.workers.dev/showcase/perl)
- [Perlカード](https://githubplanet-preview.nitr0yukkuri.workers.dev/card.html?showcase=perl&fix=true)
- [healthz](https://githubplanet-preview.nitr0yukkuri.workers.dev/healthz)

本番githubplanet.devのDNS、Cloud Run、GitHub OAuth App設定、料金プランは変更していない。検証後も本番ホームは200だった。惑星のshader、テクスチャ、CSS、カード配置は変更していない。

## 許可と配備対象

ユーザーが本番接続情報・6種のキーのCloudflare登録と実DB接続プレビューを明示許可した後に実施した。既存キーは変更せずCloudflareのsecretとして登録し、値をログやGitへ出していない。WorkerにDATABASE_URLを置かず、DB資格情報はHyperdriveのoriginへ渡した。

| 対象 | 配備内容 |
| --- | --- |
| Worker | githubplanet-preview |
| 最新version | 570cb977-70d4-48b4-af85-87a0d9a8271f |
| 起動時CPU | Wranglerの配備結果で50ms。HTTP要求のCPU時間とは別 |
| Hyperdrive | githubplanet-preview-postgres。Neon直接host、query cache disabled、origin接続soft limit 5 |
| Queue / DLQ | githubplanet-background-preview / githubplanet-background-preview-dlq |
| Durable Objects | MeteorHub、BackgroundJobState、RequestBudget |
| secret名 | SESSION_SECRET、SYSTEM_API_KEY、GITHUB_WEBHOOK_SECRET、GITHUB_CLIENT_ID、GITHUB_CLIENT_SECRET、GEMINI_API_KEY |
| preview保守 | Cronなし。本番DBの保守を二重実行しない。version URLも無効 |
| 履歴停止設定 | 現行のPLANET_HISTORY_DISABLED_USERNAMESを引継ぎ |

既存アカウントはWorkers Freeで、cpu_ms=30000の配備はAPI 100328で拒否された。プラン変更は行わず、CF_FREE_PREVIEW=trueの明示指定時だけCPU上限の指定を省く。productionにこのフラグを指定すると設定生成を拒否する。通常のproduction設定とCronは維持する。

## 実サービスで確認したこと

| 経路 | 結果と範囲 |
| --- | --- |
| /healthz | 200。実Hyperdrive経由で本番schema_migrationsの番号とchecksumを読取り照合 |
| ホーム / カード / showcase API | 200。ホームへnative WebSocketの設定が埋め込まれることも確認 |
| 管理流星 | 不正キー401。正しいキーで200、2つの実WebSocket接続に同じイベントIDが到着 |
| WebSocket Origin | 不正Originを403で拒否 |
| 署名Webhook | 不正署名401。正しい署名で200、2コミットの流星がQueue・DO経由で両接続に到着 |
| Webhook再送 | 同じ本文を別delivery IDで送信し、配信の追加なし。手動1件＋Webhook2件の計3件を両接続で確認 |
| OAuth開始 | /loginが302、Secure・HttpOnlyの__session Cookieを発行。redirect_uriがプレビューoriginと一致 |
| session再読取り | 同じCookieで不正stateのcallbackを送り400。安全な診断ログでCookie・PKCE verifier・期待stateの存在を確認 |
| GitHub認可ページ | 未ログイン状態ではGitHubログインへの302。これだけではcallback登録や認可完了の確認にならない |
| 匿名API | /api/meは401 |
| 非公開ファイル | /.cloudflare/deploy-secrets.json、/.env、/cloudflare/worker.jsは404。応答へキー値が出ていないこともメモリ内照合で確認 |

テストはプレビューの管理流星・Webhook・匿名OAuth sessionを作成する。惑星の更新、履歴スキャン、本番DDL、キーの再発行は実施していない。匿名sessionは通常の有効期限で失効させ、production sessionを一括削除しない。検証用Tailは終了・削除し、APIで残数0を確認した。配備用の一時secretファイルも検証後に削除した。

このチャットのChrome操作接続は利用不可で、既存Edgeウィンドウもサインイン画面の待機状態だった。公開プレビューの目視確認・実GitHub認可操作は行っていない。前日のローカルChrome検証を公開プレビューの目視確認とは扱わない。

## 小規模同時アクセス

実行時刻: 2026-11-12 00:50:20 UTC。最大同時8、計24要求を、healthz・ホーム・Elm showcase APIへ3回に分けて送った。これは短時間の読取り確認で、持続負荷や本番利用者数に対する性能保証ではない。

| 指標 | 結果 |
| --- | --- |
| HTTP | 24/24が200 |
| resource limit応答 | 0 |
| 最大クライアント経過時間 | 3025ms。p95やサーバーCPUとは別 |
| 採取できたTail event | 23件、すべてoutcome=ok |
| 採取traceの最大CPU時間 | 21ms。全要求のtrace採取を保証せず、上限の保証値ではない |
| OAuth | 開始302、不正state400、Secure Cookieあり |

FreeのHTTP CPU枠は10ms。Cloudflareには一時的な超過を許す余裕があるが、継続して超えると実行停止する仕様なので、今回200だったことから無料枠で安全とは結論しない。[CloudflareのCPU・memory制限](https://developers.cloudflare.com/workers/platform/limits/)

## 回帰検証と残る条件

- npm test: **338/338成功**。無料プレビューとproductionの設定分離、preview Cron無効化も含む。
- npm run check:cloudflare: bundle検証成功。実配備の起動時CPUも50msで確認。
- 前日の使い捨てPostgreSQL＋workerd、2048流星の検証結果は既存追補を参照。この実DB確認では大きな履歴スキャンを起動しない。
- 実OAuthの往復、カード埋め込みと外部GIF録画、履歴再開、大きな履歴・持続負荷でのCPU/128MB memory、Queue再試行・DLQ監視、実課金の確認が残る。
- 本番DNS切替、Cloud Run/Cloud Build削除、料金プラン変更は未実施。これらを完了したとは扱わない。
