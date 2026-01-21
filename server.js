import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import crypto from 'crypto';
import axios from 'axios';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import pg from 'pg';
import connectPgSimple from 'connect-pg-simple';
import { Server } from 'socket.io';

const app = express();
const port = parseInt(process.env.PORT) || 3000;

// ★パフォーマンス: データのキャッシュ有効期限 (15分)
const DATA_CACHE_DURATION = 15 * 60 * 1000;

app.use(express.json());

const PgSession = connectPgSimple(session);

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
    CALLBACK_URL = `http://localhost:${port}/callback`;

    if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
        console.error('エラー: .envファイルに GITHUB_CLIENT_ID_LOCAL と GITHUB_CLIENT_SECRET_LOCAL を設定してください。');
    }
}

const LANGUAGE_COLORS = {
    JavaScript: '#f0db4f', TypeScript: '#007acc', Python: '#306998', HTML: '#e34c26', CSS: '#563d7c',
    Ruby: '#CC342D', Java: '#b07219', C: '#555555', 'C++': '#f34b7d', 'C#': '#178600',
    Go: '#00ADD8', Rust: '#dea584', PHP: '#4F5D95',
    Swift: '#F05138', Kotlin: '#A97BFF', Shell: '#89e051', Dart: '#00B4AB',
    Scala: '#c22d40', Perl: '#0298c3', Lua: '#000080', Haskell: '#5e5086',
    R: '#198CE7', Julia: '#a270ba', Vue: '#41b883', Dockerfile: '#384d54',
    Svelte: '#ff3e00', Elixir: '#6e4a7e', 'Objective-C': '#438eff', VimScript: '#199f4b'
};
const DYNAMIC_COLOR_CACHE = {};

const ACHIEVEMENTS = {
    FIRST_PLANET: { id: 'FIRST_PLANET', name: '最初の星', description: '初めての惑星を作成した。' },
    FIRST_COMMIT: { id: 'FIRST_COMMIT', name: '星の産声', description: '初めて活動を行った。' },
    VELOCITY_STAR: { id: 'VELOCITY_STAR', name: '光速の星', description: '爆発的な開発スピードで宇宙を駆け抜け、週間50コントリビューション以上を記録した。' },
    OS_CONTRIBUTOR: { id: 'OS_CONTRIBUTOR', name: '銀河の貢献者', description: '他の星系に文明をもたらし、他リポジトリへの貢献を果たした。' },
    STARGAZER: { id: 'STARGAZER', name: '星を見上げる者', description: '多くの輝きを知り、または自身が輝き、Star数10以上を達成した。' },
    POLYGLOT_PIONEER: { id: 'POLYGLOT_PIONEER', name: '多言語の開拓者', description: '多様な技術を操り、5種類以上の言語で彩り豊かな惑星を築き上げた。' },
    OCTOCAT_FRIEND: { id: 'OCTOCAT_FRIEND', name: '星界の盟友', description: '長い間この宇宙を旅し、登録から1年以上が経過した。' },

    COMMIT_100: { id: 'COMMIT_100', name: 'コントリビューション100', description: '累計活動数が100を超えた。' },
    COMMIT_500: { id: 'COMMIT_500', name: 'コントリビューション500', description: '累計活動数が500を超えた。' },
    COMMIT_1000: { id: 'COMMIT_1000', name: 'コントリビューション1000', description: '累計活動数が1000を超えた。' },
};

const USER_DATA_QUERY = `
  query($login: String!) {
    user(login: $login) {
      starredRepositories {
        totalCount
      }
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              contributionCount
              date
            }
          }
        }
      }
      repositories(first: 100, ownerAffiliations: OWNER, isFork: false, orderBy: {field: PUSHED_AT, direction: DESC}) {
        nodes {
          name
          stargazerCount
          languages(first: 5, orderBy: {field: SIZE, direction: DESC}) {
            edges {
              size
              node {
                name
                color
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
        }
      }
    }
  }
`;

