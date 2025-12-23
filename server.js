// server.js
// ▼▼▼ .env ファイルを読み込む ▼▼▼
import 'dotenv/config';
// ▲▲▲ .env ファイルを読み込む ▲▲▲

// server.js

// 1. インポート
import express from 'express';
import session from 'express-session';
import crypto from 'crypto';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
// ▼▼▼ 追加: セッションストア用ライブラリ ▼▼▼
import connectPgSimple from 'connect-pg-simple';
// ▲▲▲ 追加終了 ▲▲▲

// 2. Express の初期化
const app = express();
const port = process.env.PORT || 3000;

// ▼▼▼ 追加: セッションストアの初期化 ▼▼▼
const PgSession = connectPgSimple(session);
// ▲▲▲ 追加終了 ▲▲▲

// ★★★ GitHub OAuth App 設定 ★★★
const isProduction = process.env.NODE_ENV === 'production';
let GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, CALLBACK_URL;

if (isProduction) {
    console.log('★ 本番環境(Render)の設定を使用します');
    GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
    GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
    CALLBACK_URL = process.env.CALLBACK_URL || 'https://githubplanet.onrender.com/callback';
} else {
    console.log('★ ローカル環境の設定を使用します');
    GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID_LOCAL;
    GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET_LOCAL;
    CALLBACK_URL = 'http://localhost:3000/callback';

    if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
        console.error('エラー: .envファイルに GITHUB_CLIENT_ID_LOCAL と GITHUB_CLIENT_SECRET_LOCAL を設定してください。');
    }
}

// ▼▼▼ 実績定義 ▼▼▼
const ACHIEVEMENTS = {
    FIRST_PLANET: { id: 'FIRST_PLANET', name: '最初の星', description: '初めての惑星を作成した。' },
    COMMIT_100: { id: 'COMMIT_100', name: 'コミット100', description: '累計コミット数が100を超えた。' },
    COMMIT_500: { id: 'COMMIT_500', name: 'コミット500', description: '累計コミット数が500を超えた。' },
    COMMIT_1000: { id: 'COMMIT_1000', name: 'コミット1000', description: '累計コミット数が1000を超えた。' },
};
// ▲▲▲ 実績定義 ▲▲▲

// ▼▼▼ GraphQLクエリ定義 ▼▼▼
const USER_DATA_QUERY = `
  query($login: String!) {
    user(login: $login) {
      repositories(first: 100, ownerAffiliations: OWNER, isFork: false, orderBy: {field: PUSHED_AT, direction: DESC}) {
        nodes {
          name
          languages(first: 5, orderBy: {field: SIZE, direction: DESC}) {
            edges {
              size
              node {
                name
                color
              }
            }
          }
          defaultBranchRef {
            target {
              ... on Commit {
                history {
                  totalCount
                }
              }
            }
          }
        }
      }
    }
  }
`;
// ▲▲▲ GraphQLクエリ定義 ▲▲▲

// ▼▼▼ Render DB 接続設定 ▼▼▼
const connectionString = process.env.DATABASE_URL;
let pool;
if (connectionString) {
    // ▼▼▼ 修正: 接続先がローカル(db, localhost)以外ならSSLを強制有効化する判定を追加 ▼▼▼
    // これにより、ローカルからNeon等の外部DBにつなぐ場合はSSLが有効になり、
    // Docker内のdbコンテナにつなぐ場合はSSLが無効になります。
    const isLocalDatabase = connectionString.includes('@localhost') ||
        connectionString.includes('@127.0.0.1') ||
        connectionString.includes('@db');

    pool = new pg.Pool({
        connectionString: connectionString,
        ssl: isLocalDatabase ? undefined : { rejectUnauthorized: false }
    });
    // ▲▲▲ 修正終了 ▲▲▲

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
        .then(() => {
            console.log('[DB] planetsテーブルの準備ができました');
            return pool.query(`
                ALTER TABLE planets 
                ADD COLUMN IF NOT EXISTS achievements JSONB DEFAULT '{}'::jsonb;
            `);
        })
        .then(() => console.log('[DB] achievementsカラムの準備ができました'))
        .catch(err => console.error('[DB] テーブル作成/接続に失敗しました:', err));
} else {
    console.warn('[DB] データベース接続文字列(DATABASE_URL)が設定されていません。DB機能は無効になります。');
}
// ▲▲▲ Render DB 接続設定 ▲▲▲


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use('/front', express.static(path.join(__dirname, 'front')));
if (isProduction) app.set('trust proxy', 1);

