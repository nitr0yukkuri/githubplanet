import { createServer } from 'node:http';
import { createHmac } from 'node:crypto';
import { httpServerHandler } from 'cloudflare:node';
import { DurableObject } from 'cloudflare:workers';
import { createWorkerHttpClient } from './http-client.js';
import { ipKeyGenerator } from 'express-rate-limit';
import { createApplication } from '../src/bootstrap/create-application.js';
import { createWorkerPool } from './database.js';
import { createJobDispatch, consumeJobs } from './jobs.js';
import { rejectWebhookHeaders } from './webhook.js';
import { createWorkerQueryCache } from './query-cache.js';
import { createRequestScope } from './request-scope.js';
import { schemaMigrations } from './generated-schema.js';
import { pages } from './generated-pages.js';
export { MeteorHub, BackgroundJobState, RequestBudget, WebhookIngress } from './durable-objects.js';

const requests = createRequestScope();
const queryCache = createWorkerQueryCache();
const modelListCache = {};
const applications = new WeakMap();
const httpClient = createWorkerHttpClient();
const server = createServer((request, response) => requests.current().app(request, response));
server.listen(3000);
const http = httpServerHandler({ port: 3000 });
const publicFiles = new Set(['manifest.json', 'manifest-en.json', 'sw.js']);

export class ApplicationGateway extends DurableObject {
    createRuntime(...args) { return createRuntime(...args); }
    fetch(request) {
        // Express・認証・DB処理をHTTP Workerの10ms枠から分離し、無料プランでも初回の重い要求を失敗させない。
        const worker = createWorker({ runtimeFactory: this.createRuntime.bind(this), routeThroughGateway: false });
        return worker.fetch(request, this.env, this.ctx);
    }
}

function readPublicFile(fileName) {
    if (!Object.hasOwn(pages, fileName)) throw new Error('Unknown public template');
    return fileName.endsWith('.png') ? Buffer.from(pages[fileName], 'base64') : pages[fileName];
}

function sharedApplication(env, applicationOptions) {
    if (applications.has(env)) return applications.get(env);
    const dispatch = createJobDispatch(env);
    let limiterIndex = 0;
    const services = Object.fromEntries(['githubClient', 'geminiClient', 'languageColorService', 'planetService', 'meteorService',
        'planetQueryService', 'authoredLanguageHistoryService'].map(name => [name,
        !env.POSTGRES && ['planetQueryService', 'authoredLanguageHistoryService'].includes(name) ? undefined : requests.service(name)]));
    const application = createApplication({
        env, pool: env.POSTGRES ? requests.pool : undefined, rootDirectory: '/bundle', httpClient,
        serveStaticAssets: false, disableSessionPruning: true, compressResponses: false, requireSecureAuth: true, logRuntimeConfiguration: false, readPublicFile,
        realtime: { transport: 'websocket', url: '/realtime' },
        ...dispatch,
        modelListCache,
        createMeRateLimit: () => {
            const scope = limiterIndex++;
            return async (req, res, next) => {
                try {
                    const userId = req.session?.planetData?.user?.id;
                    const identity = userId ? 'github-user:' + userId : ipKeyGenerator(req.ip);
                    const key = createHmac('sha256', env.SESSION_SECRET || 'local-only').update(scope + ':' + identity).digest('hex');
                    const result = await env.REQUEST_BUDGET.getByName(key).check(15 * 60_000, 100);
                    res.setHeader('RateLimit-Limit', '100');
                    res.setHeader('RateLimit-Remaining', String(result.remaining));
                    if (!result.allowed) {
                        res.setHeader('Retry-After', String(Math.max(1, Math.ceil((result.reset - Date.now()) / 1000))));
                        return res.status(429).send('Too many requests, please try again later.');
                    }
                    next();
                } catch (error) { next(error); }
            };
        },
        ...applicationOptions,
        services
    });
    applications.set(env, application);
    return application;
}

export function createRuntime(env, context, eventId = crypto.randomUUID(), applicationOptions = {}) {
    const application = sharedApplication(env, applicationOptions);
    let pool, cache, services;
    const ensurePool = () => pool ||= createWorkerPool(env);
    const resolveServices = () => {
        if (!services) {
            cache = queryCache.begin();
            services = application.createServices({
                pool: ensurePool(), httpClient, queryCaches: cache.caches,
                emitMeteor: (payload, options) => env.METEOR_HUB.getByName('global').publish(options?.idempotencyKey || eventId, payload),
                ...applicationOptions
            });
        }
        return services;
    };
    return {
        app: application.app, ensurePool,
        get pool() { return pool; },
        get services() { return resolveServices(); },
        get meteorService() { return resolveServices().meteorService; },
        get authoredLanguageHistoryService() { return resolveServices().authoredLanguageHistoryService; },
        flushCaches() { cache?.flush(); }
    };
}

