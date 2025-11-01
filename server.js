// server.js (Supabase不要版 - ★ GitHub API連携強化版 ★)

// 1. インポート
import express from 'express';
import session from 'express-session';
import crypto from 'crypto';
import axios from 'axios';

// 2. Express の初期化
const app = express();
const port = 3000;

// ★★★ GitHub OAuth App の設定 ★★★
const GITHUB_CLIENT_ID = 'Ov23lil0pJoHtaeAvXrk'; // ★ 修正してください ★
const GITHUB_CLIENT_SECRET = '0af8d9d749f799e2c1705e833fdc6930badeda24'; // ★ 修正してください ★
const CALLBACK_URL = 'http://localhost:3000/callback';

// 3. セッションの設定
app.use(session({
    secret: 'your-very-secret-key-change-it',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

// (PKCEヘルパー関数 - 変更なし)
function base64URLEncode(str) {
    return str.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
function sha256(buffer) {
    return crypto.createHash('sha256').update(buffer).digest();
}

// --- 4. /login エンドポイント (変更なし) ---
app.get('/login', (req, res) => {
    console.log('GitHubログインリクエストを受け取りました');
    const code_verifier = base64URLEncode(crypto.randomBytes(32));
    req.session.code_verifier = code_verifier;
    const code_challenge = base64URLEncode(sha256(code_verifier));
    const authUrl = new URL('https://github.com/login/oauth/authorize');
    authUrl.searchParams.set('client_id', GITHUB_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', CALLBACK_URL);

    // ★★★ 修正点 1: スコープに 'repo' を追加 ★★★
    // (言語データを取得するためにリポジトリ一覧へのアクセス許可をもらう)
    authUrl.searchParams.set('scope', 'user:email public_repo'); // public_repo または repo

    authUrl.searchParams.set('state', crypto.randomBytes(16).toString('hex'));
    authUrl.searchParams.set('code_challenge', code_challenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');

    console.log('GitHub認証ページにリダイレクトします:', authUrl.href);
    res.redirect(authUrl.href);
});

// --- 5. /callback エンドポイント (★ API連携を追加 ★) ---
app.get('/callback', async (req, res) => {
    console.log('/callback が呼ばれました');

    const { code } = req.query;
    const { code_verifier } = req.session;

    if (!code) return res.status(400).send('codeがありません');
    if (!code_verifier) return res.status(400).send('code_verifierがセッションにありません');

    console.log('受け取ったコード:', code);

    try {
        // 3. アクセストークンと交換 (変更なし)
        const tokenResponse = await axios.post(
            'https://github.com/login/oauth/access_token',
            {
                client_id: GITHUB_CLIENT_ID,
                client_secret: GITHUB_CLIENT_SECRET,
                code: code,
                redirect_uri: CALLBACK_URL,
                code_verifier: code_verifier
            },
            { headers: { 'Accept': 'application/json' } }
        );

        const accessToken = tokenResponse.data.access_token;
        if (!accessToken) throw new Error('アクセストークンが取得できませんでした');

        console.log('アクセストークン取得成功！');

        // 4. ユーザー情報を取得 (変更なし)
        const userResponse = await axios.get('https://api.github.com/user', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const user = userResponse.data;
        console.log('ようこそ,', user.login);

        // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
        // ★ 修正点 2: ここからが「github惑星」のデータ分析 ★
        // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★

        // 5. ユーザーのリポジトリ一覧を取得
        const reposResponse = await axios.get(user.repos_url, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const repos = reposResponse.data;

        // 6. 全リポジトリの言語データを集計
        const languageStats = {};

        // (APIリクエストを並列で実行)
        await Promise.all(repos.map(async (repo) => {
            if (repo.fork || !repo.languages_url) return; // フォークは除外

            try {
                const langResponse = await axios.get(repo.languages_url, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                const languages = langResponse.data;

                // 言語ごとのバイト数を集計
                for (const [lang, bytes] of Object.entries(languages)) {
                    languageStats[lang] = (languageStats[lang] || 0) + bytes;
                }
            } catch (langError) {
                console.error(`リポジトリ ${repo.name} の言語取得エラー:`, langError.message);
            }
        }));

        // 7. 最も使われている言語を特定
        let mainLanguage = 'Unknown';
        let maxBytes = 0;
        for (const [lang, bytes] of Object.entries(languageStats)) {
            if (bytes > maxBytes) {
                maxBytes = bytes;
                mainLanguage = lang;
            }
        }
        console.log('メイン言語:', mainLanguage, `(${maxBytes} bytes)`);

        // 8. 言語に応じて惑星の色を決定 (このロジックは自由に拡張してください)
        let planetColor = '#808080'; // デフォルトはグレー
        if (mainLanguage === 'JavaScript') planetColor = '#f0db4f'; // 黄色
        if (mainLanguage === 'TypeScript') planetColor = '#007acc'; // 青
        if (mainLanguage === 'Python') planetColor = '#306998'; // 濃い青
        if (mainLanguage === 'HTML') planetColor = '#e34c26'; // オレンジ
        if (mainLanguage === 'CSS') planetColor = '#563d7c'; // 紫
        if (mainLanguage === 'Ruby') planetColor = '#CC342D'; // 赤
        // ... 他の言語 ...

        // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
        // ★ 修正点 3: 最終レスポンスに惑星データを追加 ★
        // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
        res.json({
            message: 'ログイン成功！ (Supabase不要版)',
            user: user,
            github_token: accessToken,
            planetData: {
                mainLanguage: mainLanguage,
                planetColor: planetColor,
                languageStats: languageStats // (デバッグ用に全データも渡す)
            }
        });

    } catch (error) {
        console.error('認証エラー:', error.response ? error.response.data : error.message);
        res.status(500).send('認証中にエラーが発生しました');
    }
});


// --- 6. サーバー起動 (変更なし) ---
app.listen(port, () => {
    console.log(`サーバーが http://localhost:${port} で起動しました`);
});