# Cloudflare無料枠での停止リスク（2026-11-12）

## 判定

無料枠の上限によって機能が失敗する可能性がある。現在の少量利用が日次枠を使い切っているわけではなく、まずHTTPのCPU枠が問題になる。通常ホームでもCPU16ms・34msを観測し、当日集計のHTTP最大は49.107ms、95%点は41.647msだった。FreeのHTTP CPU枠10msへ十分な余裕がある状態とは判断しない。

さらに通常ユーザーカードAPIで500を再現した。これは上限超過と断定できない別の未解決事項であり、ショーケース成功と区別する。本番githubplanet.devの同APIは200で、DNS・プラン・本番構成は変更していない。

## 実測の条件

- 既存FreeアカウントのGraphQL AnalyticsとQueue REST metricsを読取り。集計期間は2026-11-12 00:00〜02:21/02:22 UTC（日本時間09:00〜11:21/11:22）。
- 数値は取得時点で反映済みの当日途中の集計。Adaptive datasetのサンプリング・反映遅延もあり、請求台帳や一日合計の保証値ではない。
- 同アカウントの別Workerも日次要求枠を消費しているため、アカウント全体とGitHubPlanetを分けて計算。
- 新たに各表示経路を2回ずつ逐次GETし、ヘッダーで限定した一時Tailで経路別CPUを観測。重い履歴・大量Webhook・上限を使い切る負荷試験は行っていない。
- TailにはURLのpath、CPU、wall time、outcome、例外件数、許可済みのエラー種別だけを記録。生ヘッダー・Cookie・認証情報は保存していない。終了後のTail残数は0。一時secretファイルも存在しない。

| 取得項目 | 当日集計の反映分 |
| --- | --- |
| アカウント全Worker要求 | 290（他Worker、切断、Queue、過去のCronを含む） |
| GitHubPlanet preview | HTTP成功57、HTTP切断6、Queue2、過去のCron2。計67。HTTP成功はstatus codeが200だけという意味ではない |
| GitHubPlanet HTTP CPU | 中央値6.766ms、95%点41.647ms、最大49.107ms |
| GitHubPlanet HTTP最大isolate memory | 18,704,427 bytes。履歴・持続負荷の最大値ではない |
| Hyperdrive | DB文20件、complete。エラー行なし |
| Queue | 操作6（write/read/delete各2）。本体・DLQのbacklogは双方0 |
| DO保存 | rowsRead=12、rowsWritten=24 |
| DO実行時間 | 0.281670144 GB-s |
| DO CPU/memory超過 | exceededCpuErrors=0、exceededMemoryErrors=0 |

previewのCronは前の配備で無効化済み。当日の過去の2回が集計に残ることを、現在もCronが有効な証拠とは扱わない。DOのHTTP切断6件は検証用WebSocket終了と一致し、制限超過エラーと同一視しない。

## 無料枠と失敗範囲

| 項目 | 公式の枠 | この構成での影響 |
| --- | --- | --- |
| HTTP CPU | 10ms/要求 | 超過が継続すれば1102。ホーム・カード・APIの個別要求が失敗。DBの待ち時間とCPU時間は別 |
| Worker要求 | アカウント計100,000/日 | 超過でWorker要求が失敗（1027等）。サイト全体の動的ページ・APIへ広く影響。静的Assetsは別 |
| Hyperdrive | DB文100,000/日 | session・ログイン・保存済み惑星APIなどが失敗。一つのHTTP要求で複数のSQL文を使う |
| Queues | 10,000操作/日、保持24時間 | 保存・読取り・削除・再試行で消費。超過時はFreeTierLimitExceeded等。流星・履歴の受付や処理に影響。保持期間を越える未処理メッセージは消える |
| DO保存 | 読取り500万行/日、書込み100,000行/日、合計5GB | 流星の重複排除・ジョブ状態・レート制限で共有。putだけでなくdeleteとsetAlarmも書込み枠を消費 |
| DO実行 | 100,000要求/日、13,000 GB-s/日 | HTTP/RPC・alarm等を計上。超過で該当操作失敗。休止可能なWebSocket待機時間を常時実行と数えない |
| memory | 128MB/isolate | 一要求ごとの枠ではなく同時処理で共有。大きい履歴・レスポンスbufferで1102等の懸念 |
| 外向き通信 | HTTP等50 subrequests/実行、接続開始待ちは6同時 | 履歴は1回15 API要求、詳細3並列で抑制。ただしデータ処理CPUや全件読取りmemoryの保証にはならない |