app.use(session({
    // ▼▼▼ 修正: DB接続がある場合はPostgreSQLにセッションを保存 ▼▼▼
    store: pool ? new PgSession({
        pool: pool,
        createTableIfMissing: true // セッション用テーブルがない場合に自動作成
    }) : undefined,
    // ▲▲▲ 修正終了 ▲▲▲
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: isProduction, httpOnly: true, sameSite: 'lax' }
}));

function base64URLEncode(str) {
    return str.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/\//g, '_').replace(/=/g, '');
}
function sha256(buffer) {
    return crypto.createHash('sha256').update(buffer).digest();
}

// ▼▼▼ 実績チェック関数 ▼▼▼
function checkAchievements(existingAchievements, totalCommits) {
    const newAchievements = { ...existingAchievements };
    const now = new Date().toISOString();

    if (!newAchievements[ACHIEVEMENTS.FIRST_PLANET.id]) {
        newAchievements[ACHIEVEMENTS.FIRST_PLANET.id] = { ...ACHIEVEMENTS.FIRST_PLANET, unlockedAt: now };
    }
    if (totalCommits >= 100 && !newAchievements[ACHIEVEMENTS.COMMIT_100.id]) {
        newAchievements[ACHIEVEMENTS.COMMIT_100.id] = { ...ACHIEVEMENTS.COMMIT_100, unlockedAt: now };
    }
    if (totalCommits >= 500 && !newAchievements[ACHIEVEMENTS.COMMIT_500.id]) {
        newAchievements[ACHIEVEMENTS.COMMIT_500.id] = { ...ACHIEVEMENTS.COMMIT_500, unlockedAt: now };
    }
    if (totalCommits >= 1000 && !newAchievements[ACHIEVEMENTS.COMMIT_1000.id]) {
        newAchievements[ACHIEVEMENTS.COMMIT_1000.id] = { ...ACHIEVEMENTS.COMMIT_1000, unlockedAt: now };
    }
    return newAchievements;
}
// ▲▲▲ 実績チェック関数 ▲▲▲


function generatePlanetName(mainLanguage, planetColor, totalCommits) {
    const adjectives = {
        JavaScript: '柔軟な', TypeScript: '堅牢な', Python: '賢明な', HTML: '構造的', CSS: '美麗な',
        Ruby: '情熱の', Java: '不変の', C: '原始の', 'C++': '高速の', 'C#': '鋭利な',
        Go: '疾風の', Rust: '安全な', PHP: '象の', Swift: '迅速な', Kotlin: '静寂の',
        Shell: '自動の', Dart: '急襲の', Scala: '螺旋の', Perl: '真珠の', Lua: '月光の',
        Haskell: '純粋な', R: '統計の', Julia: '科学の', Vue: '反応の', Dockerfile: '箱舟の',
        Svelte: '構築の', Elixir: '錬金の', ObjectiveC: '客観の', VimScript: '操作の',
        Unknown: '未知の'
    };
    const colorNames = {
        '#f0db4f': '黄金', '#007acc': '蒼穹', '#306998': '深海', '#e34c26': '灼熱', '#563d7c': '紫水晶',
        '#CC342D': '紅蓮', '#b07219': '大地', '#555555': '鋼鉄', '#f34b7d': '桜花', '#178600': '翡翠',
        '#00ADD8': '氷河', '#dea584': '砂塵', '#4F5D95': '藍染', '#F05138': '朱色', '#A97BFF': '雷光',
        '#808080': '神秘',
        '#89e051': '若葉', '#00B4AB': '清流', '#c22d40': '薔薇', '#0298c3': '天青', '#000080': '深淵',
        '#5e5086': '夜空', '#198CE7': '蒼天', '#a270ba': '藤色', '#41b883': '若草', '#384d54': '玄武',
        '#ff3e00': '橙', '#6e4a7e': '葡萄', '#438eff': '青空', '#199f4b': '常盤'
    };
    const adj = adjectives[mainLanguage] || '未知の';
    const col = colorNames[planetColor] || '神秘';
    let suffix = '星';
    if (totalCommits > 1000) suffix = '帝星';
    else if (totalCommits > 500) suffix = '巨星';
    return `${adj}${col}の${suffix}`;
}

