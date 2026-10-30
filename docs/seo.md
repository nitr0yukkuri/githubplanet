# 公開ページのSEO

公開対象はホームと言語別ショーケースの日英ページです。`server.js`から渡すショーケース一覧を、HTML内の案内リンク・ページのメタデータ・サイトマップで共用します。DBやGitHub APIに接続せず、初期HTMLだけで説明、見出し、言語間リンクを読めます。

HTMLテンプレートとfaviconは起動時にメモリへ読み込み、ページ配信中の同期ファイル読み込みを避けます。ローカルでHTMLを編集した場合もサーバーを再起動してください。公開エイリアスの転送先はサーバーの公開一覧から選び、設定済みoriginと一致するURLに限定します。

2026年10月26日の本番HTTP確認では、ショーケースにもホームと同じtitle・canonicalが返り、存在しない`/showcase/not-a-planet`も200でした。サイトマップはホームの日英2件のみでした。この修正ではmainに実在する13種類のサンプルとホームの計28URLを公開対象にします。

## URLと検索対象

- `/`、`/en`、`/showcase/:slug`、`/en/showcase/:slug`に固有のtitle・description・canonical・相互hreflangを返します。
- `/english`、末尾スラッシュ、`/index.html`、`?showcase=`の公開エイリアスを301で統一します。`/demo`は表示モードを維持するため転送せずnoindexにします。
- 大文字小文字を区別しないExpressの照合に合わせ、`/EN/SHOWCASE/GO`も`/en/showcase/go`へ統一します。管理・API経路の大文字表記もnoindexです。
- 存在しないショーケースはHTMLページも404です。未知の言語名をTypeScriptのページとして検索登録しません。
- カード、設定、実績、sender、認証経路、API、プレビューには`X-Robots-Tag: noindex, follow`を返します。robots.txtではJavaScript・CSS・画像を遮断せず、クローラーがnoindex指示も取得できるようにします。
- サイトマップには上記の公開URLだけを列挙し、日英・x-defaultの対応を付けます。実際の更新日を追跡していないためlastmodを捏造しません。
- 個人カードにはユーザー名や署名・撮影時刻によるURLが多数あるため、検索流入先として公開一覧へ混ぜません。カードの共有・撮影・アクセス制御は維持します。

## 説明と共有画像

ページの左下にある説明は通常の`details`要素で開けます。検索エンジン専用の隠し文章ではなく、初めて訪れた人がサービスやサンプルについて確認し、別の言語へ移動するための案内です。サンプルを実在ユーザーの活動データと誤認しない説明も含めます。

WebSite・WebApplication／WebPageのJSON-LDにはページと一致する事実だけを書き、未取得の評価・レビュー・受賞歴を追加しません。構造化データは検索順位やリッチリザルトを保証するものではありません。

ショーケースには画面に見えるパンくずと同じ2階層のBreadcrumbListを付けます。WebSiteには既存の表記揺れであるGitHubPlanetも別名として記録します。操作パネルは`data-nosnippet`とし、一時的な活動数や操作ボタンの文言よりサービスの説明が検索スニペットの候補になるようにします。この指定はインデックス登録を止めるものではありません。

OGP／Xの画像は既存ロゴから生成した`front/img/social-preview.png`（1200×630）です。変更するときはChromeと開発依存を用意して`node scripts/generate-social-preview.mjs`を実行します。

同じ生成コマンドで、検索結果用の96px faviconも出力します。初回ホームの3D起動タイミングや案内画像の軽量化は別のPRで管理します。

## 検証

```sh
node --test test/page-seo.test.js test/server.characterization.test.js test/page-routes-card-url.test.js
node scripts/audit-seo-browser.mjs
npm test
```

ブラウザー監査はDBなしのローカルサーバーを一時起動し、JavaScript無効時の説明、実行前後のtitle/canonical、言語リンク、320px・390pxの表示、XMLとしてのサイトマップを確認します。Chromeが必要です。スクリーンショットはGit管理外の`artifacts/seo/`へ保存します。

HTTPテストではサイトマップの28URLをすべて取得し、転送なしの200、自己canonical、固有のtitle・descriptionを検証します。Googlebot・bingbot・Twitterbotと通常ブラウザーに同じHTMLを返すこと、Accept-Languageで公開URLの言語を変更しないことも確認します。

