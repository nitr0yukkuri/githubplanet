// server.js (サーバーサイド認証フロー)

// 1. インポート
import { createClient } from '@supabase/supabase-js';
import express from 'express';

// 2. Express と Supabase の初期化
const app = express();
const port = 3000;

const supabaseUrl = 'http://127.0.0.1:54321';

// ★★★★★ 重要 ★★★★★
// npx supabase status で表示された「Secret key」を貼り付けます
const supabaseKey = 'sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz'; // ← ★★★ 修正しました ★★★
const supabase = createClient(supabaseUrl, supabaseKey);

// --- 3. /login エンドポイント (admin.generateLink を使う) ---
app.get('/login', async (req, res) => {
    console.log('GitHubログインリクエストを受け取りました');

    const { data, error } = await supabase.auth.admin.generateLink({
        type: 'oauth', // OAuth認証
        provider: 'github',
        // config.tomlの[auth].additional_redirect_urlsと一致させる
        redirectUrl: 'http://localhost:3000/callback',
        scopes: ['user:email'] // ← ★★★ 最小限の変更（この行を追加） ★★★
    });

    if (error) {
        console.error('ログインエラー:', error.message);
        return res.status(500).send('ログイン中にエラーが発生しました');
    }

    // data.properties.url が GitHub の認証 URL
    if (data && data.properties) {
        console.log('GitHub認証ページにリダイレクトします:', data.properties.url);
        res.redirect(data.properties.url);
    } else {
        console.error('GitHubのURLが生成されませんでした');
        res.status(500).send('URL生成エラー');
    }
});

// --- 4. /callback エンドポイント (ここはほぼ同じ) ---
app.get('/callback', async (req, res) => {
    console.log('/callback が呼ばれました');

    // 1. URLについてくる "code" を取得
    const { code } = req.query; // ★ ?code= が返ってくるはず

    if (code) {
        console.log('受け取ったコード:', code);

        // 2. "code" をセッション（アクセストークン）と交換する
        const { data: sessionData, error: sessionError } =
            await supabase.auth.exchangeCodeForSession(String(code));

        if (sessionError) {
            console.error('セッション交換エラー:', sessionError.message);
            return res.status(500).send('セッションの交換に失敗しました');
        }

        console.log('セッション取得成功！');

        // 3. 取得したセッションを使って、ユーザー情報を取得する
        // (exchangeCodeForSessionが終わるとクライアントは認証済みになる)
        const { data: { user }, error: userError } =
            await supabase.auth.getUser();

        if (userError) {
            console.error('ユーザー情報取得エラー:', userError.message);
            return res.status(500).send('ユーザー情報の取得に失敗しました');
        }

        // 4. 成功！ ユーザー情報を表示
        console.log('ようこそ,', user.user_metadata.user_name);
        res.json({
            message: 'ログイン成功！',
            user: user,
            github_token: sessionData.session.provider_token // ← これがGitHub APIを叩く鍵
        });

    } else {
        res.status(400).send('codeがありません');
    }
});


// --- 5. サーバー起動 ---
app.listen(port, () => {
    console.log(`サーバーが http://localhost:${port} で起動しました`);
});