const connectionString = process.env.DATABASE_URL;
let pool;
if (connectionString) {
    const isLocalDatabase = connectionString.includes('@localhost') ||
        connectionString.includes('@127.0.0.1') ||
        connectionString.includes('@db') ||
        connectionString.includes('localhost');

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
            last_updated TIMESTAMP DEFAULT NOW(),
            planet_name TEXT
        );
    `)
        .then(() => {
            console.log('[DB] planetsテーブルの準備ができました');
            return pool.query(`
                ALTER TABLE planets 
                ADD COLUMN IF NOT EXISTS achievements JSONB DEFAULT '{}'::jsonb;
            `);
        })
        .then(() => {
            return pool.query(`
                ALTER TABLE planets 
                ADD COLUMN IF NOT EXISTS planet_name TEXT;
            `);
        })
        .then(() => {
            return pool.query(`
                ALTER TABLE planets 
                ADD COLUMN IF NOT EXISTS weekly_commits INTEGER DEFAULT 0;
            `);
        })
        // ★パフォーマンス: インデックスを追加して検索を高速化
        .then(() => {
            return pool.query(`
                CREATE INDEX IF NOT EXISTS idx_planets_username ON planets(username);
            `);
        })
        .then(() => console.log('[DB] カラムとインデックスの準備ができました'))
        .catch(err => console.error('[DB] テーブル作成/接続に失敗しました (ローカルDBが起動していない可能性があります):', err.message));
} else {
    console.warn('[DB] データベース接続文字列(DATABASE_URL)が設定されていません。DB機能は無効になります。');
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ★パフォーマンス: 画像は長期キャッシュ (30日)
app.use('/front/img', express.static(path.join(__dirname, 'front/img'), {
    maxAge: '30d'
}));

// ★パフォーマンス: その他は標準キャッシュ (1日)
app.use('/front', express.static(path.join(__dirname, 'front'), {
    maxAge: '1d'
}));

if (isProduction) app.set('trust proxy', 1);

app.use(session({
    store: pool ? new PgSession({
        pool: pool,
        createTableIfMissing: true
    }) : undefined,
    secret: process.env.SESSION_SECRET || 'dev_secret',
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

function checkAchievements(existingAchievements, stats) {
    const newAchievements = { ...existingAchievements };
    const now = new Date().toISOString();

    const { totalCommits, weeklyCommits, languagesCount, hasContributedToOthers, totalStars, createdAt } = stats;

    if (!newAchievements[ACHIEVEMENTS.FIRST_PLANET.id]) {
        newAchievements[ACHIEVEMENTS.FIRST_PLANET.id] = { ...ACHIEVEMENTS.FIRST_PLANET, unlockedAt: now };
    }
    if (totalCommits >= 1 && !newAchievements[ACHIEVEMENTS.FIRST_COMMIT.id]) {
        newAchievements[ACHIEVEMENTS.FIRST_COMMIT.id] = { ...ACHIEVEMENTS.FIRST_COMMIT, unlockedAt: now };
    }
    if (weeklyCommits >= 50 && !newAchievements[ACHIEVEMENTS.VELOCITY_STAR.id]) {
        newAchievements[ACHIEVEMENTS.VELOCITY_STAR.id] = { ...ACHIEVEMENTS.VELOCITY_STAR, unlockedAt: now };
    }
    if (hasContributedToOthers && !newAchievements[ACHIEVEMENTS.OS_CONTRIBUTOR.id]) {
        newAchievements[ACHIEVEMENTS.OS_CONTRIBUTOR.id] = { ...ACHIEVEMENTS.OS_CONTRIBUTOR, unlockedAt: now };
    }
    if (totalStars >= 10 && !newAchievements[ACHIEVEMENTS.STARGAZER.id]) {
        newAchievements[ACHIEVEMENTS.STARGAZER.id] = { ...ACHIEVEMENTS.STARGAZER, unlockedAt: now };
    }
    if (languagesCount >= 5 && !newAchievements[ACHIEVEMENTS.POLYGLOT_PIONEER.id]) {
        newAchievements[ACHIEVEMENTS.POLYGLOT_PIONEER.id] = { ...ACHIEVEMENTS.POLYGLOT_PIONEER, unlockedAt: now };
    }
    if (createdAt) {
        const diffTime = Math.abs(new Date() - new Date(createdAt));
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays >= 365 && !newAchievements[ACHIEVEMENTS.OCTOCAT_FRIEND.id]) {
            newAchievements[ACHIEVEMENTS.OCTOCAT_FRIEND.id] = { ...ACHIEVEMENTS.OCTOCAT_FRIEND, unlockedAt: now };
        }
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

        geminiModels.sort((a, b) => {
            const nA = a.name; const nB = b.name;
            if (nA.includes('1.5-flash') && !nB.includes('1.5-flash')) return -1;
            if (!nA.includes('1.5-flash') && nB.includes('1.5-flash')) return 1;
            return 0;
        });

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

async function resolveLanguageColor(language) {
    if (!language || language === 'Unknown') return '#808080';
    if (LANGUAGE_COLORS[language]) {
        return LANGUAGE_COLORS[language];
    }
    if (DYNAMIC_COLOR_CACHE[language]) {
        return DYNAMIC_COLOR_CACHE[language];
    }
    console.log(`[Color AI] 未知の言語 "${language}" の色を生成します...`);
    const prompt = `Programming language: ${language}. Provide a suitable hex color code (e.g., #ff0000) for this language. Return ONLY the hex code string.`;

    const text = await askGemini(prompt);
    if (text) {
        const match = text.match(/#[0-9a-fA-F]{6}/);
        if (match) {
            const color = match[0];
            DYNAMIC_COLOR_CACHE[language] = color;
            console.log(`[Color AI] 生成完了: ${language} -> ${color}`);
            return color;
        }
    }
    return '#808080';
}

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

async function updateAndSavePlanetData(user, accessToken) {
    console.log(`[GraphQL] Fetching data for user: ${user.login}`);

    let repositories = [];
    let starredCount = 0;

    // ★修正: 変数のスコープエラー対策
    let contributedRepos = [];
    let totalCommits = 0;
    let weeklyCommits = 0;

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

        const userData = response.data.data.user;
        const ownedRepos = userData.repositories.nodes || [];
        // ★修正: ここで代入
        contributedRepos = userData.repositoriesContributedTo.nodes || [];
        repositories = [...ownedRepos, ...contributedRepos];

        starredCount = userData.starredRepositories ? userData.starredRepositories.totalCount : 0;

        if (userData.contributionsCollection && userData.contributionsCollection.contributionCalendar) {
            const calendar = userData.contributionsCollection.contributionCalendar;
            totalCommits = calendar.totalContributions || 0;

            const oneWeekAgo = new Date();
            oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

            if (calendar.weeks) {
                for (const week of calendar.weeks) {
                    for (const day of week.contributionDays) {
                        const date = new Date(day.date);
                        if (date >= oneWeekAgo) {
                            weeklyCommits += day.contributionCount;
                        }
                    }
                }
            }
        }

    } catch (e) {
        console.error('[GraphQL] データ取得失敗:', e.message);
        throw e;
    }

    const languageStats = {};
    let receivedStars = 0;

    for (const repo of repositories) {
        if (repo.languages && repo.languages.edges) {
            for (const edge of repo.languages.edges) {
                const langName = edge.node.name;
                const size = edge.size;
                languageStats[langName] = (languageStats[langName] || 0) + size;
            }
        }

        if (repo.stargazerCount) {
            receivedStars += repo.stargazerCount;
        }
    }

    // ★修正: エラー回避
    const hasContributedToOthers = contributedRepos.length > 0;

    const languagesCount = Object.keys(languageStats).length;
    const totalStars = starredCount + receivedStars;

    let mainLanguage = 'Unknown';
    let maxBytes = 0;
    for (const [lang, bytes] of Object.entries(languageStats)) {
        if (bytes > maxBytes) { maxBytes = bytes; mainLanguage = lang; }
    }

    let planetColor = await resolveLanguageColor(mainLanguage);

    let planetSizeFactor = 1.0 + Math.min(1.0, Math.log10(Math.max(1, totalCommits)) / 2.5);
    planetSizeFactor = parseFloat(planetSizeFactor.toFixed(2));

    let planetName = generatePlanetName(mainLanguage, planetColor, totalCommits);

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

        const stats = {
            totalCommits,
            weeklyCommits,
            languagesCount,
            hasContributedToOthers,
            totalStars,
            createdAt: user.created_at
        };

        achievements = checkAchievements(existingAchievements, stats);

        await pool.query(`
            INSERT INTO planets (github_id, username, planet_color, planet_size_factor, main_language, language_stats, total_commits, last_updated, achievements, planet_name, weekly_commits)
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9, $10)
            ON CONFLICT (github_id) DO UPDATE SET
                username = $2, planet_color = $3, planet_size_factor = $4, main_language = $5,
                language_stats = $6, total_commits = $7, last_updated = NOW(), achievements = $8, planet_name = $9, weekly_commits = $10
        `, [user.id, user.login, planetColor, planetSizeFactor, mainLanguage, languageStats, totalCommits, achievements, planetName, weeklyCommits]);
    }

    return { mainLanguage, planetColor, languageStats, totalCommits, weeklyCommits, planetSizeFactor, planetName, achievements };
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/card.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'card.html'));
});