export function createWorker({ runtimeFactory = createRuntime, routeThroughGateway = true } = {}) {
    return {
        async fetch(request, env, context) {
            const url = new URL(request.url);
            if (url.pathname.startsWith('/front/') || url.pathname.startsWith('/vendor/') || publicFiles.has(url.pathname.slice(1)) || url.pathname === '/favicon.ico') {
                const assetUrl = new URL(request.url);
                if (url.pathname === '/favicon.ico') assetUrl.pathname = '/front/img/favicon-96.png';
                return env.ASSETS.fetch(new Request(assetUrl, request));
            }
            if (routeThroughGateway && !/^\/webhook\/?$/.test(url.pathname) && url.pathname !== '/realtime') {
                return env.APPLICATION_GATEWAY.getByName('http').fetch(request);
            }
            if (/^\/webhook\/?$/.test(url.pathname)) {
                const rejection = rejectWebhookHeaders(request, env);
                if (rejection) return rejection;
                return env.WEBHOOK_INGRESS.getByName(request.headers.get('X-GitHub-Delivery')).fetch(request);
            }
            if (url.pathname === '/healthz') {
                let pool;
                try {
                    pool = createWorkerPool(env);
                    if (pool) {
                        const result = await pool.query('SELECT version, checksum FROM schema_migrations');
                        const applied = new Map(result.rows.map((row) => [row.version, row.checksum]));
                        if (schemaMigrations.some(({version, checksum}) => applied.get(version) !== checksum)) throw new Error('Database migration required');
                    }
                    else if (env.NODE_ENV === 'production') throw new Error('Database unavailable');
                    return Response.json({ status: 'ok', runtime: 'cloudflare' }, { headers: { 'Cache-Control': 'no-store' } });
                } catch { return Response.json({ status: 'unavailable' }, { status: 503 }); }
                finally { if (pool) context.waitUntil(pool.end()); }
            }
            if (url.pathname === '/realtime') {
                const allowedOrigin = new URL(env.PUBLIC_BASE_URL || request.url).origin;
                if (request.headers.get('Origin') !== allowedOrigin) return new Response('Forbidden', { status: 403 });
                return env.METEOR_HUB.getByName('global').fetch(request);
            }
            let runtime;
            try {
                runtime = runtimeFactory(env, context);
                const headers = new Headers(request.headers);
                // プロキシ向けヘッダーをリクエストの実URLから作り直し、Cookieとcanonical判定を一致させる。
                headers.set('X-Forwarded-Proto', url.protocol.slice(0, -1));
                headers.set('X-Forwarded-Host', url.host);
                headers.set('X-Original-Host', url.host);
                headers.set('X-Forwarded-For', request.headers.get('CF-Connecting-IP') || '127.0.0.1');
                headers.set('Host', url.host);
                const response = await requests.run(runtime, () => http.fetch(new Request(request, { headers }), env, context));
                // Node側のsession保存とレスポンス完了を待ってから、リクエスト専用Poolを閉じる。
                const buffer = await response.arrayBuffer();
                const body = request.method === 'HEAD' || [204, 205, 304].includes(response.status) ? null : buffer;
                const outgoing = new Response(body, response);
                outgoing.headers.set('Cache-Control', 'private, no-store');
                return outgoing;
            } catch (error) {
                console.error('[Cloudflare HTTP]', { name: error.name });
                return Response.json({ error: 'Service temporarily unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
            } finally {
                runtime?.flushCaches?.();
                if (runtime?.pool) context.waitUntil(runtime.pool.end());
            }
        },
        async scheduled(_event, env, context) {
            const pool = createWorkerPool(env);
            try {
                if (pool) await pool.query('DELETE FROM session WHERE sid IN (SELECT sid FROM session WHERE expire < NOW() LIMIT 1000)');
            } finally { if (pool) context.waitUntil(pool.end()); }
        },
        queue(batch, env, context) { return consumeJobs(batch, env, context, runtimeFactory); }
    };
}
export default createWorker();
