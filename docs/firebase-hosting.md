# Firebase HostingからCloud Runへの転送

`firebase.json`は全パスを同じプロジェクトの`githubplanet-git`（`asia-northeast2`）へ転送する。静的HTMLの別コピーは配信せず、Cloud Run側のAPI・CSP・OAuth設定を使う。

## コードで確認したこと

- 本番のセッションCookieは`__session`。Hostingが他のCookieを除去してもOAuthのstateとPKCE verifierを保持する。
- `e2e/firebase-session-proxy.test.js`はローカルのHTTPプロキシでCookie除去と転送ヘッダーを再現し、`/en/login`→`/callback`→`/api/me`を実行する。GitHub・本番DBには接続しない。
- canonical redirectは転送元の公開ホストを使用し、Cloud Runの内部ホストへ戻すループを起こさない。

```sh
node --test e2e/firebase-session-proxy.test.js test/firebase-hosting-session.test.js test/canonical-host-redirect.test.js
```

## 実配信前の確認

このPRはHostingやDNSを変更しない。ローカルのプロキシ試験は、実際のFirebaseプロジェクトの有効化・権限・配信確認の代わりにはならない。

1. `.firebaserc`のプロジェクト`gen-lang-client-0068654703`でFirebase Hostingが利用でき、転送先Cloud Runサービスを参照できることを確認する。API有効化や課金設定は別の運用作業として扱う。
2. `PUBLIC_BASE_URL`、`CALLBACK_URL`、GitHub OAuth Appのcallback URLを同じ公開ホストへ合わせる。Cloud Run URLやプレビューURLだけを開いても、公開ホストへのredirectを通る設定になっている。
3. 承認された配信作業でHosting設定を公開した後、実際の公開ホストでホーム、英語ページ、カード、言語ショーケース、静的モジュールの200応答とCSPを確認する。
4. GitHubログインからの復帰、認証済みAPI、ログアウトを確認する。CookieはSecure・HttpOnly・SameSite=Laxを保つ。
5. 流星の接続先が既存のCloud Run向け設定を維持し、実際のブラウザでSocket.IOの接続と通知を確認する。HTTPのrewrite試験だけではWebSocket接続を保証できない。

Hostingには60秒のリクエストタイムアウトがあるため、それを超える同期処理をこの経路の成功条件にしない。

公式資料: [Cloud Runへのrewrite](https://firebase.google.com/docs/hosting/cloud-run)、[動的コンテンツとCookie](https://firebase.google.com/docs/hosting/manage-cache#using_cookies)。
