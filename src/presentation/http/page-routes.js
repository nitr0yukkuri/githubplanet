import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { createPageSeo } from './page-seo.js';

const DEFAULT_PUBLIC_BASE_URL = 'https://githubplanet.dev';
const SOURCE_PUBLIC_BASE_URL = 'https://githubplanet.dev';

export function registerPageRoutes(app, {
    rootDirectory,
    isProduction,
    systemApiKey,
    sessionSecret,
    publicBaseUrl = DEFAULT_PUBLIC_BASE_URL,
    cardCaptureBaseUrl = isProduction ? publicBaseUrl : undefined,
    showcasePages = [],
    threeAssetBasePath = '/vendor/three'
}) {
    const normalizedPublicBaseUrl = publicBaseUrl.replace(/\/+$/, '');
    const normalizedCardCaptureBaseUrl = cardCaptureBaseUrl?.replace(/\/+$/, '');
    const pageTitles = {
        'index.html': 'GitHub Planet',
        'achievements.html': 'Achievements - GitHub Planet',
        'settings.html': 'Settings - GitHub Planet',
        'card.html': 'GitHub Planet Card',
        '404.html': '404 - Planet Not Found'
    };
    // 公開ページのクロールごとに同期I/Oが発生しないよう、テンプレートは起動時に読み込む。
    const pageCache = new Map([
        'index.html', 'achievements.html', 'settings.html', 'card.html', '404.html', 'sender.html'
    ].map((fileName) => [fileName, fs.readFileSync(path.join(rootDirectory, fileName), 'utf8')
        .replaceAll(SOURCE_PUBLIC_BASE_URL, normalizedPublicBaseUrl)
        .replaceAll('/vendor/three/', `${threeAssetBasePath}/`)]));
    const favicon = fs.readFileSync(path.join(rootDirectory, 'front/img/favicon-96.png'));
    // デプロイ中に変わらない小さな公開ファイルも、アクセスごとのファイルI/Oを避ける。
    const staticPageAssets = new Map(['manifest.json', 'manifest-en.json', 'sw.js']
        .map((fileName) => [fileName, fs.readFileSync(path.join(rootDirectory, fileName))]));
    const seo = createPageSeo({ publicBaseUrl: normalizedPublicBaseUrl, showcasePages });
    app.use(seo.middleware);

    function addScriptNonce(html, req) {
        if (!req.cspNonce) return html;
        // script-srcのnonce許可を、HTMLテンプレート内と後挿入された全scriptで共有する。
        return html.replace(/<script(?=[\s>])/gi, `<script nonce="${req.cspNonce}"`);
    }

    function sendPage(req, res, fileName) {
        res.setHeader('Cache-Control', 'no-store');
        const isEnglish = /^\/(en|english)(\/|$)/.test(req.path);
        let html = pageCache.get(fileName);

        if (fileName === 'index.html') {
            const page = seo.resolveHomePage(req);
            if (!page) {
                return sendNotFound(req, res);
            }
            if (!page.indexable) res.setHeader('X-Robots-Tag', 'noindex, follow');
            html = seo.renderHome(html, page);
        } else {
            html = seo.renderUtility(html);
            if (isEnglish) {
                html = html.replace('<html lang="ja">', '<html lang="en">')
                    .replace(/<title>[^<]*<\/title>/, `<title>${pageTitles[fileName]}</title>`);
            }
        }

        res.type('html').send(addScriptNonce(html, req));
    }

    function sendNotFound(req, res) {
        // 一般404と廃止カードも同じ描画経路に通し、翻訳scriptだけnonceが欠ける状態を防ぐ。
        res.setHeader('X-Robots-Tag', 'noindex, follow');
        res.status(404);
        return sendPage(req, res, '404.html');
    }

    function generateSignature(username) {
        return crypto.createHmac('sha256', sessionSecret).update(username).digest('hex');
    }

    function allowPortfolioCardEmbedding(res) {
        res.removeHeader('X-Frame-Options');
        const contentSecurityPolicy = res.getHeader('Content-Security-Policy');
        if (typeof contentSecurityPolicy === 'string') {
            res.setHeader(
                'Content-Security-Policy',
                contentSecurityPolicy.replace(
                    "frame-ancestors 'none'",
                    "frame-ancestors 'self' https://wakato.tech https://www.wakato.tech"
                )
            );
        }
    }

    app.get(['/', '/en', '/english'], (req, res) => {
        sendPage(req, res, 'index.html');
    });


    app.get('/robots.txt', (_req, res) => {
        res.setHeader('Cache-Control', 'public, max-age=3600');
        const sitemapUrl = new URL('/sitemap.xml', normalizedPublicBaseUrl).href;
        res.type('text/plain').send([
            'User-agent: *',
            'Allow: /',
            'Sitemap: ' + sitemapUrl
        ].join('\n') + '\n');
    });

    app.get('/sitemap.xml', (_req, res) => {
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.type('application/xml').send(seo.sitemap());
    });


    app.get([
        '/exhibition',
        '/en/exhibition',
        '/english/exhibition',
        '/demo',
        '/en/demo',
        '/english/demo',
        '/showcase',
        '/en/showcase',
        '/english/showcase',
        '/showcase/:slug',
        '/en/showcase/:slug',
        '/english/showcase/:slug'
    ], (req, res) => {
        sendPage(req, res, 'index.html');
    });

    app.get('/manifest.json', (_req, res) => {
        res.type('application/manifest+json');
        res.send(staticPageAssets.get('manifest.json'));
    });

    app.get('/manifest-en.json', (_req, res) => {
        res.type('application/manifest+json');
        res.send(staticPageAssets.get('manifest-en.json'));
    });

    app.get('/favicon.ico', (_req, res) => {
        res.type('image/png').send(favicon);
    });

    app.get('/sw.js', (_req, res) => {
        res.setHeader('Cache-Control', 'no-cache');
        res.type('application/javascript');
        res.send(staticPageAssets.get('sw.js'));
    });

    app.get('/api/card/:username', (req, res) => {
        const loggedInUser = req.session.planetData?.user?.login;
        const { username } = req.params;
        const apiKey = req.headers['x-api-key'] || req.query.api_key;
        const isAuthorized = (loggedInUser && loggedInUser === username)
            || (systemApiKey && apiKey === systemApiKey);

        if (!isAuthorized) {
            return res.status(403).send('Forbidden: Please login first.');
        }

        const targetUsername = (systemApiKey && apiKey === systemApiKey) ? username : loggedInUser;
        const timestamp = Date.now();
        const signature = generateSignature(targetUsername);
        if (!normalizedCardCaptureBaseUrl) {
            return res.status(503).send('Card capture base URL is not configured');
        }
        const canonicalCardUrl = new URL('/card.html', normalizedCardCaptureBaseUrl);
        canonicalCardUrl.searchParams.set('username', targetUsername);
        canonicalCardUrl.searchParams.set('fix', 'true');
        canonicalCardUrl.searchParams.set('ts', String(timestamp));
        canonicalCardUrl.searchParams.set('sig', signature);
        const targetUrl = canonicalCardUrl.href;

        console.log(`[Card] Redirecting generation for: ${targetUrl}`);
        res.redirect(`https://image.thum.io/get/png/width/800/crop/400/noanimate/wait/3/${targetUrl}`);
    });

    app.get(['/card', '/card.html', '/en/card', '/en/card.html', '/english/card', '/english/card.html'], (req, res) => {
        const { username, fix, showcase } = req.query;
        if (showcase !== undefined) {
            const slug = typeof showcase === 'string' ? showcase.trim().toLowerCase() : '';
            // 廃止したショーケースで空のカードを出さず、ページ取得時点で404にする。
            if (!showcasePages.some((planet) => planet.slug === slug)) {
                return sendNotFound(req, res);
            }
        }
        const loggedInUser = req.session.planetData?.user?.login;

        if (!username && !fix) {
            if (loggedInUser) {
                return res.redirect(`${req.path}?username=${encodeURIComponent(loggedInUser)}`);
            }
            allowPortfolioCardEmbedding(res);
            return sendPage(req, res, 'card.html');
        }

        if (fix) {
            allowPortfolioCardEmbedding(res);
            return sendPage(req, res, 'card.html');
        }

        if (!isProduction || (loggedInUser && loggedInUser === username)) {
            allowPortfolioCardEmbedding(res);
            return sendPage(req, res, 'card.html');
        }

        res.status(403).send('Forbidden: This card is private.');
    });

    app.get(['/sender', '/en/sender', '/english/sender'], (req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        res.type('html').send(addScriptNonce(pageCache.get('sender.html'), req));
    });

    app.get(['/achievements', '/en/achievements', '/english/achievements'], (req, res) => {
        sendPage(req, res, 'achievements.html');
    });

    app.get(['/settings', '/en/settings', '/english/settings'], (req, res) => {
        sendPage(req, res, 'settings.html');
    });
    return { sendNotFound };
}
