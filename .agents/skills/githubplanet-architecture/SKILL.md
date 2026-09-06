---
name: githubplanet-architecture
description: GitHubPlanetのバックエンドと共有フロントエンドを設計・実装・レビューするときに、レイヤードなモジュラーモノリスの責務境界、依存方向、Composition Root、移行方針を守る。
---

# GitHubPlanet アーキテクチャ

## 使う場面

GitHubPlanetの新機能、既存コードの分割、PRレビュー、性能改善、認証・Webhook・惑星生成・言語別演出の変更を行うときに使う。現在の構成を正確に「レイヤード構成のモジュラーモノリス」として扱い、厳密なClean Architectureやマイクロサービスへ無目的に作り替えない。

## アーキテクチャの基準

依存の理想形は次のとおり。`server.js`だけが外側の具体実装を組み立て、アプリケーションへ注入する。

```text
Browser
  -> presentation/http (Express、HTTP、session、cookie、HTML、Socket.IOの入口)
  -> application (ユースケース、オーケストレーション、注入されたport)
  -> domain (純粋な惑星ルール、判定、値の計算)

application -- injected ports --> infrastructure
server.js -- composition --> presentation + application + infrastructure
```

Webhookは `presentation -> applicationのイベント用ユースケース/ポリシー -> realtime port -> Socket.IO` の順にする。Domainは外側の層を知らず、InfrastructureはApplicationをimportしない。

これは現在のコードを評価するための目標方向であり、現状が完全な依存逆転を達成済みという意味ではない。既存の挙動を守りながら、漏れている境界を段階的に直す。

## 各層の責務

### Composition Root: `server.js`

- 環境変数・設定を読み、PostgreSQL、GitHub、Geminiなどの具体アダプターを生成する。
- Repository、外部クライアント、Application service、HTTP route、Socket.IOを接続する。
- middleware、認証設定、起動・停止、必要なbootstrapを担当する。
- 業務ルール、GitHubデータの集計、HTTPレスポンスの細かな整形を置かない。
- 依存性注入の起点として薄く保つ。分割するときは `config`、`createApp`、`bootstrap`、`realtime` へ整理しても、具体実装の組み立て場所はComposition Rootに残す。

### Domain: `src/domain/planet/`

惑星のプロダクトルールを純粋関数・値として持つ。例はコミット数の正規化、実績判定、称号報酬、惑星名、サイズなど。

- Express、PostgreSQL/`pg`、Axios、GitHub API、Gemini、filesystem、HTTP DTOをimportしない。
- DBのsnake_case行やGraphQLレスポンスを直接受け取らない。必要なら内部の明示的な入力モデルへ変換してから呼ぶ。
- 時刻・乱数などは引数で注入し、テストを決定的にする。
- `constants.js`に設定、Webhookの拡張子変換、言語色、実績ルールを無制限に混在させない。純粋なドメインルールとアプリ設定・入力マッピングを分離する。

`showcase-planets.js`のような決定的なプロダクトfixture/read modelは小規模な間は許容する。ただしHTTP routeが直接読む構造をユースケースとして育てる場合はApplicationへ移す。

### Application: `src/application/`

ユーザーが行う一つの操作を完了させるユースケースと、I/Oの順序を持つオーケストレーションを担当する。

- Domainと、引数で注入された狭いportだけに依存する。
- `src/infrastructure`や`src/presentation`をimportしない。
- 現在の惑星生成は、GitHub取得、`planet-stats.js`の集計、既存惑星の読み出し、`planet-identity.js`の個性、`planet-progression.js`の実績・称号、保存、結果返却を`planet-service.js`が調整する。
- 統計、個性、進捗の純粋な判断を別モジュールに保ち、I/O順序をserviceに固定する。仕様変更が他の関心へ波及しないようにする。
- 本番で必要な依存をoptionalにして「DBあり」と「DBなし」で意味が変わるAPIを増やさない。プレビュー/fixtureは明示的な別ユースケースまたはno-op portとして表す。

### Infrastructure: `src/infrastructure/`

具体的な技術との接続を閉じ込める。

- `database/planet-repository.js`、`postgres.js`はDB接続・トランザクション・スキーマを担当する。
- DBスキーマ変更は連番migrationとして管理し、`npm run migrate`から明示的に適用する。HTTPサーバー起動時は適用確認だけを行い、DDL・backfill・index作成を実行しない。
- `external/github-client.js`、`gemini-client.js`は外部API通信、リトライ/キャッシュ、外部DTO変換を担当する。
- アダプターはApplication全体や巨大なRepositoryを受け取らず、`languageColorStore`のような狭いportを注入する。
- DB row、GitHub GraphQL、Gemini応答をApplication/Domainへそのまま漏らさず、境界で内部入力モデルへ変換する。
- InfrastructureからApplicationの便利関数を呼ばない。純粋な `calculateLoginProgress` のような関数はDomainへ移し、トランザクションの調整はApplicationのユースケースとportで行う。
- 観測処理は通信境界を壊さず、`observability`に分離する。性能計測が本番挙動を変えないことを確認する。

### Presentation: `src/presentation/http/`

HTTP/WebSocket入口の輸送責務を担当する。

- リクエストの検証、認証情報・session・cookieの読み書き、ステータスコード、レスポンス形式、HTML配信を行う。
- Application use caseを呼び、例外をHTTP/WebSocketの結果へ変換する。
- `toPlanetResponse`のようなAPI DTO serializerはPresentationまたは専用mapperに置く。DomainにDB row→HTTPレスポンス変換を置かない。
- Meteorのサイズ計算、拡張子から言語を決める処理、称号の正当性などの業務計算をrouteへ置かない。routeは検証・acknowledge・委譲に留め、Applicationのイベントユースケースへ移す。
- `page-routes.js`のfilesystem/HTML責務はPresentationとして妥当。`planet-routes.js`の履歴・fallbackなどは、複雑化したらApplicationへ移す。

