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
import { createAuthoredLanguageHistoryService } from './src/application/authored-language-history-service.js';
import { createPlanetService } from './src/application/planet-service.js';
import { listShowcasePlanets } from './src/domain/planet/showcase-planets.js';
import { createLanguageColorService } from './src/application/language-color-service.js';
import { requestPlanetName } from './src/application/planet-name-generator.js';
import { createMeteorService } from './src/application/meteor-service.js';
import { createWebhookDeliveryService } from './src/application/webhook-delivery-service.js';
import { createWebhookWorker } from './src/infrastructure/realtime/webhook-worker.js';
import { LANGUAGE_COLORS } from './src/domain/planet/constants.js';
import { EXTENSION_MAP } from './src/domain/planet/language-extensions.js';
import { createAuthoredLanguageHistoryRepository } from './src/infrastructure/database/authored-language-history-repository.js';
import { createLanguageColorRepository } from './src/infrastructure/database/language-color-repository.js';
import { createWebhookDeliveryStore } from './src/infrastructure/database/webhook-delivery-store.js';
import { createPlanetRepository } from './src/infrastructure/database/planet-repository.js';
import { assertDatabaseMigrationsApplied } from './src/infrastructure/database/migrations.js';
import { createPostgresPool } from './src/infrastructure/database/postgres.js';
import { createGeminiClient } from './src/infrastructure/external/gemini-client.js';
import { createGithubClient } from './src/infrastructure/external/github-client.js';
import { registerAuthRoutes } from './src/presentation/http/auth-routes.js';
import { createCanonicalHostRedirect } from './src/presentation/http/canonical-host-redirect.js';
import { registerEventRoutes } from './src/presentation/http/event-routes.js';
import { registerPageRoutes } from './src/presentation/http/page-routes.js';
import { registerPlanetRoutes } from './src/presentation/http/planet-routes.js';
import { createRandomPerformanceReporter } from './src/presentation/http/random-performance.js';
import { createExternalPerformanceReporter } from './src/infrastructure/observability/external-performance.js';
import { createErrorHandler } from './src/presentation/http/error-handler.js';
import { safeErrorMetadata } from './src/shared/error-metadata.js';

const DATA_CACHE_DURATION = 60 * 60 * 1000;
const app = express();
const port = parseInt(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';
const sessionSecret = process.env.SESSION_SECRET;
if (isProduction && (!sessionSecret || sessionSecret === 'dev_secret')) {
    throw new Error('SESSION_SECRET must be configured in production and must not use the development placeholder');
}
const effectiveSessionSecret = sessionSecret || 'dev_secret';
const randomPerformance = createRandomPerformanceReporter({
    enabled: process.env.PERF_TRACE_RANDOM === 'true'
});
const externalPerformance = createExternalPerformanceReporter({
    enabled: process.env.PERF_TRACE_EXTERNAL === 'true'
});
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_PUBLIC_BASE_URL = 'https://githubplanet.dev';
const publicBaseUrl = (
    process.env.PUBLIC_BASE_URL || DEFAULT_PUBLIC_BASE_URL
).replace(/\/+$/, '');

app.disable('x-powered-by');
if (isProduction) app.set('trust proxy', 1);
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
        "connect-src 'self' ws: wss: https://githubplanet-git-e7ranic5ja-dt.a.run.app https://www.google-analytics.com https://region1.google-analytics.com",
        "object-src 'none'",
        "base-uri 'self'",
        "frame-ancestors 'none'"
    ].join('; '));
    if (isProduction) {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
});

// Firebase Hostingが付ける元ホストを使わないと、rewrite先のrun.appへ戻す転送ループになる。
app.use(createCanonicalHostRedirect({ publicBaseUrl, isProduction }));

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
    console.log('★ 本番環境の設定を使用します');
    githubClientId = process.env.GITHUB_CLIENT_ID;
    githubClientSecret = process.env.GITHUB_CLIENT_SECRET;
    callbackUrl = process.env.CALLBACK_URL || `${publicBaseUrl}/callback`;
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
await assertDatabaseMigrationsApplied(pool).catch((error) => {
    console.error('[DB] Startup migration check failed:', safeErrorMetadata(error));
    process.exit(1);
});
const planetRepository = createPlanetRepository(pool, {
    onRandomQueryTiming: randomPerformance.recordRandomQuery,
    randomQueryStrategy: process.env.RANDOM_QUERY_STRATEGY || 'indexed',
    randomSmallTableThreshold: Number.parseInt(
        process.env.RANDOM_QUERY_SMALL_TABLE_THRESHOLD || '256',
        10
    )
});
const languageColorStore = createLanguageColorRepository(pool);
const languageColorCache = await languageColorStore?.loadLanguageColorCache() || {};
const geminiClient = createGeminiClient({
    axios,
    apiKey: process.env.GEMINI_API_KEY,
    onRequestTiming: process.env.PERF_TRACE_EXTERNAL === 'true'
        ? externalPerformance.record
        : undefined
});
const languageColorService = createLanguageColorService({
    ask: geminiClient.ask, languageColors: LANGUAGE_COLORS, languageColorCache, languageColorStore
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
    languageColorService,
    geminiApiKey: process.env.GEMINI_API_KEY
});
const meteorService = createMeteorService({
    languageColorService,
    extensionMap: EXTENSION_MAP,
    emitMeteor: (payload) => io.emit('meteor', payload)
});
const webhookDeliveryService = pool ? createWebhookDeliveryService({
    store: createWebhookDeliveryStore(pool), meteorService
}) : undefined;
const webhookWorker = webhookDeliveryService ? createWebhookWorker({
    service: webhookDeliveryService,
    isActive: () => Boolean(io?.engine.clientsCount)
}) : undefined;
const planetQueryService = planetRepository ? createPlanetQueryService({
    repository: planetRepository,
    githubClient,
    planetService,
    cacheDuration: DATA_CACHE_DURATION
}) : undefined;
const authoredLanguageHistoryService = planetRepository ? createAuthoredLanguageHistoryService({
    repository: createAuthoredLanguageHistoryRepository(pool),
    githubClient
}) : undefined;

