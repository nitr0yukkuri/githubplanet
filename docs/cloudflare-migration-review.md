# Cloudflare移行差分レビュー（2026-11-11）

追補（2026-11-12）: 明示許可後の公開プレビューは配備済み。実Hyperdrive、Queue、DO、流星、OAuth開始とsession再読取りを確認した。最新テストは338/338成功。本番未切替の判定は維持する。[公開プレビュー検証](cloudflare-preview-validation.md)

## 判定

移行コードと実DB接続プレビューは実装・配備済み。本番リリースの承認とは分けて扱う。Hyperdrive接続と資格情報の登録は完了したが、実OAuth、CPU枠・memory・実課金、DNS切替の確認が残るため、本番切替はまだ実施しない。

元の C:/src/githubplanet の多数の変更は混ぜず、main 404a115 から作った cloudflare-migration-4324 のworktreeだけを変更した。惑星shader、画像、CSS、カードの配色と配置の差分はない。

## 修正した指摘

| 重要度 | 発見した問題 | 対応と証拠 |
| --- | --- | --- |
| 高 | Express圧縮とWorkers Node HTTP adapterの組合せで、圧縮済みHTMLのencodingが欠落 | WorkerのみExpress圧縮を無効化。実workerdでHTMLとChrome描画を確認 |
| 高 | 履歴QueueとDOレート制限のportを用意してもComposition Rootからrouteへ渡していなかった | bootstrapの注入を修正。PG上のscan完了、100回を越えた429を確認 |
| 高 | appを毎リクエスト生成すると短期GitHubキャッシュが消え、API呼出しが増える | 完了済み値だけisolate内で保存。処理中Promise、DB Pool、sessionは共有しない。競合flushのテストを追加 |
| 高 | Queueに保存する前に成功ACKすると停止時に通知が抜ける | 署名検証→Queue保存→200。保存失敗503、再送時の安定IDを検証 |
| 高 | GitHubの長いcooldown中に60秒ごとのretryを消費すると、復旧前にDLQへ落ちる | 履歴失敗のretry_afterまでQueue再試行を遅らせる。1時間待機の単体テスト追加 |
| 中 | Cloud Run直URLへ流星接続し続けると移行後のイベントを受け取れない | ページのtransportメタ情報で同一originのnative WebSocketへ切替。旧NodeではSocket.IOを維持 |
| 中 | Webhook全文bufferとJSONの二重保持がWorkersのメモリ枠を圧迫 | 必要な葉だけストリーム抽出。26MiB本文で署名検証・Queue配信を実行 |
| 中 | 別delivery IDで同一本文を再送すると重複する | 本文hash＋commit位置をjob IDに使用。DOとブラウザーでも配信IDを重複排除 |
| 中 | response/session保存前のPool解放、古いsocketのclose、DO lease競合 | body完了後に解放、socket世代判定、lease更新を直列化。同時session分離と再接続を検証 |
| 中 | Workerでsession prune timerを使えず、期限切れsessionが蓄積 | 毎時Cronへ移し、expired行だけ消して有効sessionを保持する統合テスト追加 |
| 中 | Hyperdriveの既定query cacheでsessionやlockの読み取りが古くなる | 配備前にcache disabledをAPIで検証。placeholder bindingの配備を防止 |
| 中 | local secret/test-stateがDocker COPYへ混入する | .gitignoreと.dockerignoreに生成物・.dev.varsを追加。配信Assetsも明示的に選択 |

## 依存方向と互換性

Application/Domainの外向きimport禁止テストは成功。bootstrapとcloudflareが外側の具体実装を組み立てる。HTTPの既存route、DTO、OAuth state/PKCE、Cookie名、既存PostgreSQL schemaは維持する。Workerの履歴POSTだけは永続Queueの受付を返し、完了データは従来と同じGETから取得する。

Workers固有のiconv-lite browser置換問題は、build時のWorker専用コピーでNode入口を有効にした。元のnode_modulesやNode向け依存の動作は変更しない。既存依存のバージョン更新を広げず、wsも元のlockと同じ8.21.3に固定した。

## 検証と残る条件

- 単体・HTTP・境界・既存visual契約テストを実施。
- 実workerd＋使い捨てPostgreSQL15でOAuth fixture、Queue、DO、レート制限、同時session、Cron、26MiB webhook、スマホChromeを確認。
- GitHubへの実OAuthはfixtureでは代替できない。本番と同一originでの最終確認が必要。
- CloudflareのHyperdrive実接続は11月12日の追補で成功。CPU枠の適合、DO hibernationによる実課金、DNS、GitHub Actionsの外部GIF録画は未確認。
- MeteorHubは1000接続まで。複数地域での実latency・多数履歴データ時の128MB memory枠は負荷試験前で、性能保証はしない。
- npm auditは既存のfollow-redirects 1.16.1に高severity 1件。mainのlockにも同じ版があり、今回追加した脆弱性ではない。無関係な依存更新を混ぜず、別対応の対象として残す。[advisory](https://github.com/advisories/GHSA-mrwp-f3q8-3g9p)

実行コマンドと最終件数は作業結果に記録する。本番DNS、既存Cloud Run、DBデータや認証キーの変更は行っていない。

初回確認: npm ci --ignore-scripts 成功、npm test **332/332成功**、npm run check:cloudflare 成功、npm run test:cloudflare の全10グループ成功。Docker image buildとNode入口のPG起動・カードHTML・showcase APIも成功。クリーンインストール時の容量不足は今回の検証キャッシュ削除で復旧し、テストstateの自動後片付けも確認した。

ローカル後片付け: 検証stateは0件。Docker Desktopは容量不足後にEngine APIが応答しなくなったため、今回起動したDesktop/専用VMを停止して検証前の停止状態へ戻した。専用コンテナ githubplanet-cf-node-regression / githubplanet-cf-test-20261111 と image githubplanet:cloudflare-migration-review の削除完了は確認できていない。次回Docker起動時にこれらの名前だけを確認・削除する。

本番安定性の追加確認と障害時修正は [cloudflare-production-readiness.md](cloudflare-production-readiness.md) を参照。初回332件の成功だけで本番投入可能とは判定しない。
