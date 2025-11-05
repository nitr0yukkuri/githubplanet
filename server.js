// server.js (★ ローカル/本番 自動切り替え対応版 ★)

// 1. インポート
import express from 'express';
import session from 'express-session';
import crypto from 'crypto';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

// 2. Express の初期化
const app = express();
const port = process.env.PORT || 3000;

// ★★★ GitHub OAuth App 設定の自動切り替え ★★★
// NODE_ENV が 'production' なら本番用、それ以外ならローカル用の設定を使います
const isProduction = process.env.NODE_ENV === 'production';

let GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, CALLBACK_URL;

if (isProduction) {
    // --- 本番環境 (Render) 用の設定 ---
    console.log('★ 本番環境(Render)の設定を使用します');
    GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || 'Ov23lij7ExiRQ0SunKG9'; // 画像にあった新しいID
    GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || 'c6d39664a728fe06d2272028ea4adbe81e39a5b5'; // 画像にあった新しいSecret
    CALLBACK_URL = process.env.CALLBACK_URL || 'https://githubplanet.onrender.com/callback';
} else {
    // --- ローカル環境 (localhost) 用の設定 ---
    console.log('★ ローカル環境の設定を使用します');
    GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID_LOCAL || 'Ov23liiff1uvGf1ThXkI'; // 以前の古いID
    GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET_LOCAL || '601f033befdb67ee00c019d5f7368c0eaf94d0e2'; // 以前の古いSecret
    CALLBACK_URL = 'http://localhost:3000/callback';
}
// ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★


// ★★★ Render PostgreSQL への接続設定 ★★★
const connectionString = process.env.DATABASE_URL;
let pool;
if (connectionString) {
    pool = new pg.Pool({
        connectionString: connectionString,
        ssl: { rejectUnauthorized: false }
    });
}

// --- ESModuleで __dirname を再現 ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use('/front', express.static(path.join(__dirname, 'front')));

if (isProduction) {
    app.set('trust proxy', 1);
}

// 3. セッションの設定
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-very-secret-key-change-it',
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: isProduction, // 本番環境のみ true
        httpOnly: true,
        sameSite: 'lax'
    }
}));

// (PKCEヘルパー関数)
function base64URLEncode(str) {
    return str.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
function sha256(buffer) {
    return crypto.createHash('sha256').update(buffer).digest();
}

// --- ルート定義 ---
app.get('/', (req, res) => {
    console.log('index.html を提供します');
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- 4. /login エンドポイント ---
app.get('/login', (req, res) => {
    console.log('GitHubログインリクエストを受け取りました');
    const code_verifier = base64URLEncode(crypto.randomBytes(32));
    req.session.code_verifier = code_verifier;
    const code_challenge = base64URLEncode(sha256(code_verifier));

    const authUrl = new URL('https://github.com/login/oauth/authorize');
    authUrl.searchParams.set('client_id', GITHUB_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', CALLBACK_URL);
    // デプロイ権限を追加
    authUrl.searchParams.set('scope', 'user:email public_repo repo_deployment');
    authUrl.searchParams.set('state', crypto.randomBytes(16).toString('hex'));
    authUrl.searchParams.set('code_challenge', code_challenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');

    console.log(`GitHub認証ページにリダイレクトします (Production: ${isProduction})`);
    res.redirect(authUrl.href);
});

// --- 5. /callback エンドポイント ---
app.get('/callback', async (req, res) => {
    console.log('/callback が呼ばれました');
    const { code } = req.query;
    const { code_verifier } = req.session;

    if (!code) return res.status(400).send('codeがありません');
    if (!code_verifier) return res.status(400).send('code_verifierがセッションにありません');

    try {
        // アクセストークン取得
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

        // ユーザー情報取得
        const userResponse = await axios.get('https://api.github.com/user', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const user = userResponse.data;
        console.log('ようこそ,', user.login);

        // リポジトリ情報取得
        const reposResponse = await axios.get(user.repos_url + '?per_page=100', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const repos = reposResponse.data;

        // 集計処理
        const languageStats = {};
        let totalCommits = 0;

        await Promise.all(repos.map(async (repo) => {
            if (repo.fork) return;

            // 言語データ
            if (repo.languages_url) {
                try {
                    const langRes = await axios.get(repo.languages_url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
                    for (const [lang, bytes] of Object.entries(langRes.data)) {
                        languageStats[lang] = (languageStats[lang] || 0) + bytes;
                    }
                } catch (e) { /* 無視 */ }
            }
            // コミット数
            try {
                const commitsRes = await axios.get(`https://api.github.com/repos/${user.login}/${repo.name}/commits?author=${user.login}&per_page=100`, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                totalCommits += commitsRes.data.length;
            } catch (e) { /* 無視 */ }
        }));

        // メイン言語決定
        let mainLanguage = 'Unknown';
        let maxBytes = 0;
        for (const [lang, bytes] of Object.entries(languageStats)) {
            if (bytes > maxBytes) { maxBytes = bytes; mainLanguage = lang; }
        }

        // 惑星の色とサイズ
        const colors = { JavaScript: '#f0db4f', TypeScript: '#007acc', Python: '#306998', HTML: '#e34c26', CSS: '#563d7c', Ruby: '#CC342D' };
        const planetColor = colors[mainLanguage] || '#808080';
        let planetSizeFactor = 1.0 + Math.min(1.0, Math.log10(totalCommits + 1) / Math.log10(500));
        planetSizeFactor = parseFloat(planetSizeFactor.toFixed(2));
        if (totalCommits === 0) planetSizeFactor = 1.0;

        // セッション保存
        req.session.planetData = {
            user: user,
            github_token: accessToken,
            planetData: { mainLanguage, planetColor, languageStats, totalCommits, planetSizeFactor }
        };

        // DB保存 (接続がある場合のみ)
        if (pool) {
            try {
                await pool.query(`
                    INSERT INTO planets (github_id, username, planet_color, planet_size_factor, main_language, last_updated)
                    VALUES ($1, $2, $3, $4, $5, NOW())
                    ON CONFLICT (github_id) DO UPDATE SET 
                        username = $2, planet_color = $3, planet_size_factor = $4, main_language = $5, last_updated = NOW()
                `, [user.id, user.login, planetColor, planetSizeFactor, mainLanguage]);
                console.log(`[DB] ${user.login} のデータを保存しました`);
            } catch (e) {
                console.error('[DB] 保存エラー:', e.message);
            }
        }

        res.redirect('/');

    } catch (error) {
        console.error('認証エラー:', error.response ? error.response.data : error.message);
        res.status(500).send('認証中にエラーが発生しました');
    }
});

// --- API エンドポイント ---
app.get('/api/me', (req, res) => {
    req.session.planetData ? res.json(req.session.planetData) : res.status(401).json({ error: 'Not authenticated' });
});

app.get('/api/planets/random', async (req, res) => {
    if (!pool) return res.status(503).json({ error: 'DB未接続' });
    try {
        const result = await pool.query('SELECT username, planet_color, planet_size_factor, main_language FROM planets ORDER BY RANDOM() LIMIT 1');
        result.rows.length > 0 ? res.json(result.rows[0]) : res.status(404).json({ error: 'データなし' });
    } catch (e) {
        res.status(500).json({ error: '取得エラー' });
    }
});

// --- サーバー起動 ---
app.listen(port, () => {
    console.log(`サーバーがポート ${port} で起動しました`);
});