app.use('/front/img', express.static(path.join(__dirname, 'front/img'), { maxAge: '30d' }));
app.use('/front', express.static(path.join(__dirname, 'front'), { maxAge: 0 }));
app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules/three'), { maxAge: '30d' }));

const PgSession = connectPgSimple(session);
app.use(randomPerformance.beforeSessionMiddleware);
// Firebase Hostingのrewriteでは予約名以外のCookieがCloud Runへ渡らないため、本番OAuthのstateを維持する。
const sessionCookieName = isProduction ? '__session' : 'connect.sid';
app.use(session({
    name: sessionCookieName,
    store: pool ? new PgSession({
        pool,
        createTableIfMissing: false,
        errorLog: (_message, error) => console.error('[Session Store Error]', safeErrorMetadata(error))
    }) : undefined,
    secret: effectiveSessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: isProduction, httpOnly: true, sameSite: 'lax' }
}));
app.use(randomPerformance.middleware);

registerPageRoutes(app, {
    rootDirectory: __dirname,
    isProduction,
    systemApiKey: process.env.SYSTEM_API_KEY,
    sessionSecret: effectiveSessionSecret,
    publicBaseUrl,
    cardCaptureBaseUrl: process.env.PUBLIC_BASE_URL,
    showcasePages: listShowcasePlanets()
});
registerAuthRoutes(app, {
    githubClient,
    planetService,
    clientId: githubClientId,
    callbackUrl,
    sessionCookieName
});
registerPlanetRoutes(app, {
    planetService,
    planetQueryService,
    authoredLanguageHistoryService,
    // 一時停止する利用者を限定でき、DBの保存済み履歴は保持する。
    historyDisabledUsernames: (process.env.PLANET_HISTORY_DISABLED_USERNAMES || '')
        .split(',')
        .map((username) => username.trim().toLowerCase())
        .filter(Boolean),
    cacheDuration: DATA_CACHE_DURATION,
    randomHistoryStorage: process.env.RANDOM_HISTORY_STORAGE || 'cookie',
    randomPerformance
});

let io;
const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
if (isProduction && !webhookSecret) {
    console.error('[Webhook] GITHUB_WEBHOOK_SECRET is not configured; incoming webhooks will be rejected.');
}
registerEventRoutes(app, {
    generatePlanetName: (input) => requestPlanetName(geminiClient.ask, input),
    geminiClient,
    languageColorService,
    meteorService,
    systemApiKey: process.env.SYSTEM_API_KEY,
    webhookSecret,
    webhookDeliveryService,
    onWebhookAccepted: () => webhookWorker?.kick(),
    requireInternalAuth: isProduction,
    requireWebhookSignature: isProduction
});

// 404 handler
app.use((req, res) => {
    res.setHeader('X-Robots-Tag', 'noindex, follow');
    res.status(404).sendFile(path.join(__dirname, '404.html'));
});

app.use(createErrorHandler());

const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on port ${port}`);
});

// Cloud Run直URLへ切り替えたPollingフォールバックは、公開サイトのOriginだけ許可する。
io = new Server(server, { cors: { origin: publicBaseUrl } });
// CPUが抑制された後や別インスタンスで受信した仕事も、接続中のworkerがDBから回収する。
webhookWorker?.start();
// HTTPログの400だけでは拒否理由が分からないため、WebSocket失敗の必要項目だけ記録する。
io.engine.on('connection_error', (error) => {
    const request = error.req;
    const requestUrl = new URL(request?.url || '/', 'http://localhost');
    if (requestUrl.searchParams.get('transport') !== 'websocket') return;

    console.warn('[Socket.IO] WebSocket connection rejected', {
        code: Number.isInteger(error.code) && error.code >= 0 && error.code <= 6 ? error.code : 'unknown',
        transport: 'websocket'
    });
});
io.on('connection', (socket) => {
    webhookWorker?.kick();
    console.log('[Socket.IO] Client connected', {
        transport: socket.conn.transport.name
    });
});
