# コントリビューションガイド / Contributing

GitHub Planetへの改善提案や修正を歓迎します。変更の目的と確認方法をPull Requestに書いてください。
Contributions are welcome. Please describe the purpose and verification for each pull request.

## 開発環境 / Development environment

- Node.js 24.22.x（package.jsonの指定範囲）
- PostgreSQLを含む全機能を動かす場合はDocker Composeを使えます。
- Node.js 24.22.x as declared in package.json.
- Use Docker Compose for the full application with PostgreSQL.

```bash
npm ci
docker compose up --build
```

アプリは http://localhost:3000 で開きます。DBなしで固定ショーケースを確認する手順はREADMEの「DBなしでショーケースだけ確認する場合」を参照してください。
Open http://localhost:3000. For the database-free showcase setup, follow the section with that name in README.md.

## 変更を提案する / Proposing a change

1. 既存のIssueとPull Requestを検索し、関連するものがあれば目的を共有してください。
2. 変更理由を1つに絞り、必要な実装・ドキュメント・テストだけを含めてください。
3. 画面に表示する文言を変える場合は、日本語と英語の両方を確認してください。
4. 秘密情報、個人情報、本番データをコミットしないでください。認証情報には環境変数を使ってください。
5. 変更に近いテストを実行し、PRにコマンドと結果を書いてください。画面変更には再現手順やスクリーンショットも役立ちます。
6. PRには目的、動作への影響、未確認の点を書いてください。

1. Search existing issues and pull requests before starting.
2. Keep each pull request focused on one reason for change.
3. Update both Japanese and English when changing user-facing text.
4. Never commit secrets, personal information, or production data. Use environment variables for credentials.
5. Run the relevant tests and report commands and results in your pull request. Reproduction steps or screenshots help reviewers with UI changes.
6. Describe the purpose, user-visible impact, and any unverified behavior.

## 主なコマンド / Useful commands

npm test runs the Node.js test suite. npm start starts the application. Do not include real OAuth credentials or database URLs in examples or screenshots.

## ライセンス / License

コードはMIT Licenseのもとで公開されています。貢献する場合は、あなたがその変更を提出する権利を持つことを確認してください。
The code is distributed under the MIT License. By contributing, confirm that you have the right to submit your changes.