// ▼▼▼ 共通関数: 惑星データ取得・更新・保存 (GraphQL版) ▼▼▼
async function updateAndSavePlanetData(user, accessToken) {
    console.log(`[GraphQL] Fetching data for user: ${user.login}`);

    let repositories = [];
    try {
        const response = await axios.post(
            'https://api.github.com/graphql',
            {
                query: USER_DATA_QUERY,
                variables: { login: user.login }
            },
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                }
            }
        );

        if (response.data.errors) {
            console.error('[GraphQL Error]', response.data.errors);
            throw new Error('GraphQL query failed');
        }

        repositories = response.data.data.user.repositories.nodes;

    } catch (e) {
        console.error('[GraphQL] データ取得失敗:', e.message);
        // ▼▼▼ 修正: エラー時は空配列にせず、例外を投げて処理を中断する（データ上書き防止） ▼▼▼
        throw e;
        // ▲▲▲ 修正終了 ▲▲▲
    }

    const languageStats = {};
    let totalCommits = 0;

    for (const repo of repositories) {
        if (repo.languages && repo.languages.edges) {
            for (const edge of repo.languages.edges) {
                const langName = edge.node.name;
                const size = edge.size;
                languageStats[langName] = (languageStats[langName] || 0) + size;
            }
        }

        if (repo.defaultBranchRef && repo.defaultBranchRef.target && repo.defaultBranchRef.target.history) {
            totalCommits += repo.defaultBranchRef.target.history.totalCount;
        }
    }

    let mainLanguage = 'Unknown';
    let maxBytes = 0;
    for (const [lang, bytes] of Object.entries(languageStats)) {
        if (bytes > maxBytes) { maxBytes = bytes; mainLanguage = lang; }
    }

    const colors = {
        JavaScript: '#f0db4f', TypeScript: '#007acc', Python: '#306998', HTML: '#e34c26', CSS: '#563d7c',
        Ruby: '#CC342D', Java: '#b07219', C: '#555555', 'C++': '#f34b7d', 'C#': '#178600',
        Go: '#00ADD8', Rust: '#dea584', PHP: '#4F5D95',
        Swift: '#F05138', Kotlin: '#A97BFF', Shell: '#89e051', Dart: '#00B4AB',
        Scala: '#c22d40', Perl: '#0298c3', Lua: '#000080', Haskell: '#5e5086',
        R: '#198CE7', Julia: '#a270ba', Vue: '#41b883', Dockerfile: '#384d54',
        Svelte: '#ff3e00', Elixir: '#6e4a7e', 'Objective-C': '#438eff', VimScript: '#199f4b'
    };

    // ▼▼▼ 変更点: モデル一覧を問い合わせて、使えるものを自動で使う最強ロジック ▼▼▼
    let planetColor = colors[mainLanguage];

    if (!planetColor && mainLanguage !== 'Unknown' && process.env.GEMINI_API_KEY) {
        console.log(`[Gemini] 未定義の言語 "${mainLanguage}" の色を生成します (モデル自動探索)...`);

        const cleanApiKey = process.env.GEMINI_API_KEY.trim();
        const prompt = `Programming language: ${mainLanguage}. Provide a suitable hex color code (e.g., #ff0000) for this language. Return ONLY the hex code string.`;

        try {
            // 1. Googleに「今、私のキーで使えるモデルは何？」と聞く
            console.log('[Gemini] 利用可能なモデルを問い合わせ中...');
            const listModelsUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${cleanApiKey}`;
            const listRes = await axios.get(listModelsUrl);

            const allModels = listRes.data.models || [];

            // 2. "generateContent" に対応しているモデルだけ抽出
            let availableModels = allModels.filter(m =>
                m.supportedGenerationMethods &&
                m.supportedGenerationMethods.includes('generateContent')
            );

            if (availableModels.length === 0) {
                console.error('[Gemini] 生成に使用できるモデルが見つかりませんでした。');
            } else {
                // 3. 優先順位: 1.5-flash -> 1.5-pro -> その他
                availableModels.sort((a, b) => {
                    const nA = a.name; const nB = b.name;
                    if (nA.includes('1.5-flash') && !nB.includes('1.5-flash')) return -1;
                    if (!nA.includes('1.5-flash') && nB.includes('1.5-flash')) return 1;
                    if (nA.includes('1.5-pro') && !nB.includes('1.5-pro')) return -1;
                    if (!nA.includes('1.5-pro') && nB.includes('1.5-pro')) return 1;
                    return 0;
                });

                console.log(`[Gemini] 候補モデル: ${availableModels.map(m => m.name.split('/').pop()).join(', ')}`);

                // 4. 上から順に試す
                for (const model of availableModels) {
                    // model.name は "models/gemini-1.5-flash" のように返ってくる
                    // APIURLを作るときは "models/" を除去して埋め込むのが確実
                    const modelId = model.name.split('/').pop();

                    try {
                        const generateUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${cleanApiKey}`;

                        const geminiRes = await axios.post(generateUrl, {
                            contents: [{ parts: [{ text: prompt }] }]
                        }, { headers: { 'Content-Type': 'application/json' } });

                        const text = geminiRes.data.candidates?.[0]?.content?.parts?.[0]?.text;
                        if (text) {
                            const match = text.match(/#[0-9a-fA-F]{6}/);
                            if (match) {
                                planetColor = match[0];
                                console.log(`[Gemini] ★成功★ (使用モデル: ${modelId})`);
                                console.log(`[Gemini] "${mainLanguage}" の色を決定しました: ${planetColor}`);
                                break; // 成功したら終了
                            }
                        }
                    } catch (err) {
                        const errorMsg = err.response?.data?.error?.message || err.message;
                        console.warn(`[Gemini] スキップ (${modelId}): ${errorMsg}`);
                    }
                }
            }
        } catch (e) {
            console.error('[Gemini] モデル一覧の取得に失敗しました:', e.message);
        }
    }

    // AIが全滅した場合はデフォルトのグレー
    if (!planetColor) {
        console.error('[Gemini] 色の生成に失敗しました。デフォルト色を使用します。');
        planetColor = '#808080';
    }
    // ▲▲▲ 変更点終了 ▲▲▲

    let planetSizeFactor = 1.0 + Math.min(1.0, Math.log10(Math.max(1, totalCommits)) / 2.5);
    planetSizeFactor = parseFloat(planetSizeFactor.toFixed(2));

    const planetName = generatePlanetName(mainLanguage, planetColor, totalCommits);

    let achievements = {};
    if (pool) {
        let existingAchievements = {};
        try {
            const existingData = await pool.query('SELECT achievements FROM planets WHERE github_id = $1', [user.id]);
            if (existingData.rows.length > 0) {
                existingAchievements = existingData.rows[0].achievements || {};
            }
        } catch (e) {
            console.error('[DB] 既存実績取得エラー:', e);
        }

        achievements = checkAchievements(existingAchievements, totalCommits);

        await pool.query(`
            INSERT INTO planets (github_id, username, planet_color, planet_size_factor, main_language, language_stats, total_commits, last_updated, achievements)
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)
            ON CONFLICT (github_id) DO UPDATE SET
                username = $2, planet_color = $3, planet_size_factor = $4, main_language = $5,
                language_stats = $6, total_commits = $7, last_updated = NOW(), achievements = $8
        `, [user.id, user.login, planetColor, planetSizeFactor, mainLanguage, languageStats, totalCommits, achievements]);
    }

    return { mainLanguage, planetColor, languageStats, totalCommits, planetSizeFactor, planetName, achievements };
}
// ▲▲▲ 共通関数 ▲▲▲


