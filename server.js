// server.js (★ Webページ提供機能 + API機能 ★)

// 1. インポート
import express from 'express';
import session from 'express-session';
import crypto from 'crypto';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';
// ★★★ 最小限の変更点: 'pg' (PostgreSQLライブラリ) をインポート ★★★
import pg from 'pg';

// 2. Express の初期化
const app = express();
const port = process.env.PORT || 3000;

// ★★★ GitHub OAuth App の設定 ★★★
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || 'Ov23liiff1uvGf1ThXkI';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || '601f033befdb67ee00c019d5f7368c0eaf94d0e2';
const CALLBACK_URL = process.env.CALLBACK_URL || 'http://localhost:3000/callback';

// ★★★ 最小限の変更点: Render PostgreSQL への接続設定 ★★★
// (Render が提供する DATABASE_URL (Internal) を環境変数に設定してください)
const connectionString = process.env.DATABASE_URL;
// DB接続設定が存在する場合のみプールを作成（ローカル等でのエラー回避のため）
let pool;
if (connectionString) {
    pool = new pg.Pool({
        connectionString: connectionString,
        // Render の DB には SSL 接続が必要
        ssl: {
            rejectUnauthorized: false
        }
    });
}
// ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★


// --- ESModuleで __dirname を再現 ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use('/front', express.static(path.join(__dirname, 'front')));

if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

// 3. セッションの設定
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-very-secret-key-change-it',
    resave: false,
    saveUninitialized: true,
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
    // ★★★ 変更点: repo_deployment スコープを追加 ★★★
    authUrl.searchParams.set('scope', 'user:email public_repo repo_deployment');
    // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
    authUrl.searchParams.set('state', crypto.randomBytes(16).toString('hex'));
    authUrl.searchParams.set('code_challenge', code_challenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');

    console.log('GitHub認証ページにリダイレクトします:', authUrl.href);
    res.redirect(authUrl.href);
});

