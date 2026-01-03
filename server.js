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
// ▼▼▼ 追加: Socket.IO ▼▼▼
import { Server } from 'socket.io';
// ▲▲▲ 追加終了 ▲▲▲
// ▼▼▼ 追加: Puppeteer (撮影用) ▼▼▼
import puppeteer from 'puppeteer';
// ▲▲▲ 追加終了 ▲▲▲

// 2. Express の初期化
const app = express();
const port = process.env.PORT || 3000;

// ▼▼▼ 追加: Webhook用JSONパース ▼▼▼
app.use(express.json());
// ▲▲▲ 追加終了 ▲▲▲

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

// ▼▼▼ 言語カラー定義 (共有用) ▼▼▼
const LANGUAGE_COLORS = {
    JavaScript: '#f0db4f', TypeScript: '#007acc', Python: '#306998', HTML: '#e34c26', CSS: '#563d7c',
    Ruby: '#CC342D', Java: '#b07219', C: '#555555', 'C++': '#f34b7d', 'C#': '#178600',
    Go: '#00ADD8', Rust: '#dea584', PHP: '#4F5D95',
    Swift: '#F05138', Kotlin: '#A97BFF', Shell: '#89e051', Dart: '#00B4AB',
    Scala: '#c22d40', Perl: '#0298c3', Lua: '#000080', Haskell: '#5e5086',
    R: '#198CE7', Julia: '#a270ba', Vue: '#41b883', Dockerfile: '#384d54',
    Svelte: '#ff3e00', Elixir: '#6e4a7e', 'Objective-C': '#438eff', VimScript: '#199f4b'
};
// Geminiが生成した色を一時的にキャッシュする場所
const DYNAMIC_COLOR_CACHE = {};
// ▲▲▲ 言語カラー定義 ▲▲▲

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
      repositoriesContributedTo(first: 20, includeUserRepositories: false, contributionTypes: [COMMIT, PULL_REQUEST, PULL_REQUEST_REVIEW], orderBy: {field: PUSHED_AT, direction: DESC}) {
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
    const isLocalDatabase = connectionString.includes('@localhost') ||
        connectionString.includes('@127.0.0.1') ||
        connectionString.includes('@db');

    pool = new pg.Pool({
        connectionString: connectionString,
        ssl: isLocalDatabase ? undefined : { rejectUnauthorized: false }
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
    store: pool ? new PgSession({
        pool: pool,
        createTableIfMissing: true
    }) : undefined,
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


// ▼▼▼ Gemini共通関数 (モデル探索＆生成) ▼▼▼
async function askGemini(prompt) {
    if (!process.env.GEMINI_API_KEY) return null;
    const cleanApiKey = process.env.GEMINI_API_KEY.trim();

    try {
        const listModelsUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${cleanApiKey}`;
        const listRes = await axios.get(listModelsUrl);
        const allModels = listRes.data.models || [];

        const geminiModels = allModels.filter(m =>
            m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent')
        );

        if (geminiModels.length === 0) return null;

        // モデルを優先度順にソート (flash優先)
        geminiModels.sort((a, b) => {
            const nA = a.name; const nB = b.name;
            if (nA.includes('1.5-flash') && !nB.includes('1.5-flash')) return -1;
            if (!nA.includes('1.5-flash') && nB.includes('1.5-flash')) return 1;
            if (nA.includes('1.5-pro') && !nB.includes('1.5-pro')) return -1;
            if (!nA.includes('1.5-pro') && nB.includes('1.5-pro')) return 1;
            return 0;
        });

        // 順に試行
        for (const model of geminiModels) {
            const modelId = model.name.split('/').pop();
            try {
                const generateUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${cleanApiKey}`;
                const geminiRes = await axios.post(generateUrl, {
                    contents: [{ parts: [{ text: prompt }] }]
                }, { headers: { 'Content-Type': 'application/json' } });

                const text = geminiRes.data.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) {
                    return text.trim();
                }
            } catch (err) {
                console.warn(`[Gemini] スキップ (${modelId}): ${err.message}`);
            }
        }
    } catch (e) {
        console.error('[Gemini] 生成失敗:', e.message);
    }
    return null;
}
// ▲▲▲ Gemini共通関数 ▲▲▲


