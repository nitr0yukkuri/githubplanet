// server.js (★ Webページ提供機能 + API機能 ★)

// 1. インポート
import express from 'express';
import session from 'express-session';
import crypto from 'crypto';
import axios from 'axios';
import path from 'path'; // ★ ファイルパスを扱うために追加
import { fileURLToPath } from 'url'; // ★ import.meta.url を使うために追加

// 2. Express の初期化
const app = express();
// ★ 変更点 1: ポートを環境変数に対応
const port = process.env.PORT || 3000;

// ★★★ GitHub OAuth App の設定 ★★★
// (unkoブランチのIDとSecretをそのまま使います)
const GITHUB_CLIENT_ID = 'Ov23lil0pJoHtaeAvXrk';
// ★ 変更点 2: SecretはRenderの環境変数から読み込む
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || '0af8d9d749f799e2c1705e833fdc6930badeda24';
// ★ 変更点 3: コールバックURLを環境変数から取得
const CALLBACK_URL = process.env.CALLBACK_URL || 'http://localhost:3000/callback';

// --- ESModuleで __dirname を再現 ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ★ 変更点 4: Render (HTTPS) でセッションを動作させる設定
// 本番環境 (Render) の場合、プロキシを信頼する設定
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

// 3. セッションの設定
app.use(session({
    secret: 'your-very-secret-key-change-it', // (ここは後で変えてもOK)
    resave: false,
    saveUninitialized: true,
    // ★ 変更点 5: 本番環境 (HTTPS) では secure: true にする
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'lax'
    }
}));

// (PKCEヘルパー関数 - 変更なし)
function base64URLEncode(str) {
    return str.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
function sha256(buffer) {
    return crypto.createHash('sha256').update(buffer).digest();
}

// ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
// ★ フロントエンド (HTML / JS) の提供
// ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★

// ルートURL (/) にアクセスが来たら index.html を返す
app.get('/', (req, res) => {
    // コンソールログを追加して、提供していることを確認
    console.log('index.html を提供します');
    res.sendFile(path.join(__dirname, 'index.html'));
});

// /client.js へのアクセスが来たら client.js を返す
app.get('/client.js', (req, res) => {
    // コンソールログを追加
    console.log('client.js を提供します');
    res.sendFile(path.join(__dirname, 'client.js'));
});

// --- 4. /login エンドポイント (変更なし) ---
app.get('/login', (req, res) => {
    console.log('GitHubログインリクエストを受け取りました');
    const code_verifier = base64URLEncode(crypto.randomBytes(32));
    req.session.code_verifier = code_verifier; // セッションに保存
    const code_challenge = base64URLEncode(sha256(code_verifier));

    const authUrl = new URL('https://github.com/login/oauth/authorize');
    authUrl.searchParams.set('client_id', GITHUB_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', CALLBACK_URL);
    authUrl.searchParams.set('scope', 'user:email public_repo'); // ★ 惑星データ取得に必要なスコープ
    authUrl.searchParams.set('state', crypto.randomBytes(16).toString('hex'));
    authUrl.searchParams.set('code_challenge', code_challenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');

    console.log('GitHub認証ページにリダイレクトします:', authUrl.href);
    res.redirect(authUrl.href);
});

// --- 5. /callback エンドポイント (★ 惑星データ生成＆保存 ★) ---
app.get('/callback', async (req, res) => {
    console.log('/callback が呼ばれました');
    const { code } = req.query;
    const { code_verifier } = req.session; // セッションから取得

    if (!code) return res.status(400).send('codeがありません');
    if (!code_verifier) return res.status(400).send('code_verifierがセッションにありません');

    console.log('受け取ったコード:', code);

    try {
        // 3. アクセストークンと交換
        const tokenResponse = await axios.post(
            'https://github.com/login/oauth/access_token',
            {
                client_id: GITHUB_CLIENT_ID,
                client_secret: GITHUB_CLIENT_SECRET,
                code: code,
                redirect_uri: CALLBACK_URL,
                code_verifier: code_verifier // ★ PKCE検証キーを送信
            },
            { headers: { 'Accept': 'application/json' } }
        );
        const accessToken = tokenResponse.data.access_token;
        if (!accessToken) throw new Error('アクセストークンが取得できませんでした');
        console.log('アクセストークン取得成功！');

        // 4. ユーザー情報取得
        const userResponse = await axios.get('https://api.github.com/user', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const user = userResponse.data;
        console.log('ようこそ,', user.login);

        // 5. リポジトリ一覧を取得
        const reposResponse = await axios.get(user.repos_url, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const repos = reposResponse.data;

        // 6. 言語データを集計
        const languageStats = {};
        await Promise.all(repos.map(async (repo) => {
            if (repo.fork || !repo.languages_url) return; // フォークは除外
            try {
                const langResponse = await axios.get(repo.languages_url, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                const languages = langResponse.data;
                for (const [lang, bytes] of Object.entries(languages)) {
                    languageStats[lang] = (languageStats[lang] || 0) + bytes;
                }
            } catch (langError) { /* 取得失敗したリポジトリはスキップ */ }
        }));

        // 7. メイン言語を特定
        let mainLanguage = 'Unknown';
        let maxBytes = 0;
        for (const [lang, bytes] of Object.entries(languageStats)) {
            if (bytes > maxBytes) {
                maxBytes = bytes;
                mainLanguage = lang;
            }
        }
        console.log('メイン言語:', mainLanguage);

        // 8. 惑星の色を決定
        let planetColor = '#808080'; // デフォルト
        if (mainLanguage === 'JavaScript') planetColor = '#f0db4f';
        if (mainLanguage === 'TypeScript') planetColor = '#007acc';
        if (mainLanguage === 'Python') planetColor = '#306998';
        if (mainLanguage === 'HTML') planetColor = '#e34c26';
        if (mainLanguage === 'CSS') planetColor = '#563d7c';
        if (mainLanguage === 'Ruby') planetColor = '#CC342D';
        // ... 他の言語 ...

        // 9. ★ データをセッションに保存 ★
        req.session.planetData = {
            user: user,
            github_token: accessToken, // トークンも保存
            planetData: {
                mainLanguage: mainLanguage,
                planetColor: planetColor,
                languageStats: languageStats
            }
        };

        // 10. ★ JSONを返す代わりにホームページ(/)にリダイレクト ★
        console.log('惑星データ生成完了。/ (ルート) にリダイレクトします。');
        res.redirect('/');

    } catch (error) {
        console.error('認証エラー:', error.response ? error.response.data : error.message);
        res.status(500).send('認証中にエラーが発生しました');
    }
});

// ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
// ★ 修正点 4: 惑星データを返すAPIエンドポイントを追加
// ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
app.get('/api/me', (req, res) => {
    if (req.session.planetData) {
        // セッションに惑星データがあれば、それをJSONで返す
        console.log('/api/me が呼ばれました。セッションデータを返します。');
        res.json(req.session.planetData);
    } else {
        // セッションが切れているか、未ログイン
        console.log('/api/me が呼ばれました。認証されていません (401)。');
        res.status(401).json({ error: 'Not authenticated' });
    }
});


// --- 6. サーバー起動 ---
app.listen(port, () => {
    // ★ 変更点 6: ログのポート番号を修正
    console.log(`サーバーが ポート ${port} で起動しました`);
});