import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';
import connectPgSimple from 'connect-pg-simple';
import { Server } from 'socket.io';
import { createPlanetQueryService } from './src/application/planet-query-service.js';
import { createPlanetService } from './src/application/planet-service.js';
import { DATA_CACHE_DURATION, EXTENSION_MAP, LANGUAGE_COLORS } from './src/domain/planet/constants.js';
import { createPlanetRepository } from './src/infrastructure/database/planet-repository.js';
import { createPostgresPool, prepareDatabase } from './src/infrastructure/database/postgres.js';
import { createGeminiClient } from './src/infrastructure/external/gemini-client.js';
import { createGithubClient } from './src/infrastructure/external/github-client.js';
import { registerAuthRoutes } from './src/presentation/http/auth-routes.js';
import { registerEventRoutes } from './src/presentation/http/event-routes.js';
import { registerPageRoutes } from './src/presentation/http/page-routes.js';
import { registerPlanetRoutes } from './src/presentation/http/planet-routes.js';

const app = express();
const port = parseInt(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use((req, res, next) => {
    const host = req.headers.host || '';
    if (host.includes('githubplanet.onrender.com')) {
        return res.redirect(301, 'https://githubplanet-git-543426763451.asia-northeast2.run.app' + req.originalUrl);
    }
    next();
});

app.use(express.json({ limit: '50mb' }));

let githubClientId;
let githubClientSecret;
let callbackUrl;

if (isProduction) {
    console.log('★ 本番環境(Render)の設定を使用します');
    githubClientId = process.env.GITHUB_CLIENT_ID;
    githubClientSecret = process.env.GITHUB_CLIENT_SECRET;
    callbackUrl = process.env.CALLBACK_URL || 'https://githubplanet.onrender.com/callback';
} else {
    console.log('★ ローカル環境の設定を使用します');
    githubClientId = process.env.GITHUB_CLIENT_ID_LOCAL;
    githubClientSecret = process.env.GITHUB_CLIENT_SECRET_LOCAL;
    callbackUrl = `http://localhost:${port}/callback`;

    if (!githubClientId || !githubClientSecret) {
        console.error('エラー: .envファイルに GITHUB_CLIENT_ID_LOCAL と GITHUB_CLIENT_SECRET_LOCAL を設定してください。');
    }
}

const pool = createPostgresPool(process.env.DATABASE_URL);
await prepareDatabase(pool);
const planetRepository = createPlanetRepository(pool);
const geminiClient = createGeminiClient({
    axios,
    apiKey: process.env.GEMINI_API_KEY,
    languageColors: LANGUAGE_COLORS
});
const githubClient = createGithubClient({
    axios,
    clientId: githubClientId,
    clientSecret: githubClientSecret,
    callbackUrl
});
const planetService = createPlanetService({
    repository: planetRepository,
    githubClient,
    geminiClient,
    geminiApiKey: process.env.GEMINI_API_KEY
});
const planetQueryService = planetRepository ? createPlanetQueryService({
    repository: planetRepository,
    githubClient,
    planetService,
    cacheDuration: DATA_CACHE_DURATION
}) : undefined;

app.use('/front/img', express.static(path.join(__dirname, 'front/img'), { maxAge: '30d' }));
app.use('/front', express.static(path.join(__dirname, 'front'), { maxAge: 0 }));
app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules/three'), { maxAge: '30d' }));

if (isProduction) app.set('trust proxy', 1);

const PgSession = connectPgSimple(session);
app.use(session({
    store: pool ? new PgSession({ pool, createTableIfMissing: true }) : undefined,
    secret: process.env.SESSION_SECRET || 'dev_secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: isProduction, httpOnly: true, sameSite: 'lax' }
}));

registerPageRoutes(app, {
    rootDirectory: __dirname,
    isProduction,
    systemApiKey: process.env.SYSTEM_API_KEY,
    sessionSecret: process.env.SESSION_SECRET || 'dev_secret'
});
registerAuthRoutes(app, {
    githubClient,
    planetService,
    clientId: githubClientId,
    callbackUrl
});
registerPlanetRoutes(app, {
    planetService,
    planetQueryService,
    cacheDuration: DATA_CACHE_DURATION
});

let io;
registerEventRoutes(app, {
    geminiClient,
    extensionMap: EXTENSION_MAP,
    emitMeteor: (payload) => io.emit('meteor', payload)
});

const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on port ${port}`);
});

io = new Server(server);
io.on('connection', () => {
    console.log('Client connected to socket');
});
