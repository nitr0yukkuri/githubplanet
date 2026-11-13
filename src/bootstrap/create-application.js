import { createApplicationServices } from './create-application-services.js';
import express from 'express';
import session from 'express-session';
import axios from 'axios';
import compression from 'compression';
import path from 'path';
import { randomBytes } from 'node:crypto';
import connectPgSimple from 'connect-pg-simple';
import { listShowcasePlanets } from '../domain/planet/showcase-planets.js';
import { requestPlanetName } from '../application/planet-name-generator.js';
import { createWebhookDeliveryStore } from '../infrastructure/database/webhook-delivery-store.js';
import { registerAuthRoutes } from '../presentation/http/auth-routes.js';
import { createCanonicalHostRedirect } from '../presentation/http/canonical-host-redirect.js';
import { registerEventRoutes } from '../presentation/http/event-routes.js';
import { registerPageRoutes } from '../presentation/http/page-routes.js';
import { registerPlanetRoutes } from '../presentation/http/planet-routes.js';
import { createRandomPerformanceReporter } from '../presentation/http/random-performance.js';
import { createExternalPerformanceReporter } from '../infrastructure/observability/external-performance.js';
import { createErrorHandler } from '../presentation/http/error-handler.js';
import { safeErrorMetadata } from '../shared/error-metadata.js';

export function assertRuntimeConfiguration(env) {
    if (!['development', 'test', 'production'].includes(env.NODE_ENV)) {
        throw new Error('NODE_ENV must be explicitly set to development, test, or production');
    }
    if (env.NODE_ENV === 'production' && (!env.SESSION_SECRET || env.SESSION_SECRET === 'dev_secret')) {
        throw new Error('SESSION_SECRET must be configured in production and must not use the development placeholder');
    }
}

