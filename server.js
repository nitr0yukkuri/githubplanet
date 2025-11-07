// server.js

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

// ★★★ GitHub OAuth App 設定 ★★★
const isProduction = process.env.NODE_ENV === 'production';
let GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, CALLBACK_URL;

if (isProduction) {
    console.log('★ 本番環境(Render)の設定を使用します');
    GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || 'Ov23lij7ExiRQ0SunKG9';
    GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || 'c6d39664a728fe06d2272028ea4adbe81e39a5b5';
    CALLBACK_URL = process.env.CALLBACK_URL || 'https://githubplanet.onrender.com/callback';
} else {
    console.log('★ ローカル環境の設定を使用します');
    GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID_LOCAL || 'Ov23liiff1uvGf1ThXkI';
    GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET_LOCAL || '601f033befdb67ee00c019d5f7368c0eaf94d0e2';
    CALLBACK_URL = 'http://localhost:3000/callback';
}

// ★★★ Render PostgreSQL への接続設定 ★★★
const connectionString = process.env.DATABASE_URL;
let pool;
if (connectionString) {
    pool = new pg.Pool({
        connectionString: connectionString,
        ssl: { rejectUnauthorized: false }
    });

    pool.query(`
        CREATE TABLE IF NOT EXISTS planets (
            github_id BIGINT PRIMARY KEY,
            username TEXT NOT NULL,
            planet_color TEXT,
            planet_size_factor REAL,
            main_language TEXT,
            language_stats JSONB,
            total_commits INTEGER,
            last_updated TIMESTAMP DEFAULT NOW()
        );
    `)
        .then(() => console.log('[DB] planetsテーブルの準備ができました'))
        .catch(err => console.error('[DB] テーブル作成に失敗しました:', err));
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use('/front', express.static(path.join(__dirname, 'front')));
if (isProduction) app.set('trust proxy', 1);

app.use(session({
    secret: process.env.SESSION_SECRET || 'your-very-secret-key-change-it',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: isProduction, httpOnly: true, sameSite: 'lax' }
}));

function base64URLEncode(str) {
    return str.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
function sha256(buffer) {
    return crypto.createHash('sha256').update(buffer).digest();
}

function generatePlanetName(mainLanguage, planetColor, totalCommits) {
    const adjectives = {
        JavaScript: '柔軟な', TypeScript: '堅牢な', Python: '賢明な', HTML: '構造的', CSS: '美麗な',
        Ruby: '情熱の', Java: '不変の', C: '原始の', 'C++': '高速の', 'C#': '鋭利な',
        Go: '疾風の', Rust: '安全な', PHP: '象の', Swift: '迅速な', Kotlin: '静寂の',
        Unknown: '未知の' // ★ 変更点: 'Unknown' 用の形容詞を追加
    };
    const colorNames = {
        '#f0db4f': '黄金', '#007acc': '蒼穹', '#306998': '深海', '#e34c26': '灼熱', '#563d7c': '紫水晶',
        '#CC342D': '紅蓮', '#b07219': '大地', '#555555': '鋼鉄', '#f34b7d': '桜花', '#178600': '翡翠',
        '#00ADD8': '氷河', '#dea584': '砂塵', '#4F5D95': '藍染', '#F05138': '朱色', '#A97BFF': '雷光',
        '#808080': '神秘' // ★ 変更点: デフォルトカラー用の色名を追加
    };
    const adj = adjectives[mainLanguage] || '未知の';
    const col = colorNames[planetColor] || '神秘';
    let suffix = '星';
    if (totalCommits > 1000) suffix = '帝星';
    else if (totalCommits > 500) suffix = '巨星';
    return `${adj}${col}の${suffix}`;
}

// --- ルート定義 ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/login', (req, res) => {
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
    res.redirect(authUrl.href);
});

