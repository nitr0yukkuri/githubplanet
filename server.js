import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import axios from 'axios';
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';
import connectPgSimple from 'connect-pg-simple';
import { Server } from 'socket.io';
import { createPlanetQueryService } from './src/application/planet-query-service.js';
import { createPlanetService } from './src/application/planet-service.js';
import { DATA_CACHE_DURATION, EXTENSION_MAP, LANGUAGE_COLORS } from './src/domain/planet/constants.js';
import { createPlanetRepository } from './src/infrastructure/database/planet-repository.js';
import { assertDatabaseMigrationsApplied } from './src/infrastructure/database/migrations.js';
import { createPostgresPool } from './src/infrastructure/database/postgres.js';
import { createGeminiClient } from './src/infrastructure/external/gemini-client.js';
import { createGithubClient } from './src/infrastructure/external/github-client.js';
import { registerAuthRoutes } from './src/presentation/http/auth-routes.js';
import { registerEventRoutes } from './src/presentation/http/event-routes.js';
import { registerPageRoutes } from './src/presentation/http/page-routes.js';
import { registerPlanetRoutes } from './src/presentation/http/planet-routes.js';
import { createRandomPerformanceReporter } from './src/presentation/http/random-performance.js';
import { createExternalPerformanceReporter } from './src/infrastructure/observability/external-performance.js';

const app = express();
const port = parseInt(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';
const randomPerformance = createRandomPerformanceReporter({
    enabled: process.env.PERF_TRACE_RANDOM === 'true'
});
const externalPerformance = createExternalPerformanceReporter({
    enabled: process.env.PERF_TRACE_EXTERNAL === 'true'
});
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.disable('x-powered-by');
app.use(randomPerformance.startMiddleware);
app.use(compression({ threshold: 1024 }));
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy', [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://www.googletagmanager.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        "img-src 'self' data: https://image.thum.io",
        "connect-src 'self' ws: wss: https://www.google-analytics.com https://region1.google-analytics.com",
        "object-src 'none'",
        "base-uri 'self'",
        "frame-ancestors 'none'"
    ].join('; '));
    if (isProduction) {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
});

app.use((req, res, next) => {
    const host = req.headers.host || '';
    if (host.includes('githubplanet.onrender.com')) {
        return res.redirect(301, 'https://githubplanet-git-543426763451.asia-northeast2.run.app' + req.originalUrl);
    }
    next();
});

app.use(express.json({
    limit: '50mb',
    verify: (req, res, buffer) => {
        req.rawBody = Buffer.from(buffer);
    }
}));

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
// 複数インスタンスが起動時に同じDDLを実行する事故を防ぐため、ここでは適用確認だけを行う。
await assertDatabaseMigrationsApplied(pool);
const planetRepository = createPlanetRepository(pool, {
    onRandomQueryTiming: randomPerformance.recordRandomQuery,
    randomQueryStrategy: process.env.RANDOM_QUERY_STRATEGY || 'auto',
    randomSmallTableThreshold: Number.parseInt(
        process.env.RANDOM_QUERY_SMALL_TABLE_THRESHOLD || '256',
        10
    )
});
await planetRepository?.initializeRandomQueryStrategy?.();
const languageColorCache = await planetRepository?.loadLanguageColorCache?.() || {};
const languageColorStore = planetRepository ? {
    findLanguageColor: (...args) => planetRepository.findLanguageColor(...args),
    saveLanguageColor: (...args) => planetRepository.saveLanguageColor(...args)
} : undefined;
const geminiClient = createGeminiClient({
    axios,
    apiKey: process.env.GEMINI_API_KEY,
    languageColors: LANGUAGE_COLORS,
    languageColorCache,
    languageColorStore,
    onRequestTiming: process.env.PERF_TRACE_EXTERNAL === 'true'
        ? externalPerformance.record
        : undefined
});
const githubClient = createGithubClient({
    axios,
    clientId: githubClientId,
    clientSecret: githubClientSecret,
    callbackUrl,
    onRequestTiming: process.env.PERF_TRACE_EXTERNAL === 'true'
        ? externalPerformance.record
        : undefined
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
app.use(randomPerformance.beforeSessionMiddleware);
app.use(session({
    store: pool ? new PgSession({ pool, createTableIfMissing: false }) : undefined,
    secret: process.env.SESSION_SECRET || 'dev_secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: isProduction, httpOnly: true, sameSite: 'lax' }
}));
app.use(randomPerformance.middleware);

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
    cacheDuration: DATA_CACHE_DURATION,
    randomHistoryStorage: process.env.RANDOM_HISTORY_STORAGE || 'cookie',
    randomPerformance
});

let io;
const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
if (isProduction && !webhookSecret) {
    console.warn('[Webhook] GITHUB_WEBHOOK_SECRET is not configured; signature verification is disabled.');
}
registerEventRoutes(app, {
    geminiClient,
    extensionMap: EXTENSION_MAP,
    emitMeteor: (payload) => io.emit('meteor', payload),
    systemApiKey: process.env.SYSTEM_API_KEY,
    webhookSecret,
    requireInternalAuth: isProduction,
    requireWebhookSignature: isProduction && Boolean(webhookSecret)
});

// 404 handler
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, '404.html'));
});

const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on port ${port}`);
});

io = new Server(server);
io.on('connection', () => {
    console.log('Client connected to socket');
});