app.post('/webhook', async (req, res) => {
    try {
        const payload = req.body;
        if (payload && payload.repository) {
            const lang = payload.repository.language || 'Unknown';
            const color = await resolveLanguageColor(lang);
            console.log(`[Webhook] Commit detected! Language: ${lang}, Color: ${color}`);
            io.emit('meteor', { color: color, language: lang });
        }
        res.status(200).send('OK');
    } catch (e) {
        console.error('[Webhook Error]', e);
        res.status(500).send('Error');
    }
});

app.get('/api/test-gemini', async (req, res) => {
    const output = await askGemini("Explain 'Hello World' in one short sentence.");
    res.json({
        status: output ? 'success' : 'error',
        output: output
    });
});

app.get('/api/debug-color/:lang', async (req, res) => {
    const mainLanguage = req.params.lang;
    const color = await resolveLanguageColor(mainLanguage);
    res.json({
        target_language: mainLanguage,
        generated_color: color
    });
});

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
    // ★重要: プライベートリポジトリも取得するため repo を指定
    authUrl.searchParams.set('scope', 'user:email repo');
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

    const lastUpdated = req.session.last_updated;
    const isStale = !lastUpdated || (Date.now() - lastUpdated > DATA_CACHE_DURATION);

    if (req.session.github_token && isStale) {
        console.log('[Auto Update] データを更新中... (キャッシュ切れ)');
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
        console.log('[Auto Update] キャッシュ有効のためスキップ');
    }

    res.json(req.session.planetData);
});