// --- ルート定義 ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ▼▼▼ 追加: Gemini APIテスト用エンドポイント ▼▼▼
app.get('/api/test-gemini', async (req, res) => {
    if (!process.env.GEMINI_API_KEY) {
        return res.json({ status: 'error', message: 'GEMINI_API_KEY が設定されていません。' });
    }

    try {
        const cleanApiKey = process.env.GEMINI_API_KEY.trim();
        const listModelsUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${cleanApiKey}`;
        const listRes = await axios.get(listModelsUrl);
        const allModels = listRes.data.models || [];

        let availableModels = allModels.filter(m =>
            m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent')
        );

        if (availableModels.length === 0) {
            return res.json({ status: 'error', message: '利用可能なモデルが見つかりませんでした。' });
        }

        // 優先順位付け
        availableModels.sort((a, b) => {
            const nA = a.name; const nB = b.name;
            if (nA.includes('1.5-flash') && !nB.includes('1.5-flash')) return -1;
            if (!nA.includes('1.5-flash') && nB.includes('1.5-flash')) return 1;
            return 0;
        });

        // 最も優先度の高いモデルでテスト生成
        const model = availableModels[0];
        const modelId = model.name.split('/').pop();
        const generateUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${cleanApiKey}`;

        const prompt = "Explain 'Hello World' in one short sentence.";
        const geminiRes = await axios.post(generateUrl, {
            contents: [{ parts: [{ text: prompt }] }]
        }, { headers: { 'Content-Type': 'application/json' } });

        const output = geminiRes.data.candidates?.[0]?.content?.parts?.[0]?.text;

        res.json({
            status: 'success',
            model_used: modelId,
            output: output,
            available_models_count: availableModels.length
        });

    } catch (e) {
        res.json({
            status: 'error',
            message: e.message,
            detail: e.response?.data || 'No details'
        });
    }
});
// ▲▲▲ 追加終了 ▲▲▲

