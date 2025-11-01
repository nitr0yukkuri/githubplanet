// server.js (超詳細デバッグ版)

import { createClient } from '@supabase/supabase-js';
import express from 'express';

const app = express();
const port = 3000;

const supabaseUrl = 'http://127.0.0.1:54321';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

// すべてのリクエストをログ
app.use((req, res, next) => {
    console.log(`\n>>> [${new Date().toISOString()}] ${req.method} ${req.url}`);
    console.log('Query:', req.query);
    console.log('Headers:', {
        host: req.headers.host,
        referer: req.headers.referer,
        'user-agent': req.headers['user-agent']?.substring(0, 50)
    });
    next();
});

app.use(express.static('public'));

// --- /login エンドポイント ---
app.get('/login', async (req, res) => {
    console.log('\n╔════════════════════════════════════╗');
    console.log('║   GitHubログイン処理開始        ║');
    console.log('╚════════════════════════════════════╝');

    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('📝 リクエストパラメータ:');
    console.log('   - Provider: github');
    console.log('   - RedirectTo: http://localhost:3000/callback');
    console.log('   - Scopes: user:email');

    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
            redirectTo: 'http://localhost:3000/callback',
            scopes: 'user:email'
        }
    });

    if (error) {
        console.error('❌ Supabase エラー:', error);
        return res.status(500).send(`
            <html>
            <body style="font-family: Arial; padding: 50px;">
                <h1>❌ エラー</h1>
                <pre>${JSON.stringify(error, null, 2)}</pre>
                <a href="/">戻る</a>
            </body>
            </html>
        `);
    }

    console.log('✅ Supabase レスポンス:', {
        hasUrl: !!data?.url,
        urlPreview: data?.url?.substring(0, 100) + '...'
    });

    if (data?.url) {
        console.log('🔀 リダイレクト実行:', data.url);
        console.log('╚════════════════════════════════════╝\n');
        res.redirect(data.url);
    } else {
        console.error('❌ URLなし');
        res.status(500).send('URL生成失敗');
    }
});

// --- /callback エンドポイント ---
app.get('/callback', async (req, res) => {
    console.log('\n╔════════════════════════════════════╗');
    console.log('║   /callback 呼び出し             ║');
    console.log('╚════════════════════════════════════╝');

    console.log('📨 受信データ:');
    console.log('   完全なURL:', req.url);
    console.log('   Query String:', req.url.split('?')[1] || '(なし)');
    console.log('   パースされたQuery:', JSON.stringify(req.query, null, 2));
    console.log('   Referer:', req.headers.referer || '(なし)');

    const queryKeys = Object.keys(req.query);
    console.log(`   パラメータ数: ${queryKeys.length}`);

    if (queryKeys.length === 0) {
        console.error('❌ パラメータが全くありません！');
        console.log('\n🔍 デバッグ情報:');
        console.log('   req.url:', req.url);
        console.log('   req.originalUrl:', req.originalUrl);
        console.log('   req.path:', req.path);

        return res.send(`
            <!DOCTYPE html>
            <html lang="ja">
            <head>
                <meta charset="UTF-8">
                <title>デバッグ情報</title>
                <style>
                    body { font-family: monospace; padding: 30px; background: #1e1e1e; color: #d4d4d4; }
                    .error { color: #f48771; font-size: 20px; margin-bottom: 20px; }
                    .box { background: #2d2d2d; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #404040; }
                    .box h3 { color: #4ec9b0; margin-top: 0; }
                    pre { background: #1e1e1e; padding: 15px; border-radius: 4px; overflow-x: auto; border: 1px solid #404040; }
                    code { color: #ce9178; }
                    .step { background: #264f78; padding: 15px; margin: 10px 0; border-radius: 4px; }
                    a { color: #4fc3f7; }
                </style>
            </head>
            <body>
                <div class="error">❌ エラー: クエリパラメータが空です</div>
                
                <div class="box">
                    <h3>🔍 受信したリクエスト情報</h3>
                    <p><strong>URL:</strong> <code>${req.url}</code></p>
                    <p><strong>Original URL:</strong> <code>${req.originalUrl}</code></p>
                    <p><strong>Path:</strong> <code>${req.path}</code></p>
                    <p><strong>Query Object:</strong></p>
                    <pre>${JSON.stringify(req.query, null, 2)}</pre>
                    <p><strong>Referer:</strong> <code>${req.headers.referer || 'なし'}</code></p>
                </div>

                <div class="box">
                    <h3>🔧 問題の診断</h3>
                    <p>GitHubからのリダイレクトが正しく機能していません。以下を確認してください：</p>
                    
                    <div class="step">
                        <strong>1. GitHub OAuth App の設定確認</strong>
                        <ul>
                            <li>https://github.com/settings/developers にアクセス</li>
                            <li>OAuth Apps → あなたのアプリを選択</li>
                            <li><strong>Client ID:</strong> <code>Ov23lil0pJoHtaeAvXrk</code> と一致するか確認</li>
                        </ul>
                    </div>

                    <div class="step">
                        <strong>2. Authorization callback URL の設定</strong>
                        <p>以下のURLに<strong>正確に</strong>設定されているか確認：</p>
                        <pre>http://127.0.0.1:54321/auth/v1/callback</pre>
                        <p style="color: #f48771;">注意: localhostではなく127.0.0.1を使用</p>
                    </div>

                    <div class="step">
                        <strong>3. config.toml の確認</strong>
                        <p>supabase/config.toml で以下を確認：</p>
                        <pre>[auth.external.github]
enabled = true
client_id = "Ov23lil0pJoHtaeAvXrk"
secret = "90966284ed110870027732138324e6b7a1e21b21"</pre>
                    </div>

                    <div class="step">
                        <strong>4. Supabase の再起動</strong>
                        <p>設定を変更した場合は再起動が必要です：</p>
                        <pre>npx supabase stop
npx supabase start</pre>
                    </div>
                </div>

                <div class="box">
                    <h3>🧪 テスト手順</h3>
                    <ol>
                        <li>上記の設定をすべて確認</li>
                        <li>Supabaseを再起動</li>
                        <li>サーバーを再起動（Ctrl+C → node server.js）</li>
                        <li><a href="/">トップページ</a>から再度ログインを試す</li>
                        <li>ブラウザの開発者ツール(F12) → Networkタブで通信を確認</li>
                    </ol>
                </div>

                <p><a href="/">🏠 トップに戻る</a></p>
            </body>
            </html>
        `);
    }

    const { code, error: authError, error_description } = req.query;

    console.log('📦 パラメータ詳細:');
    console.log(`   - code: ${code ? '✅ あり (' + code.substring(0, 20) + '...)' : '❌ なし'}`);
    console.log(`   - error: ${authError || '(なし)'}`);
    console.log(`   - error_description: ${error_description || '(なし)'}`);

    if (authError) {
        console.error('❌ 認証エラー:', authError);
        return res.status(400).send(`
            <html>
            <body style="font-family: Arial; padding: 50px;">
                <h1>❌ 認証エラー</h1>
                <p><strong>エラー:</strong> ${authError}</p>
                <p><strong>詳細:</strong> ${error_description || 'なし'}</p>
                <a href="/">戻る</a>
            </body>
            </html>
        `);
    }

    if (!code) {
        console.error('❌ codeパラメータなし（authErrorもなし）');
        return res.status(400).send('codeがありません');
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

// --- サーバー起動 ---
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