app.get('/api/planets/user/:username', async (req, res) => {
    if (!pool) return res.status(503).json({ error: 'DB unavailable' });
    try {
        const { username } = req.params;

        let row;
        const result = await pool.query('SELECT * FROM planets WHERE username = $1', [username]);
        if (result.rows.length > 0) {
            row = result.rows[0];
        }

        let shouldUpdate = false;
        if (req.session.github_token) {
            if (!row) {
                shouldUpdate = true;
            } else if (row.last_updated) {
                const lastUpdatedTime = new Date(row.last_updated).getTime();
                if (Date.now() - lastUpdatedTime > DATA_CACHE_DURATION) {
                    shouldUpdate = true;
                }
            }
        }

        if (shouldUpdate) {
            try {
                const targetUserRes = await axios.get(`https://api.github.com/users/${username}`, {
                    headers: { 'Authorization': `Bearer ${req.session.github_token}` }
                });
                const targetUser = targetUserRes.data;

                await updateAndSavePlanetData(targetUser, req.session.github_token);

                const newResult = await pool.query('SELECT * FROM planets WHERE username = $1', [username]);
                if (newResult.rows.length > 0) {
                    row = newResult.rows[0];
                }
            } catch (e) {
                console.warn(`[Visit Update] Failed to update ${username}: ${e.message}`);
            }
        }

        if (!row) {
            return res.status(404).json({ error: 'Planet not found' });
        }

        const totalCommits = parseInt(row.total_commits) || 0;
        const languageStats = row.language_stats || {};
        const hasStats = Object.keys(languageStats).length > 0;

        let mainLanguage = row.main_language;
        let planetColor = row.planet_color;

        if ((totalCommits === 0 || !hasStats) && mainLanguage !== 'Unknown') {
            mainLanguage = 'Unknown';
            planetColor = '#808080';
        }

        const planetName = row.planet_name || generatePlanetName(mainLanguage, planetColor, totalCommits);

        const responseData = {
            username: row.username,
            planetColor: planetColor,
            planetSizeFactor: parseFloat(row.planet_size_factor),
            mainLanguage: mainLanguage,
            languageStats: languageStats,
            totalCommits: totalCommits,
            weeklyCommits: row.weekly_commits || 0,
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

        let row = result.rows[0];
        req.session.lastRandomVisitedId = row.github_id;

        if (req.session.github_token) {
            let shouldUpdate = false;
            if (row.last_updated) {
                const lastUpdatedTime = new Date(row.last_updated).getTime();
                if (Date.now() - lastUpdatedTime > DATA_CACHE_DURATION) {
                    shouldUpdate = true;
                }
            } else {
                shouldUpdate = true;
            }

            if (shouldUpdate) {
                (async () => {
                    try {
                        console.log(`[Random/Background] Updating stale data for: ${row.username}`);
                        const targetUserRes = await axios.get(`https://api.github.com/users/${row.username}`, {
                            headers: { 'Authorization': `Bearer ${req.session.github_token}` }
                        });
                        await updateAndSavePlanetData(targetUserRes.data, req.session.github_token);
                    } catch (e) {
                        console.warn(`[Random/Background] Update failed: ${e.message}`);
                    }
                })();
            }
        }

        const totalCommits = parseInt(row.total_commits) || 0;
        const languageStats = row.language_stats || {};
        const hasStats = Object.keys(languageStats).length > 0;

        let mainLanguage = row.main_language;
        let planetColor = row.planet_color;

        if ((totalCommits === 0 || !hasStats) && mainLanguage !== 'Unknown') {
            mainLanguage = 'Unknown';
            planetColor = '#808080';
        }

        const planetName = row.planet_name || generatePlanetName(mainLanguage, planetColor, totalCommits);

        const responseData = {
            username: row.username,
            planetColor: planetColor,
            planetSizeFactor: parseFloat(row.planet_size_factor),
            mainLanguage: mainLanguage,
            languageStats: languageStats,
            totalCommits: totalCommits,
            weeklyCommits: row.weekly_commits || 0,
            planetName: planetName,
            achievements: row.achievements || {}
        };

        res.json(responseData);
    } catch (e) {
        console.error('[API /random Error]', e);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/api/card/:username', (req, res) => {
    const { username } = req.params;

    let protocol = req.headers['x-forwarded-proto'] || req.protocol;
    if (req.get('host') && req.get('host').includes('onrender.com')) {
        protocol = 'https';
    }

    const host = req.headers['x-forwarded-host'] || req.get('host');
    const timestamp = Date.now();
    const targetUrl = `${protocol}://${host}/card.html?username=${username}&ts=${timestamp}`;

    console.log(`[Card] Redirecting generation for: ${targetUrl}`);

    const screenshotServiceUrl = `https://image.thum.io/get/width/800/crop/400/noanimate/wait/8/${targetUrl}`;

    res.redirect(screenshotServiceUrl);
});

const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on port ${port}`);
});

const io = new Server(server);

io.on('connection', (socket) => {
    console.log('Client connected to socket');
});