app.get('/achievements', (req, res) => {
    res.sendFile(path.join(__dirname, 'achievements.html'));
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

        const planetData = await updateAndSavePlanetData(user, accessToken);

        req.session.github_token = accessToken;
        req.session.last_updated = Date.now();
        req.session.planetData = { user, planetData };

        res.redirect('/');

    } catch (error) {
        console.error('Login Error:', error.message);
        res.redirect('/');
    }
});

app.get('/api/me', async (req, res) => {
    if (!req.session.planetData) {
        return res.status(401).json({ error: 'Not logged in' });
    }

    if (req.session.github_token) {
        console.log('[Auto Update] データを更新中...');
        try {
            const user = req.session.planetData.user;
            const newPlanetData = await updateAndSavePlanetData(user, req.session.github_token);

            req.session.planetData.planetData = newPlanetData;
            req.session.last_updated = Date.now();
            console.log('[Auto Update] 更新完了');
        } catch (e) {
            console.error('[Auto Update] 更新失敗 (キャッシュを返します):', e.message);
        }
    } else {
        console.log('[Auto Update] トークンがないためスキップ');
    }

    res.json(req.session.planetData);
});

app.get('/api/planets/user/:username', async (req, res) => {
    if (!pool) return res.status(503).json({ error: 'DB unavailable' });
    try {
        const { username } = req.params;

        const result = await pool.query('SELECT * FROM planets WHERE username = $1', [username]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Planet not found' });
        }

        const row = result.rows[0];

        const totalCommits = parseInt(row.total_commits) || 0;
        const languageStats = row.language_stats || {};
        const hasStats = Object.keys(languageStats).length > 0;

        let mainLanguage = row.main_language;
        let planetColor = row.planet_color;

        if ((totalCommits === 0 || !hasStats) && mainLanguage !== 'Unknown') {
            mainLanguage = 'Unknown';
            planetColor = '#808080';
        }

        const planetName = generatePlanetName(mainLanguage, planetColor, totalCommits);

        const responseData = {
            username: row.username,
            planetColor: planetColor,
            planetSizeFactor: parseFloat(row.planet_size_factor),
            mainLanguage: mainLanguage,
            languageStats: languageStats,
            totalCommits: totalCommits,
            planetName: planetName,
            achievements: row.achievements || {}
        };

        res.json(responseData);
    } catch (e) {
        console.error('[API /user/:username Error]', e);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/api/planets/random', async (req, res) => {
    if (!pool) return res.status(503).json({ error: 'DB unavailable' });
    try {
        const loggedInUserId = req.session?.planetData?.user?.id;
        const lastRandomVisitedId = req.session?.lastRandomVisitedId;

        const excludeIds = [];
        if (loggedInUserId) {
            excludeIds.push(loggedInUserId);
        }
        if (lastRandomVisitedId) {
            excludeIds.push(lastRandomVisitedId);
        }

        let result;
        if (excludeIds.length > 0) {
            const placeholders = excludeIds.map((_, i) => `$${i + 1}`).join(', ');
            result = await pool.query(
                `SELECT * FROM planets WHERE github_id NOT IN (${placeholders}) ORDER BY RANDOM() LIMIT 1`,
                [...new Set(excludeIds)]
            );
        } else {
            result = await pool.query('SELECT * FROM planets ORDER BY RANDOM() LIMIT 1');
        }

        if (result.rows.length === 0) {
            let fallbackResult;
            if (loggedInUserId) {
                fallbackResult = await pool.query('SELECT * FROM planets WHERE github_id != $1 ORDER BY RANDOM() LIMIT 1', [loggedInUserId]);
            }
            if (!fallbackResult || fallbackResult.rows.length === 0) {
                fallbackResult = await pool.query('SELECT * FROM planets ORDER BY RANDOM() LIMIT 1');
            }

            if (fallbackResult.rows.length === 0) {
                return res.status(404).json({ error: 'No planets found' });
            }
            result = fallbackResult;
        }

        const row = result.rows[0];
        req.session.lastRandomVisitedId = row.github_id;

        const totalCommits = parseInt(row.total_commits) || 0;
        const languageStats = row.language_stats || {};
        const hasStats = Object.keys(languageStats).length > 0;

        let mainLanguage = row.main_language;
        let planetColor = row.planet_color;

        if ((totalCommits === 0 || !hasStats) && mainLanguage !== 'Unknown') {
            mainLanguage = 'Unknown';
            planetColor = '#808080';
        }

        const planetName = generatePlanetName(mainLanguage, planetColor, totalCommits);

        const responseData = {
            username: row.username,
            planetColor: planetColor,
            planetSizeFactor: parseFloat(row.planet_size_factor),
            mainLanguage: mainLanguage,
            languageStats: languageStats,
            totalCommits: totalCommits,
            planetName: planetName,
            achievements: row.achievements || {}
        };

        res.json(responseData);
    } catch (e) {
        console.error('[API /random Error]', e);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// ▼▼▼ 変更点: クリックできるURLを表示 ▼▼▼
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log(`http://localhost:${port}`);
    // ▼▼▼ 追加: テスト用URLの案内 ▼▼▼
    console.log(`Test Gemini API: http://localhost:${port}/api/test-gemini`);
    // ▲▲▲ 追加終了 ▲▲▲
});