### Frontend: `front/js/`

- `home.js`と`card.js`はシーン、renderer、animation、disposeなどのページライフサイクルを担当する。
- `planet-features/registry.js`は言語の完全一致、feature選択、material/object生成、更新コンテキスト、風速などの共通ランタイムを担当する。
- 各言語feature moduleはその言語のShader、material、視覚効果、更新処理を所有する。
- home/cardで言語判定やShader分岐を複製しない。新しい言語はregistryとfeature moduleへ追加し、両画面の共通ランタイムで動作確認する。
- registryの静的importは決定的なカード生成には有利だが、bundleサイズが問題になったときだけlazy/dynamic importを検討する。先に挙動を壊す大規模な分割をしない。

## 現在確認済みの境界課題

レビューでは「動くか」だけでなく、次の漏れを明示的に検査する。

1. `planet-repository.js -> application/login-progress.js` の逆向き依存は、レイヤー目標に反する。純粋計算をDomainへ、DB更新の調整をApplicationへ移す。
2. Domainの `toPlanetResponse(row)` がDBのsnake_caseとHTTPの返却形を同時に知っている。Repositoryのrow mapperとPresentationのresponse serializerに分ける。
3. `gemini-client.js`が言語色のプロダクト判断と具体Repositoryを抱える。Gemini通信を汎用化し、色の判断はApplication、保存は狭い`languageColorStore` portへ分離する。
4. `planet-stats.js`がGitHub GraphQLの生フィールド名を知る。外部アダプターのDTO mapperを境界に置く。ただし、まずは挙動を固定し、必要性が出てから分離する。
5. `planet-query-service.js`の検索、cache、random fallback、称号保存が膨らんだら、ユースケース単位へ分割する。小規模なfacadeを機械的に分割しない。
6. `constants.js`の設定値、Webhook入力変換、ドメインルールの混在を整理する。変更頻度と責務が異なるものを同じ定数ファイルに集めない。
7. `server.js`のruntime configはComposition Rootの運用課題として扱う。DB migrationは専用コマンドへ分離済みなので、起動時DDLへ戻さない。

## 守るべき互換性

分割・移動の前後で、次を壊さない。

- HTTP APIのレスポンス形、status code、エラーハンドリング。
- OAuth state検証、session cookie、callback URL、ログイン進捗。
- ランダム惑星の検索順、履歴除外、fallback、DBなしのshowcase/preview挙動。
- Webhookのacknowledge、meteorイベント、Socket.IO通知。
- `home`と`card`の言語別演出、アニメーション更新、カードの決定的レンダリング。
- 本番DBに対して、テスト目的のmigration/backfill/index作成を実行しない。
- migrationは使い捨てPostgreSQLで冪等性・同時実行・旧schemaからの更新を検証し、本番DBをテスト対象にしない。

特に設定値と公開URLは一箇所で解決する。callback、canonical、OGP、README、デプロイ先の既定値が別ホストを指さないよう、環境変数未設定時の認証経路をテストする。

## 安全なリファクタリング順序

1. 既存HTTP、repository、外部client、frontendのcharacterization/contract testを追加する。
2. 副作用のない関数を移動し、入出力を変えずにDomain/Applicationへ整理する。
3. 外部DTOとDB rowのmapper、狭いportを導入する。
4. routeにある業務計算をApplicationのuse caseへ移す。
5. config/bootstrap/realtimeを必要な範囲だけ分割する。
6. 禁止importの静的チェック、関連テスト、全テスト、`node --check`、`git diff --check`、必要な性能・ブラウザ確認を行う。

一つの変更で層の再設計、仕様変更、性能改善、UI刷新を同時に行わない。PRは一つの責務に絞り、無関係なdirty worktreeの変更を巻き込まない。

## 実装・レビューのチェックリスト

- 変更ファイルを責務表へ分類し、依存グラフを先に描いたか。
- Domain/ApplicationからInfrastructure/Presentationへのimportがないか。
- InfrastructureからApplicationを呼んでいないか。
- DB schema、GraphQL field、HTTP DTOが境界を越えていないか。
- optional collaboratorで本番とpreviewの意味が暗黙に変わっていないか。
- transaction、lock、cache、retry、並行実行時の順序が保たれているか。
- session/cookie/callback/公開URLの設定が同じ公開ホストを指すか。
- home/cardが共通registry/runtimeを使い、言語分岐を複製していないか。
- 純粋関数、外部client、repository、routeの各テストが適切な境界を検証しているか。
- アーキテクチャ上の非自明な制約には「何をするか」ではなく「なぜ必要か」を日本語コメントで残したか。

## アーキテクチャレビューの出力

結論では、(1)現在の構成分類、(2)良い点、(3)具体的な境界違反、(4)互換性リスク、(5)段階的な修正順、(6)テスト・計測による証拠、(7)未検証事項を日本語で示す。「Clean Architecture準拠」と断定せず、レイヤード・モジュラーモノリスとしての達成度と残課題を分けて書く。

## 対象外

規模・運用リスクの根拠なしに、マイクロサービス、イベントバス、DIコンテナ、全関数へのRepository抽象化、全面的なClean Architecture移行、frontend/backendの別リポジトリ化を導入しない。必要になった場合は、性能・変更頻度・チーム境界・障害分離などの根拠を先に記録する。