// --- 5. /callback エンドポイント (★ 惑星データ生成＆DB保存 ★) ---
app.get('/callback', async (req, res) => {
    console.log('/callback が呼ばれました');
    const { code } = req.query;
    const { code_verifier } = req.session;

    if (!code) return res.status(400).send('codeがありません');
    if (!code_verifier) return res.status(400).send('code_verifierがセッションにありません');

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

        // 4. ユーザー情報取得 (変更なし)
        const userResponse = await axios.get('https://api.github.com/user', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const user = userResponse.data;
        console.log('ようこそ,', user.login);

        // 5. リポジトリ一覧を取得 (変更なし)
        const reposResponse = await axios.get(user.repos_url + '?per_page=100', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const repos = reposResponse.data;

        // 6. 言語データとコミット数を集計 (変更なし)
        const languageStats = {};
        let totalCommits = 0;
        await Promise.all(repos.map(async (repo) => {
            if (repo.fork || !repo.languages_url) return;
            try {
                const langResponse = await axios.get(repo.languages_url, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                const languages = langResponse.data;
                for (const [lang, bytes] of Object.entries(languages)) {
                    languageStats[lang] = (languageStats[lang] || 0) + bytes;
                }
            } catch (langError) { /* スキップ */ }
            try {
                const commitsUrl = `https://api.github.com/repos/${user.login}/${repo.name}/commits?author=${user.login}&per_page=100`;
                const commitResponse = await axios.get(commitsUrl, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                const commitsCount = commitResponse.data.length;
                totalCommits += commitsCount;
            } catch (commitError) { /* スキップ */ }
        }));
        console.log('総コミット数 (近似値):', totalCommits);

        // 7. メイン言語を特定 (変更なし)
        let mainLanguage = 'Unknown';
        let maxBytes = 0;
        for (const [lang, bytes] of Object.entries(languageStats)) {
            if (bytes > maxBytes) {
                maxBytes = bytes;
                mainLanguage = lang;
            }
        }
        console.log('メイン言語:', mainLanguage);

        // 8. 惑星の色とサイズを決定 (変更なし)
        let planetColor = '#808080';
        if (mainLanguage === 'JavaScript') planetColor = '#f0db4f';
        if (mainLanguage === 'TypeScript') planetColor = '#007acc';
        if (mainLanguage === 'Python') planetColor = '#306998';
        if (mainLanguage === 'HTML') planetColor = '#e34c26';
        if (mainLanguage === 'CSS') planetColor = '#563d7c';
        if (mainLanguage === 'Ruby') planetColor = '#CC342D';

        const baseSize = 1.0;
        const maxCommitsScale = 500;
        let planetSizeFactor = baseSize + Math.min(1.0, Math.log10(totalCommits + 1) / Math.log10(maxCommitsScale));
        planetSizeFactor = parseFloat(planetSizeFactor.toFixed(2));
        if (totalCommits === 0) planetSizeFactor = 1.0;
        console.log('惑星サイズ要因:', planetSizeFactor);

        // 9. ★ データをセッションに保存 (変更なし) ★
        const planetDataToSave = {
            mainLanguage: mainLanguage,
            planetColor: planetColor,
            languageStats: languageStats,
            totalCommits: totalCommits,
            planetSizeFactor: planetSizeFactor,
        };
        req.session.planetData = {
            user: user,
            github_token: accessToken,
            planetData: planetDataToSave
        };

        // ★★★ 最小限の変更点: データを DB に保存/更新 ★★★
        if (pool) {
            try {
                const query = `
                    INSERT INTO planets (github_id, username, planet_color, planet_size_factor, main_language, last_updated)
                    VALUES ($1, $2, $3, $4, $5, NOW())
                    ON CONFLICT (github_id) 
                    DO UPDATE SET 
                        username = $2,
                        planet_color = $3,
                        planet_size_factor = $4,
                        main_language = $5,
                        last_updated = NOW();
                `;
                const values = [
                    user.id, // GitHub ID (数値)
                    user.login, // GitHub Username
                    planetDataToSave.planetColor,
                    planetDataToSave.planetSizeFactor,
                    planetDataToSave.mainLanguage
                ];

                await pool.query(query, values);
                console.log(`[DB] ユーザー ${user.login} の惑星データを保存/更新しました。`);

            } catch (dbError) {
                console.error('[DB] 惑星データの保存に失敗しました:', dbError);
            }
        }
        // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★

        // 10. ホームページ(/)にリダイレクト
        console.log('惑星データ生成完了。/ (ルート) にリダイレクトします。');
        res.redirect('/');

    } catch (error) {
        console.error('認証エラー:', error.response ? error.response.data : error.message);
        res.status(500).send('認証中にエラーが発生しました');
    }
});

// ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
// ★ 惑星データを返すAPIエンドポイント (変更なし)
// ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
app.get('/api/me', (req, res) => {
    if (req.session.planetData) {
        console.log('/api/me が呼ばれました。セッションデータを返します。');
        res.json(req.session.planetData);
    } else {
        console.log('/api/me が呼ばれました。認証されていません (401)。');
        res.status(401).json({ error: 'Not authenticated' });
    }
});

// ★★★ 最小限の変更点: ランダムな惑星データを返すAPI ★★★
app.get('/api/planets/random', async (req, res) => {
    console.log('/api/planets/random が呼ばれました。');
    if (!pool) {
        console.log('DB接続が設定されていません');
        return res.status(503).json({ error: 'データベース接続がありません' });
    }
    try {
        // データベースからランダムに1件の惑星データを取得
        const result = await pool.query(
            'SELECT username, planet_color, planet_size_factor, main_language FROM planets ORDER BY RANDOM() LIMIT 1'
        );

        if (result.rows.length > 0) {
            console.log('ランダムな惑星を返します:', result.rows[0].username);
            res.json(result.rows[0]);
        } else {
            console.log('DB に惑星データがありません (404)');
            res.status(404).json({ error: 'まだ誰も惑星を持っていません' });
        }
    } catch (error) {
        console.error('[DB] ランダムな惑星データの取得エラー:', error);
        res.status(500).json({ error: 'データの取得に失敗しました' });
    }
});
// ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★


// --- 6. サーバー起動 (変更なし) ---
app.listen(port, () => {
    console.log(`サーバーが ポート ${port} で起動しました`);
});