// ▼▼▼ AIによるカラー解決関数 (惑星・流星共通) ▼▼▼
async function resolveLanguageColor(language) {
    if (!language || language === 'Unknown') return '#808080';

    // 1. 定義済みリストにあるか
    if (LANGUAGE_COLORS[language]) {
        return LANGUAGE_COLORS[language];
    }

    // 2. キャッシュにあるか
    if (DYNAMIC_COLOR_CACHE[language]) {
        return DYNAMIC_COLOR_CACHE[language];
    }

    // 3. なければGeminiに聞く
    console.log(`[Color AI] 未知の言語 "${language}" の色を生成します...`);
    const prompt = `Programming language: ${language}. Provide a suitable hex color code (e.g., #ff0000) for this language. Return ONLY the hex code string.`;

    const text = await askGemini(prompt);
    if (text) {
        const match = text.match(/#[0-9a-fA-F]{6}/);
        if (match) {
            const color = match[0];
            DYNAMIC_COLOR_CACHE[language] = color; // キャッシュ保存
            console.log(`[Color AI] 生成完了: ${language} -> ${color}`);
            return color;
        }
    }

    // 失敗時はグレー
    return '#808080';
}
// ▲▲▲ AIによるカラー解決関数 ▲▲▲


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

        const ownedRepos = response.data.data.user.repositories.nodes || [];
        const contributedRepos = response.data.data.user.repositoriesContributedTo.nodes || [];
        repositories = [...ownedRepos, ...contributedRepos];

    } catch (e) {
        console.error('[GraphQL] データ取得失敗:', e.message);
        throw e;
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

    // ★修正: AIカラー解決関数を使用 (共通化してスッキリ)
    let planetColor = await resolveLanguageColor(mainLanguage);

    let planetSizeFactor = 1.0 + Math.min(1.0, Math.log10(Math.max(1, totalCommits)) / 2.5);
    planetSizeFactor = parseFloat(planetSizeFactor.toFixed(2));

    let planetName = generatePlanetName(mainLanguage, planetColor, totalCommits);

    // AI命名処理 (共通関数 askGemini を使用してスッキリ)
    if (process.env.GEMINI_API_KEY && (planetName.includes('未知の') || planetName.includes('神秘'))) {
        console.log(`[Gemini] 暫定名 "${planetName}" をかっこいい名前に修正します...`);
        let suffix = '星';
        if (totalCommits > 1000) suffix = '帝星';
        else if (totalCommits > 500) suffix = '巨星';

        const prompt = `Programming language: ${mainLanguage}. Color: ${planetColor}.
        Generate a cool Japanese planet name in the format: "[Adjective][ColorName]の${suffix}".
        The adjective should describe the nature of "${mainLanguage}". The color name should describe the color "${planetColor}".
        Example: "JavaScript" -> "柔軟な黄金の${suffix}".
        Return ONLY the name string.`;

        const aiName = await askGemini(prompt);
        if (aiName) {
            planetName = aiName.replace(/(\r\n|\n|\r)/gm, "");
        }
    }

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

// card.html へのルートも念のため明示
app.get('/card.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'card.html'));
});

// ▼▼▼ 修正: Webhook エンドポイント (AIカラー対応) ▼▼▼
app.post('/webhook', async (req, res) => {
    try {
        const payload = req.body;
        // GitHub Push Event
        if (payload && payload.repository) {
            const lang = payload.repository.language || 'Unknown';

            // ★修正: AIを使って色を解決 (リストにあれば即答、なければAI生成)
            // これにより「未知の言語」でもカラフルな流星が飛ぶようになります
            const color = await resolveLanguageColor(lang);

            console.log(`[Webhook] Commit detected! Language: ${lang}, Color: ${color}`);

            // 全クライアントに流星イベントを通知
            io.emit('meteor', { color: color, language: lang });
        }
        res.status(200).send('OK');
    } catch (e) {
        console.error('[Webhook Error]', e);
        res.status(500).send('Error');
    }
});
// ▲▲▲ 修正終了 ▲▲▲

// Gemini APIテスト用
app.get('/api/test-gemini', async (req, res) => {
    const output = await askGemini("Explain 'Hello World' in one short sentence.");
    res.json({
        status: output ? 'success' : 'error',
        output: output
    });
});

// 色生成デバッグ用
app.get('/api/debug-color/:lang', async (req, res) => {
    const mainLanguage = req.params.lang;
    const color = await resolveLanguageColor(mainLanguage);
    res.json({
        target_language: mainLanguage,
        generated_color: color
    });
});

// 名前生成デバッグ用 (簡易化)
app.get('/api/debug-name/:lang', async (req, res) => {
    const mainLanguage = req.params.lang;
    const planetColor = req.query.color || '#808080';
    const totalCommits = parseInt(req.query.commits || '100');

    let suffix = '星';
    if (totalCommits > 1000) suffix = '帝星';
    else if (totalCommits > 500) suffix = '巨星';

    const prompt = `Programming language: ${mainLanguage}. Color: ${planetColor}.
    Generate a cool Japanese planet name in the format: "[Adjective][ColorName]の${suffix}".
    The adjective should describe the nature of "${mainLanguage}". The color name should describe the color "${planetColor}".
    Example: "JavaScript" -> "柔軟な黄金の${suffix}".
    Return ONLY the name string.`;

    const generatedName = await askGemini(prompt);

    res.json({
        input_language: mainLanguage,
        input_color: planetColor,
        generated_name: generatedName || '生成失敗'
    });
});

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

// ▼▼▼ 追加: 画像生成 API (Puppeteer) ▼▼▼
app.get('/api/card/:username', async (req, res) => {
    const { username } = req.params;
    console.log(`[Card] Generating image for ${username}...`);

    let browser = null;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--no-zygote',
                '--single-process'
            ]
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 800, height: 400, deviceScaleFactor: 2 });

        const baseUrl = isProduction ? 'https://githubplanet.onrender.com' : `http://localhost:${port}`;
        const targetUrl = `${baseUrl}/card.html?username=${username}`;

        console.log(`[Card] Opening: ${targetUrl}`);

        await page.goto(targetUrl, { waitUntil: 'networkidle0', timeout: 15000 });

        try {
            await page.waitForSelector('#ready-signal', { timeout: 10000 });
        } catch (e) {
            console.warn('[Card] Warning: Ready signal timed out, taking screenshot anyway.');
        }

        const imageBuffer = await page.screenshot({
            clip: { x: 0, y: 0, width: 800, height: 400 },
            type: 'png'
        });

        await browser.close();
        browser = null;

        res.set('Content-Type', 'image/png');
        res.set('Cache-Control', 'public, max-age=86400');
        res.send(imageBuffer);

    } catch (e) {
        console.error('[Card Error]', e);
        if (browser) await browser.close();
        res.status(500).send('Error generating planet card');
    }
});
// ▲▲▲ 追加終了 ▲▲▲


const server = app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log(`http://localhost:${port}`);
    console.log(`Test Gemini API: http://localhost:${port}/api/test-gemini`);
});

const io = new Server(server);

io.on('connection', (socket) => {
    console.log('Client connected to socket');
});