app.get('/callback', async (req, res) => {
    const { code } = req.query;
    const { code_verifier } = req.session;
    if (!code || !code_verifier) return res.status(400).send('不正なリクエストです');

    try {
        const tokenRes = await axios.post('https://github.com/login/oauth/access_token', {
            client_id: GITHUB_CLIENT_ID, client_secret: GITHUB_CLIENT_SECRET,
            code, redirect_uri: CALLBACK_URL, code_verifier
        }, { headers: { 'Accept': 'application/json' } });
        const accessToken = tokenRes.data.access_token;

        const userRes = await axios.get('https://api.github.com/user', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const user = userRes.data;

        const reposRes = await axios.get(user.repos_url + '?per_page=100', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        const languageStats = {};
        let totalCommits = 0;
        await Promise.all(reposRes.data.map(async (repo) => {
            if (repo.fork) return;
            if (repo.languages_url) {
                try {
                    const langRes = await axios.get(repo.languages_url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
                    for (const [lang, bytes] of Object.entries(langRes.data)) {
                        languageStats[lang] = (languageStats[lang] || 0) + bytes;
                    }
                } catch (e) { }
            }
            try {
                const commitsRes = await axios.get(`https://api.github.com/repos/${user.login}/${repo.name}/commits?author=${user.login}&per_page=1`, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                if (commitsRes.headers['link'] && commitsRes.headers['link'].includes('last')) {
                    totalCommits += 10;
                } else {
                    totalCommits += 1;
                }
            } catch (e) { totalCommits += 5; }
        }));

        totalCommits = Math.floor(totalCommits * 6.3);

        let mainLanguage = 'Unknown';
        let maxBytes = 0;
        for (const [lang, bytes] of Object.entries(languageStats)) {
            if (bytes > maxBytes) { maxBytes = bytes; mainLanguage = lang; }
        }

        const colors = { JavaScript: '#f0db4f', TypeScript: '#007acc', Python: '#306998', HTML: '#e34c26', CSS: '#563d7c', Ruby: '#CC342D', Java: '#b07219', C: '#555555', 'C++': '#f34b7d', 'C#': '#178600', Go: '#00ADD8', Rust: '#dea584', PHP: '#4F5D95' };
        const planetColor = colors[mainLanguage] || '#808080';
        let planetSizeFactor = 1.0 + Math.min(1.0, Math.log10(Math.max(1, totalCommits)) / Math.log10(500));
        planetSizeFactor = parseFloat(planetSizeFactor.toFixed(2));

        const planetName = generatePlanetName(mainLanguage, planetColor, totalCommits);

        req.session.planetData = {
            user,
            planetData: { mainLanguage, planetColor, languageStats, totalCommits, planetSizeFactor, planetName }
        };

        if (pool) {
            await pool.query(`
                INSERT INTO planets (github_id, username, planet_color, planet_size_factor, main_language, language_stats, total_commits, last_updated)
                VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
                ON CONFLICT (github_id) DO UPDATE SET
                    username = $2, planet_color = $3, planet_size_factor = $4, main_language = $5,
                    language_stats = $6, total_commits = $7, last_updated = NOW()
            `, [user.id, user.login, planetColor, planetSizeFactor, mainLanguage, languageStats, totalCommits]);
        }

        res.redirect('/');
    } catch (error) {
        console.error('Login Error:', error.message);
        res.redirect('/');
    }
});

app.get('/api/me', (req, res) => {
    req.session.planetData ? res.json(req.session.planetData) : res.status(401).json({ error: 'Not logged in' });
});

// ★★★ 修正: 特定ユーザーの惑星データ取得 API ★★★
app.get('/api/planets/user/:username', async (req, res) => {
    if (!pool) return res.status(503).json({ error: 'DB unavailable' });
    try {
        const { username } = req.params;
        const result = await pool.query('SELECT * FROM planets WHERE username = $1', [username]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Planet not found' });
        }

        const row = result.rows[0];

        // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
        // ★★★ 最小限の変更点 1/2 ★★★
        // ★ データ一貫性チェック ★
        // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
        const totalCommits = parseInt(row.total_commits) || 0;
        const languageStats = row.language_stats || {};
        const hasStats = Object.keys(languageStats).length > 0;

        let mainLanguage = row.main_language;
        let planetColor = row.planet_color;

        // もしコミットが0または言語統計が空なのに、mainLanguageが 'Unknown' 以外（＝古い不完全データ）だったら
        if ((totalCommits === 0 || !hasStats) && mainLanguage !== 'Unknown') {
            // データを強制的にデフォルト値（Unknown）に戻す
            mainLanguage = 'Unknown';
            planetColor = '#808080'; // 'Unknown' のデフォルトカラー
        }
        // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
        // ★★★ 変更点ここまで ★★★
        // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★

        // 修正後のデータで惑星名を再生成
        const planetName = generatePlanetName(mainLanguage, planetColor, totalCommits);

        // ★ フロントエンドが期待する形式に完全一致させる
        const responseData = {
            username: row.username,
            planetColor: planetColor, // 修正された可能性のある planetColor を使用
            planetSizeFactor: parseFloat(row.planet_size_factor),
            mainLanguage: mainLanguage, // 修正された可能性のある mainLanguage を使用
            languageStats: languageStats, // (元々 || {} されている)
            totalCommits: totalCommits, // (元々 parseInt || 0 されている)
            planetName: planetName // 修正後のデータで再生成された惑星名
        };

        res.json(responseData);
    } catch (e) {
        console.error('[API /user/:username Error]', e);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// ★★★ 修正: ランダム惑星取得 API ★★★
app.get('/api/planets/random', async (req, res) => {
    if (!pool) return res.status(503).json({ error: 'DB unavailable' });
    try {
        const result = await pool.query('SELECT * FROM planets ORDER BY RANDOM() LIMIT 1');
        if (result.rows.length === 0) return res.status(404).json({ error: 'No planets found' });

        const row = result.rows[0];

        // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
        // ★★★ 最小限の変更点 2/2 ★★★
        // ★ データ一貫性チェック ★
        // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
        const totalCommits = parseInt(row.total_commits) || 0;
        const languageStats = row.language_stats || {};
        const hasStats = Object.keys(languageStats).length > 0;

        let mainLanguage = row.main_language;
        let planetColor = row.planet_color;

        // もしコミットが0または言語統計が空なのに、mainLanguageが 'Unknown' 以外（＝古い不完全データ）だったら
        if ((totalCommits === 0 || !hasStats) && mainLanguage !== 'Unknown') {
            // データを強制的にデフォルト値（Unknown）に戻す
            mainLanguage = 'Unknown';
            planetColor = '#808080'; // 'Unknown' のデフォルトカラー
        }
        // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
        // ★★★ 変更点ここまで ★★★
        // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★

        // 修正後のデータで惑星名を再生成
        const planetName = generatePlanetName(mainLanguage, planetColor, totalCommits);

        // ★ フロントエンドが期待する形式に完全一致させる
        const responseData = {
            username: row.username,
            planetColor: planetColor, // 修正された可能性のある planetColor を使用
            planetSizeFactor: parseFloat(row.planet_size_factor),
            mainLanguage: mainLanguage, // 修正された可能性のある mainLanguage を使用
            languageStats: languageStats, // (元々 || {} されている)
            totalCommits: totalCommits, // (元々 parseInt || 0 されている)
            planetName: planetName // 修正後のデータで再生成された惑星名
        };

        res.json(responseData);
    } catch (e) {
        console.error('[API /random Error]', e);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.listen(port, () => console.log(`Server running on port ${port}`));