日次枠のリセットは00:00 UTC（日本時間09:00）。CPU・memory・同時接続の問題は日次リセット待ちで解決する種類の枠ではない。

公式根拠: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)、[Hyperdrive pricing](https://developers.cloudflare.com/hyperdrive/platform/pricing/)、[Queues pricing](https://developers.cloudflare.com/queues/platform/pricing/)、[Queues limits](https://developers.cloudflare.com/queues/platform/limits/)、[Queues error codes](https://developers.cloudflare.com/queues/reference/error-codes/)、[DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)。

## 経路別の再確認

| 経路 | HTTP 2回 | TailのCPU ms |
| --- | --- | --- |
| /showcase/perl | 200 / 200 | 16 / 34 |
| /card.html?showcase=perl&fix=true | 200 / 200 | 6 / 7 |
| /api/planets/showcase/perl | 200 / 200 | 6 / 5 |
| /api/planets/user/nitr0yukkuri | 500 / 500 | 31 / 13 |
| /healthz | 200 / 200 | 10 / 3 |
| /front/img/2k_mars.jpg | 200 / 200 | Workerのtraceなし。Assetsから配信 |

個別診断でもユーザーAPIの500を2回再現し、TypeError、CPU39/30ms、Worker outcome=okを採取した。Cloudflareの制限強制終了を示すoutcomeではなく、アプリが500を返している。安全な診断だけでは具体的な関数まで確定できず、無料枠超過が原因とは断定しない。本番の同一ユーザーAPIは200だった。

CPUの一時超過が全て即失敗するわけではない。Cloudflareは稀な超過に余裕を持たせているが、継続超過は停止させる仕様。そのため200の成功率だけでは10msへ収まるか評価できない。通常テスト338件成功も、実Free上のCPU枠・日次枠を保証する検証ではない。

## コードから見つかった枠の消費要因

### 高: HTTPごとにアプリ・ページ構成を作り直す

cloudflare/worker.jsのcreateRuntimeを各HTTPで呼び、Express middleware/route、Repository、外部client、page cacheとSEOを再構築する。page-routesは6種類のHTMLを読取り・公開URL置換する。共有DB Poolや処理中Promiseの持回しを避ける理由は正しいが、HTTP表示の初期化CPUは大きくなりやすい。経路別プロファイルでホームが10msを超えたことは確認済みだが、関数ごとのCPU内訳は未測定。

無料枠へ寄せるなら、まずCookieや本人データが不要な公開HTML・showcase JSONの処理を軽くする。認証・canonical・CSP・Realtimeメタの互換性を保ち、リクエスト固有Pool/I/Oをisolate全体で共有する修正は避ける。

### 中〜高: 拒否するAPI要求でもDOへ2回書き込む

RequestBudget.checkは許可/拒否を返す前に、毎回budgetのputとsetAlarmを行う。どちらも書込み枠を消費する。現在の利用量は24行と少ないが、拒否要求を含む50,000回のcheckで100,000行に相当する計算になり、他の流星/ジョブ書込みより先にアカウントの枠を使い切り得る。これは容量保証や現在の消費量ではなく、コードと課金仕様からの予算計算。

### 中: 流星の掃除は一日最大1000件

MeteorHub.alarmはprefix listを1000件に制限し、次回alarmを一日後にする。一回のalarmで1000件より多く削除できず、流星が継続して1000件/日を超えれば、保存件数は増え続け得る。24時間は記録を消せるようになる条件であり、24時間で必ず全件消えるTTLではない。短い間隔で掃除を継続する方式等は別の修正対象。

### 中: Queue枠はコミット数やWebhook回数と同じではない

64KB以下で再試行のない一メッセージは通常write/read/deleteの3操作なので、10,000操作は約3333メッセージに相当。現在は複数コミットを一メッセージへまとめるため、流星が3333件で必ず止まるという意味ではない。最大32件・96KiBのbatchは64KBを越えると操作が複数単位となり、履歴再予約・再試行・DLQも枠を消費する。32コミット/batchでの理論上限だけを本番の安全人数へ変換しない。

### 中〜高: 履歴の全件読取りと大きいWebhook

履歴サービスはknown commitキーを全件取得してSetを作る。履歴GETも全件を取得・集計する。Repository SQLにLIMITはなく、処理の再開単位を15 GitHub要求に抑えても既存行の読込み量は抑えられない。WorkerのHTTP応答はarrayBufferへ一度まとめるため、同時要求ではmemoryが共有される。今回は約18.7MBで枠内だが、大きい履歴を測っていない。

Webhookは最大50MiBをストリーム解析する。memoryの二重保持を避けても、署名計算・JSON解析のCPUは本文量に応じて増える。ローカルworkerdで26MiBを処理できた結果は、FreeのHTTP CPU10msに収まる証拠にはならない。

### 中: 流星の1000同時接続はアプリ独自の制限

MeteorHubは全員を一つのglobal Objectへ接続し、1000接続以上の新規接続を503で拒否する。これはCloudflare無料プランの1000人上限ではない。1人複数タブも別接続となる。主な影響は流星接続であり、ホームのHTTP全体を止める判定ではない。

## 枠を節約できているところ

- 惑星のThree.js/WebGL描画とアニメーションは閲覧者の端末で動く。毎フレームCloudflare CPUを消費する構成ではない。
- texture・JS等は通常Assetsへ直送され、Worker要求枠とは別の無料・無制限配信。今回の画像要求でもWorker traceはなかった。公開HTMLは現在Workerを通る。[Assets billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)
- 流星はWebSocket Hibernation APIと自動ping/pong応答を使用。通常の待機を非休止Objectとして常時稼働させない。[DO WebSocketの計上](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- Queueはbatch、DB Poolはリクエスト単位最大3、query_timeoutは15秒、Hyperdriveのorigin接続soft limitは5。DBが応答しない要求を無制限に待つ作りにはしていない。ただし5は全世界合計の厳密な接続上限ではなくsoft limitで、混雑時は取得待ち・timeoutの可能性がある。
- 既知言語の流星では色定数を用い、毎回のGemini通信を必須にしない。

## 対応するならこの順

1. 通常ユーザーAPIのTypeErrorを切り分け、本番200の経路とプレビュー500の差を直す。課金変更だけでこのエラーが直るとは考えない。
2. 公開HTML・showcase APIのCPUを減らし、HTTPの多数回・cold/warm・同時要求を分けて10msへの適合を再測定する。
3. RequestBudgetの拒否時書込みと不要なalarm更新を減らす。流星の掃除上限も修正する。
4. 履歴と大きいWebhookのCPU/memoryを別枠で検証する。実DBの履歴を負荷試験用に書き換えない。
5. Worker要求、Hyperdrive DB文、Queue操作/保持期限、DO書込み/実行時間をそれぞれ監視する。50%/80%等の運用目安を置く場合も、日次回数に達する前のCPU制限は別途監視する。

無料枠での動作可能性と現在の実装の安全性を分ける。現時点で日次枠の枯渇は確認していないが、このまま全機能を本番へ移して上限で落ちないとは言えない。今回の作業は調査と記録のみ。アプリのコード、配備、DNS、料金プランを変更していない。
