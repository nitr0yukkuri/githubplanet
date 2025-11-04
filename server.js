// server.js (★ Webページ提供機能 + API機能 ★)

// 1. インポート
import express from 'express';
import session from 'express-session';
import crypto from 'crypto';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';

// 2. Express の初期化
const app = express();
const port = process.env.PORT || 3000;

// ★★★ GitHub OAuth App の設定 ★★★
const GITHUB_CLIENT_ID = 'Ov23liiff1uvGf1ThXkI';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || '601f033befdb67ee00c019d5f7368c0eaf94d0e2';
const CALLBACK_URL = process.env.CALLBACK_URL || 'http://localhost:3000/callback';

// --- ESModuleで __dirname を再現 ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use('/front', express.static(path.join(__dirname, 'front')));

if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

// 3. セッションの設定
app.use(session({
    secret: 'your-very-secret-key-change-it',
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

// --- 4. /login エンドポイント (変更なし) ---
app.get('/login', (req, res) => {
    console.log('GitHubログインリクエストを受け取りました');
    const code_verifier = base64URLEncode(crypto.randomBytes(32));
    req.session.code_verifier = code_verifier;
    const code_challenge = base64URLEncode(sha256(code_verifier));

    const authUrl = new URL('https://github.com/login/oauth/authorize');
    authUrl.searchParams.set('client_id', GITHUB_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', CALLBACK_URL);
    authUrl.searchParams.set('scope', 'user:email public_repo');
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
    const { code_verifier } = req.session;

    if (!code) return res.status(400).send('codeがありません');
    if (!code_verifier) return res.status(400).send('code_verifierがセッションにありません');

    try {
        // 3. アクセストークンと交換
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

        // 4. ユーザー情報取得
        const userResponse = await axios.get('https://api.github.com/user', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const user = userResponse.data;
        console.log('ようこそ,', user.login);

        // 5. リポジトリ一覧を取得
        // ★ 取得件数を増やし、API呼び出し回数を減らす
        const reposResponse = await axios.get(user.repos_url + '?per_page=100', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const repos = reposResponse.data;

        // 6. 言語データとコミット数を集計
        const languageStats = {};
        let totalCommits = 0; // ★ 総コミット数集計用の変数

        await Promise.all(repos.map(async (repo) => {
            if (repo.fork || !repo.languages_url) return;

            // 6-1. 言語データ集計 (既存)
            try {
                const langResponse = await axios.get(repo.languages_url, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                const languages = langResponse.data;
                for (const [lang, bytes] of Object.entries(languages)) {
                    languageStats[lang] = (languageStats[lang] || 0) + bytes;
                }
            } catch (langError) { /* スキップ */ }

            // 6-2. ★ コミット数集計 (新規追加)
            try {
                // ユーザー自身のコミット（最大100件）を取得しカウントします。
                // 注: 正確な総コミット数取得には、ページネーションが必要です。
                const commitsUrl = `https://api.github.com/repos/${user.login}/${repo.name}/commits?author=${user.login}&per_page=100`;
                const commitResponse = await axios.get(commitsUrl, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                const commitsCount = commitResponse.data.length;
                totalCommits += commitsCount;
            } catch (commitError) {
                /* スキップ */
            }
        }));

        console.log('総コミット数 (近似値):', totalCommits);

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

        // 8. 惑星の色とサイズを決定
        let planetColor = '#808080';
        if (mainLanguage === 'JavaScript') planetColor = '#f0db4f';
        if (mainLanguage === 'TypeScript') planetColor = '#007acc';
        if (mainLanguage === 'Python') planetColor = '#306998';
        if (mainLanguage === 'HTML') planetColor = '#e34c26';
        if (mainLanguage === 'CSS') planetColor = '#563d7c';
        if (mainLanguage === 'Ruby') planetColor = '#CC342D';

        // ★ 惑星サイズ要因を決定 (新規追加): コミット数が多いほど大きくなる
        const baseSize = 1.0;
        const maxCommitsScale = 500; // 500コミットを一つの基準とする
        // 対数スケールでサイズを調整（急激な変化を抑えるため）
        let planetSizeFactor = baseSize + Math.min(1.0, Math.log10(totalCommits + 1) / Math.log10(maxCommitsScale));
        planetSizeFactor = parseFloat(planetSizeFactor.toFixed(2));
        if (totalCommits === 0) planetSizeFactor = 1.0;
        console.log('惑星サイズ要因:', planetSizeFactor);


        // 9. ★ データをセッションに保存 (更新) ★
        req.session.planetData = {
            user: user,
            github_token: accessToken,
            planetData: {
                mainLanguage: mainLanguage,
                planetColor: planetColor,
                languageStats: languageStats,
                // ★ 新しいプロパティを追加
                totalCommits: totalCommits,
                planetSizeFactor: planetSizeFactor,
            }
        };

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


// --- 6. サーバー起動 (変更なし) ---
app.listen(port, () => {
    console.log(`サーバーが ポート ${port} で起動しました`);
});