export function createApplication({
    env = process.env, pool, rootDirectory, httpClient = axios, languageColorCache = {},
    emitMeteor, readPublicFile, realtime, serveStaticAssets = true, disableSessionPruning = false, compressResponses = true,
    sessionStore, enqueueWebhook, enqueueHistoryScan, createMeRateLimit, requireSecureAuth = false, logRuntimeConfiguration = true, queryCaches, modelListCache, services
}) {
    const DATA_CACHE_DURATION = 60 * 60 * 1000;
    const app = express();
    const port = parseInt(env.PORT) || 3000;
    const runtimeEnvironment = env.NODE_ENV;
    assertRuntimeConfiguration(env);
    const isProduction = runtimeEnvironment === 'production';
    const sessionSecret = env.SESSION_SECRET;
    const effectiveSessionSecret = sessionSecret || 'dev_secret';
    const randomPerformance = createRandomPerformanceReporter({
        enabled: env.PERF_TRACE_RANDOM === 'true'
    });
    const externalPerformance = createExternalPerformanceReporter({
        enabled: env.PERF_TRACE_EXTERNAL === 'true'
    });
    const DEFAULT_PUBLIC_BASE_URL = 'https://githubplanet.dev';
    const publicBaseUrl = (
        env.PUBLIC_BASE_URL || DEFAULT_PUBLIC_BASE_URL
    ).replace(/\/+$/, '');

    app.disable('x-powered-by');
    if (isProduction) app.set('trust proxy', 1);
    app.use(randomPerformance.startMiddleware);
    if (compressResponses) app.use(compression({ threshold: 1024 }));
    app.use((req, res, next) => {
        const scriptNonce = randomBytes(18).toString('base64');
        req.cspNonce = scriptNonce;
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
        res.setHeader('Content-Security-Policy', [
            "default-src 'self'",
            `script-src 'self' 'nonce-${scriptNonce}' https://cdn.jsdelivr.net https://www.googletagmanager.com`,
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

    // 署名検証用の本文保存と大きい上限はWebhookだけに限定し、通常APIのメモリ消費を抑える。
    app.use('/webhook', express.json({
        limit: '25mb',
        verify: (req, res, buffer) => {
            req.rawBody = buffer;
        }
    }));
    app.use(express.json({ limit: '1mb' }));

    let githubClientId;
    let githubClientSecret;
    let callbackUrl;

    if (isProduction) {
        if (logRuntimeConfiguration) console.log('★ 本番環境の設定を使用します');
        githubClientId = env.GITHUB_CLIENT_ID;
        githubClientSecret = env.GITHUB_CLIENT_SECRET;
        callbackUrl = env.CALLBACK_URL || `${publicBaseUrl}/callback`;
    } else {
        if (logRuntimeConfiguration) console.log('★ ローカル環境の設定を使用します');
        githubClientId = env.GITHUB_CLIENT_ID_LOCAL;
        githubClientSecret = env.GITHUB_CLIENT_SECRET_LOCAL;
        callbackUrl = env.CALLBACK_URL || `http://localhost:${port}/callback`;

        if (!githubClientId || !githubClientSecret) {
            console.error('エラー: .envファイルに GITHUB_CLIENT_ID_LOCAL と GITHUB_CLIENT_SECRET_LOCAL を設定してください。');
        }
    }

    const createServices = (overrides = {}) => createApplicationServices({
        env, pool, httpClient, languageColorCache, emitMeteor, queryCaches, modelListCache,
        githubClientId, githubClientSecret, callbackUrl, cacheDuration: DATA_CACHE_DURATION,
        onRandomQueryTiming: randomPerformance.recordRandomQuery,
        onRequestTiming: env.PERF_TRACE_EXTERNAL === 'true' ? externalPerformance.record : undefined,
        ...overrides
    });
    const { githubClient, geminiClient, languageColorService, planetService, meteorService,
        planetQueryService, authoredLanguageHistoryService } = services || createServices();

    if (serveStaticAssets) app.use('/front/img', express.static(path.join(rootDirectory, 'front/img'), { maxAge: '30d' }));
    if (serveStaticAssets) app.use('/front', express.static(path.join(rootDirectory, 'front'), { maxAge: 0 }));
    if (serveStaticAssets) {
        // パッケージのディレクトリ全体を公開せず、カードが読み込む2つの公開JSだけを配信する。
        app.get('/vendor/three/build/three.module.js', (_req, res) => {
            res.sendFile(path.join(rootDirectory, 'node_modules/three/build/three.module.js'), { maxAge: '30d' });
        });
        app.get('/vendor/three/examples/jsm/controls/OrbitControls.js', (_req, res) => {
            res.sendFile(path.join(rootDirectory, 'node_modules/three/examples/jsm/controls/OrbitControls.js'), { maxAge: '30d' });
        });
    }

    const PgSession = connectPgSimple(session);
    app.use(randomPerformance.beforeSessionMiddleware);
    // Firebase Hostingのrewriteでは予約名以外のCookieがCloud Runへ渡らないため、本番OAuthのstateを維持する。
    const sessionCookieName = isProduction ? '__session' : 'connect.sid';
    app.use(session({
        name: sessionCookieName,
        store: sessionStore || (pool ? new PgSession({
            pool,
            createTableIfMissing: false,
            ...(disableSessionPruning ? { pruneSessionInterval: false } : {}),
            errorLog: (_message, error) => console.error('[Session Store Error]', safeErrorMetadata(error))
        }) : undefined),
        secret: effectiveSessionSecret,
        resave: false,
        saveUninitialized: false,
        cookie: { secure: isProduction, httpOnly: true, sameSite: 'lax' }
    }));
    app.use(randomPerformance.middleware);

    const pageRoutes = registerPageRoutes(app, {
        rootDirectory: rootDirectory,
        isProduction,
        systemApiKey: env.SYSTEM_API_KEY,
        sessionSecret: effectiveSessionSecret,
        publicBaseUrl,
        cardCaptureBaseUrl: env.PUBLIC_BASE_URL,
        showcasePages: listShowcasePlanets(),
        readPublicFile,
        realtime
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
        enqueueHistoryScan,
        createMeRateLimit,
        // 一時停止する利用者を限定でき、DBの保存済み履歴は保持する。
        historyDisabledUsernames: (env.PLANET_HISTORY_DISABLED_USERNAMES || '')
            .split(',')
            .map((username) => username.trim().toLowerCase())
            .filter(Boolean),
        cacheDuration: DATA_CACHE_DURATION,
        randomHistoryStorage: env.RANDOM_HISTORY_STORAGE || 'cookie',
        randomPerformance
    });

    const webhookSecret = env.GITHUB_WEBHOOK_SECRET;
    if (isProduction && !webhookSecret) {
        console.error('[Webhook] GITHUB_WEBHOOK_SECRET is not configured; incoming webhooks will be rejected.');
    }
    registerEventRoutes(app, {
        generatePlanetName: (input) => requestPlanetName(geminiClient.ask, input),
        geminiClient,
        languageColorService,
        meteorService,
        systemApiKey: env.SYSTEM_API_KEY,
        webhookSecret,
        webhookDeliveryStore: enqueueWebhook ? undefined : createWebhookDeliveryStore(pool),
        enqueueWebhook,
        requireInternalAuth: isProduction || requireSecureAuth,
        requireWebhookSignature: isProduction || requireSecureAuth
    });

    app.use(pageRoutes.sendNotFound);

    app.use(createErrorHandler());
    return { app, meteorService, authoredLanguageHistoryService, createServices };
}