## 追加監査の結果（2026年10月26日）

Lighthouse SEO 100は、インデックス登録、検索クエリとの適合性、Googleが選ぶcanonical、検索順位の確認結果ではありません。追加監査では点数と別に、HTTP・本文・配信元・運用を点検しました。

| 観点 | 確認結果と対応 |
| --- | --- |
| 大文字の公開URL | 修正前のPRでも`/EN`は日本語200、`/SHOWCASE/unknown`はホームの200でした。正規URLへの301と不明な言語の404を回帰テストで固定しました。 |
| 検索除外の抜け | `/SENDER`などがnoindex指定を回避していました。ルートとSEO処理の照合を揃えました。 |
| 本文の正確性 | Kotlinは結晶のきらめきだけを説明し、主要な放電・火花の説明が抜けていました。固定サンプル名と描画コードを確認し、日英の本文・description・JSON-LDに反映しました。 |
| ページ間の重複 | 28URLの固有title・description・自己canonicalを一括検証しました。公開一覧・サイトマップ・日英リンクの参照元も共通です。 |
| クローラーと利用者の同等性 | User-AgentやAccept-Languageで別のSEO本文を返しません。実際のGoogleのレンダリング結果は本番反映後のURL検査で別途確認します。 |
| 配信中の本番 | PR未反映の本番は旧title・canonicalのままで、`/EN/SHOWCASE/GO`もホームのcanonicalを返しました。PRのローカル点数を本番の状態として扱いません。 |
| robots・HTTPステータス | 本番のrobots.txtとsitemap.xmlは200、通常の不明URLは404でした。本番の大文字senderにはnoindexがありません。 |
| 実際の検索成績 | 接続されたSearch Consoleのデータは取得していません。公開検索で外部の紹介記事が見つかっても、自サイトの未登録や登録数を断定する材料にはしません。 |
| 内容と被リンク | まず実装済み機能に合った説明と実際に使えるサンプルを提供します。架空のFAQ・評価・被リンクや、同じ本文の大量ページを追加しません。 |

検索流入の評価では、指名検索（GitHub Planet / GitHubPlanet）と用途検索（GitHubの活動の可視化、プロフィールカードなど）を分けます。順位を推測して文章を増やすのではなく、Search Consoleの実クエリ・表示回数・クリック率と照合して、説明不足のページを更新してください。

分割前に実施したLighthouseでは、ホームと英語TypeScriptショーケースのSEOがいずれも100でした。検索用ページの変更はHTTPテストとブラウザー監査でも検証します。初回表示の速度計測は起動処理を変更する別PRの記録を参照してください。

## マージ・デプロイ後に確認すること

1. 本番の`robots.txt`・`sitemap.xml`・日英ショーケースが、PRと同じHTMLとHTTPステータスを返すことを確認する。
2. Google Search Consoleで`githubplanet.dev`の所有権を確認し、`https://githubplanet.dev/sitemap.xml`を送信する。既に送信済みなら取得状況を確認する。
3. URL検査でホームとショーケースの日英ページを確認し、Googleが選択したcanonical、クロール、レンダリング後HTMLを確認する。
4. インデックス登録の推移、検索クエリとクリック率、実ユーザーのCore Web Vitalsを継続して見る。Lighthouseのローカル結果だけで実ユーザーの速度や検索順位を断定しない。

Search Consoleの所有権確認コード、アクセス権、実ユーザー計測データはこのリポジトリには含めません。新しい本番URLを使う場合は`PUBLIC_BASE_URL`を一箇所で設定し、canonical・OGP・サイトマップが同じホストへ向くことを確認します。

参考: [JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)、[canonical](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)、[言語別ページ](https://developers.google.com/search/docs/specialty/international/localized-versions)、[構造化データの指針](https://developers.google.com/search/docs/appearance/structured-data/sd-policies)、[URLの大文字小文字](https://developers.google.com/search/docs/crawling-indexing/url-structure)、[検索スニペット](https://developers.google.com/search/docs/appearance/snippet)、[パンくず](https://developers.google.com/search/docs/appearance/structured-data/breadcrumb)、[サイト名](https://developers.google.com/search/docs/appearance/site-names)。
