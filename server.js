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
const port = 3000;

// ★★★ GitHub OAuth App の設定 ★★★
// (unkoブランチのIDとSecretをそのまま使います)
const GITHUB_CLIENT_ID = 'Ov23lil0pJoHtaeAvXrk';
const GITHUB_CLIENT_SECRET = '0af8d9d749f799e2c1705e833fdc6930badeda24';
const CALLBACK_URL = 'http://localhost:3000/callback';

// --- ESModuleで __dirname を再現 ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 3. セッションの設定 (変更なし)
app.use(session({
    secret: 'your-very-secret-key-change-it', // (ここは後で変えてもOK)
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // localhost (http) の場合は false
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

    console.log('✅ code取得成功');

    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('🔄 セッション交換開始...');
    const { data, error } = await supabase.auth.exchangeCodeForSession(String(code));

    if (error) {
        console.error('❌ exchangeCodeForSession エラー:', error);
        return res.status(500).send(`
            <html>
            <body style="font-family: Arial; padding: 50px;">
                <h1>❌ セッション交換エラー</h1>
                <pre>${JSON.stringify(error, null, 2)}</pre>
                <a href="/">戻る</a>
            </body>
            </html>
        `);
    }

    console.log('✅ セッション交換成功');

    const user = data.session?.user;
    const providerToken = data.session?.provider_token;

    if (!user) {
        console.error('❌ ユーザー情報なし');
        return res.status(500).send('ユーザー情報取得失敗');
    }

    console.log('✅ ユーザー情報取得成功:');
    console.log(`   - ID: ${user.id}`);
    console.log(`   - Email: ${user.email}`);
    console.log(`   - Username: ${user.user_metadata?.user_name || 'N/A'}`);
    console.log('╚════════════════════════════════════╝\n');

    res.send(`
        <!DOCTYPE html>
        <html lang="ja">
        <head>
            <meta charset="UTF-8">
            <title>ログイン成功 🎉</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    max-width: 800px;
                    margin: 50px auto;
                    padding: 30px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                }
                .container {
                    background: white;
                    padding: 40px;
                    border-radius: 15px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                }
                h1 { color: #2d3748; border-bottom: 3px solid #48bb78; padding-bottom: 15px; }
                .success { background: #48bb78; color: white; padding: 10px 20px; border-radius: 25px; display: inline-block; margin-bottom: 20px; }
                .info { background: #f7fafc; padding: 20px; border-radius: 10px; margin: 20px 0; }
                pre { background: #2d3748; color: #68d391; padding: 20px; border-radius: 10px; overflow-x: auto; }
                a { display: inline-block; margin-top: 25px; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 8px; }
                a:hover { background: #5568d3; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="success">🎉 ログイン成功！</div>
                <h1>ユーザー情報</h1>
                
                <div class="info">
                    <p><strong>👤 ユーザー名:</strong> ${user.user_metadata?.user_name || 'N/A'}</p>
                    <p><strong>📧 Email:</strong> ${user.email || 'N/A'}</p>
                    <p><strong>🆔 ID:</strong> ${user.id}</p>
                    ${providerToken ? `<p><strong>🔑 GitHub Token:</strong> ${providerToken.substring(0, 30)}...</p>` : ''}
                </div>

                <h2>完全なユーザー情報</h2>
                <pre>${JSON.stringify(user, null, 2)}</pre>

                <a href="/">🏠 トップに戻る</a>
            </div>
        </body>
        </html>
    `);
});

// --- トップページ ---
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="ja">
        <head>
            <meta charset="UTF-8">
            <title>GitHub OAuth テスト</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    max-width: 700px;
                    margin: 100px auto;
                    text-align: center;
                    padding: 20px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                }
                .card {
                    background: white;
                    padding: 50px;
                    border-radius: 20px;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                }
                h1 { color: #2d3748; margin-bottom: 15px; }
                button {
                    background: #24292e;
                    color: white;
                    padding: 18px 40px;
                    border: none;
                    border-radius: 10px;
                    font-size: 18px;
                    cursor: pointer;
                    transition: all 0.3s;
                }
                button:hover {
                    background: #2c3338;
                    transform: translateY(-3px);
                }
                .warning {
                    background: #fff8e1;
                    border: 2px solid #ffd54f;
                    padding: 25px;
                    border-radius: 12px;
                    margin-top: 40px;
                    text-align: left;
                }
                code {
                    background: #37474f;
                    color: #69f0ae;
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-family: monospace;
                }
            </style>
        </head>
        <body>
            <div class="card">
                <h1>🚀 GitHub OAuth ログイン</h1>
                <p>Supabase + Express + GitHub OAuth</p>
                
                <button onclick="location.href='/login'">🔐 GitHubでログイン</button>

                <div class="warning">
                    <h3 style="margin-top: 0; color: #f57c00;">⚙️ 必須設定</h3>
                    <p><strong>GitHub OAuth App の Authorization callback URL:</strong></p>
                    <code>http://127.0.0.1:54321/auth/v1/callback</code>
                    <p style="margin-top: 15px; font-size: 14px;">
                        設定場所: GitHub → Settings → Developer settings → OAuth Apps
                    </p>
                </div>
            </div>
        </body>
        </html>
    `);
});

// --- 6. サーバー起動 ---
app.listen(port, () => {
    console.log('\n╔════════════════════════════════════╗');
    console.log('║     サーバー起動完了           ║');
    console.log('╚════════════════════════════════════╝');
    console.log(`📍 URL: http://localhost:${port}`);
    console.log('\n📌 GitHub OAuth 設定を確認:');
    console.log('   Client ID: Ov23lil0pJoHtaeAvXrk');
    console.log('   Callback URL: http://127.0.0.1:54321/auth/v1/callback');
    console.log('╚════════════════════════════════════╝\n');
});