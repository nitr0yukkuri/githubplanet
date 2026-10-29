const EFFECTS = {
    css: ['色が地表を一定方向へ流れる表現', 'directional color flowing across the surface'],
    cpp: ['プラズマのような光が走る表現', 'plasma-like light around the planet'],
    elm: ['風に揺れる緑の草原を思わせる表現', 'green vegetation that moves like a meadow in the wind'],
    go: ['大気に沿って風が流れる表現', 'wind flowing through the atmosphere'],
    typescript: ['青い惑星を透明なシールドが包む表現', 'a transparent protective shell around a blue planet'],
    javascript: ['金色の地表が反応するように変化する表現', 'a reactive golden surface'],
    java: ['コーヒーを思わせる暗く粗い地表の表現', 'a dark, rough surface inspired by roasted coffee'],
    kotlin: ['紫色の放電と火花が惑星を包む表現', 'purple electrical sparks and lightning around the planet'],
    perl: ['青い海と海流を思わせる表現', 'a blue ocean with moving currents'],
    rust: ['砂漠のような地表を砂塵が巡る表現', 'dust drifting over a desert-like surface'],
    vue: ['緑の惑星の周りを穏やかな風が巡る表現', 'gentle wind circulating around a green planet'],
    ruby: ['赤い惑星に炎のような光が広がる表現', 'fiery light spreading over a red planet'],
    python: ['2本の軌跡が惑星の周囲を巡る表現', 'paired orbital trails around the planet']
};

const COPY = {
    ja: {
        title: 'GitHub Planet | GitHubの活動から育つ3D惑星',
        heading: 'GitHubの活動が、あなただけの惑星になる',
        description: 'GitHubの公開リポジトリの使用言語とコントリビューションから、あなただけの3D惑星を生成。言語ごとに異なる色や演出を楽しみ、ほかの開発者の惑星も探索できます。',
        welcome: 'GitHub Planetへようこそ',
        body: 'GitHub Planetは、GitHubの活動を3Dの惑星として楽しむWebアプリです。公開リポジトリの言語構成から色や演出が、コントリビューションから惑星の成長が決まります。',
        explore: 'ログイン前でも言語別サンプルを見られます。自分の惑星はGitHubでログインして作成でき、プロフィール用のカードも共有できます。',
        disclaimer: '※GitHub PlanetはGitHub公式とは一切関係ありません。',
        imageAlt: 'GitHubの活動を惑星にするGitHub Planet',
        noScript: '3D表示と惑星の操作にはJavaScriptが必要です。'
    },
    en: {
        title: 'GitHub Planet | Your GitHub activity as a 3D planet',
        heading: 'Your GitHub activity becomes a planet of your own',
        description: 'Generate your own planet from your GitHub activity. Public repository languages and contributions shape a 3D world you can share and explore.',
        welcome: 'Welcome to GitHub Planet',
        body: 'GitHub Planet is a web app that turns GitHub activity into a 3D planet. The languages in public repositories shape its colors and effects, while contributions shape its growth.',
        explore: 'Explore language showcases without signing in. Sign in with GitHub to create your own planet and share a profile card.',
        disclaimer: 'GitHub Planet is an independent project and is not affiliated with GitHub.',
        imageAlt: 'GitHub Planet turns GitHub activity into a planet',
        noScript: 'JavaScript is required for the 3D view and planet controls.'
    }
};

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
}

function replaceMeta(html, attribute, identity, value) {
    const escapedIdentity = identity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`<meta\\b(?=[^>]*\\b${attribute}="${escapedIdentity}")[^>]*>\\s*`, 'gi');
    return html.replace(pattern, '').replace('</head>', `    <meta ${attribute}="${identity}" content="${escapeHtml(value)}">\n</head>`);
}

function withoutCanonical(html) {
    return html.replace(/<link\b(?=[^>]*\brel="canonical")[^>]*>\s*/gi, '')
        .replace(/<link\b(?=[^>]*\bhreflang=)[^>]*>\s*/gi, '');
}

function previewQuery(query) {
    return [...query.keys()].some((key) => key.startsWith('preview')
        || key === 'fix' || (key === 'timeline' && query.get(key) === 'preview'));
}

export function createPageSeo({ publicBaseUrl, showcasePages = [] }) {
    const baseUrl = new URL(publicBaseUrl);
    const absolute = (pathname) => new URL(pathname, baseUrl).href;
    const showcases = new Map(showcasePages.map((page) => [page.slug, page]));
    const imageUrl = absolute('/front/img/social-preview.png');
    const localePath = (pathname, locale) => locale === 'en'
        ? `/en${pathname === '/' ? '' : pathname}` : pathname;
    const publicPaths = new Map(['/', ...[...showcases.keys()].map((slug) => `/showcase/${slug}`)]
        .flatMap((pathname) => ['ja', 'en'].map((locale) => {
            const path = localePath(pathname, locale);
            return [path, absolute(path)];
        })));

    function resolveHomePage(req) {
        const normalizedPath = req.path.toLowerCase();
        const locale = /^\/(en|english)(\/|$)/.test(normalizedPath) ? 'en' : 'ja';
        const pathname = normalizedPath.replace(/^\/(?:en|english)(?=\/|$)/, '').replace(/\/+$/, '') || '/';
        const query = new URL(req.originalUrl || req.url || req.path, 'http://localhost').searchParams;
        const showcaseMatch = /^\/showcase(?:\/([^/]+))?$/.exec(pathname);
        let pathSlug = showcaseMatch?.[1];
        if (pathSlug) {
            try { pathSlug = decodeURIComponent(pathSlug); } catch { return null; }
        }
        const requestedSlug = pathname === '/exhibition' ? null
            : pathSlug || query.get('showcase')
                || (showcaseMatch || pathname === '/demo' ? 'typescript' : null);
        const showcase = requestedSlug ? showcases.get(requestedSlug.trim().toLowerCase()) : null;
        if (requestedSlug && !showcase) return null;
        const publicPath = showcase ? `/showcase/${showcase.slug}` : '/';
        const copy = COPY[locale];
        const effect = showcase ? EFFECTS[showcase.slug]?.[locale === 'ja' ? 0 : 1] : null;
        const description = showcase
            ? locale === 'ja'
                ? `${showcase.mainLanguage}の惑星サンプル。${effect || showcase.planetName}を3Dで体験できます。GitHub Planetの言語別の色や演出を、ログインせずに比較できます。`
                : `Explore the ${showcase.mainLanguage} planet with ${effect || showcase.planetName}. Compare GitHub Planet's language-specific 3D effects without signing in.`
            : copy.description;
        return {
            locale, copy, showcase, publicPath, description,
            title: showcase
                ? locale === 'ja' ? `${showcase.mainLanguage}の惑星サンプル | GitHub Planet`
                    : `${showcase.mainLanguage} Planet Showcase | GitHub Planet`
                : copy.title,
            heading: showcase
                ? locale === 'ja' ? `${showcase.mainLanguage}の惑星サンプル`
                    : `${showcase.mainLanguage} Planet Showcase`
                : copy.heading,
            indexable: !['/demo', '/exhibition'].includes(pathname) && !previewQuery(query)
        };
    }

    function middleware(req, res, next) {
        const path = req.path;
        // Expressのルート照合は大文字小文字を区別しないため、SEO判定も同じ照合に揃える。
        const normalizedPath = path.toLowerCase();
        const withoutLocale = normalizedPath.replace(/^\/(?:en|english)(?=\/|$)/, '') || '/';
        if (/^\/(?:api|socket\.io)(?:\/|$)/.test(normalizedPath)
            || /^\/(?:card(?:\.html)?|sender|settings|achievements|login|logout|callback|exhibition|demo)(?:\/|$)/.test(withoutLocale)) {
            res.setHeader('X-Robots-Tag', 'noindex, follow');
        }
        if (!['GET', 'HEAD'].includes(req.method)) return next();

        const publicRoute = /^\/(?:en(?:glish)?(?:\/|$))?(?:showcase(?:\/[^/]+)?\/?|index\.html)?$/.test(normalizedPath)
            || ['/', '/en', '/english', '/en/', '/english/'].includes(normalizedPath);
        if (!publicRoute) return next();
        const locale = /^\/(en|english)(\/|$)/.test(normalizedPath) ? 'en' : 'ja';
        let targetPath = normalizedPath.replace(/^\/english(?=\/|$)/, '/en').replace(/\/+$/, '') || '/';
        targetPath = targetPath.replace(/\/index\.html$/, '') || '/';
        const query = new URL(req.originalUrl || req.url || path, 'http://localhost').searchParams;
        const page = resolveHomePage({ path: targetPath, originalUrl: req.originalUrl, url: req.url });
        if (page?.showcase) {
            targetPath = localePath(page.publicPath, locale);
            query.delete('showcase');
        }
        if (targetPath !== path) {
            // リクエスト由来のパスをそのまま返さず、公開一覧にある同一originのURLだけへ転送する。
            const approvedTarget = publicPaths.get(targetPath);
            if (!approvedTarget) return next();
            const destination = new URL(approvedTarget);
            destination.search = query.toString();
            if (destination.origin !== baseUrl.origin) return next();
            return res.redirect(301, destination.pathname + destination.search);
        }
        next();
    }

    function noScriptMarkup(page) {
        return `<noscript><p class="site-noscript">${escapeHtml(page.copy.noScript)}</p></noscript>`;
    }

    function renderHome(html, page) {
        const { locale, copy, publicPath, indexable } = page;
        const canonicalUrl = absolute(localePath(publicPath, locale));
        html = html.replace(/<html lang="[^"]*"/, `<html lang="${locale}"`)
            .replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(page.title)}</title>`)
            .replace('<body data-i18n-title="common.appTitle">', '<body data-i18n-title="common.appTitle" data-seo-title="true">');
        for (const [attribute, identity, value] of [
            ['name', 'description', page.description],
            ['name', 'robots', indexable ? 'index, follow, max-image-preview:large' : 'noindex, follow'],
            ['property', 'og:title', page.title], ['property', 'og:description', page.description],
            ['property', 'og:type', 'website'], ['property', 'og:url', canonicalUrl],
            ['property', 'og:site_name', 'GitHub Planet'],
            ['property', 'og:locale', locale === 'ja' ? 'ja_JP' : 'en_US'],
            ['property', 'og:locale:alternate', locale === 'ja' ? 'en_US' : 'ja_JP'],
            ['property', 'og:image', imageUrl], ['property', 'og:image:width', '1200'],
            ['property', 'og:image:height', '630'], ['property', 'og:image:type', 'image/png'],
            ['property', 'og:image:alt', copy.imageAlt], ['name', 'twitter:card', 'summary_large_image'],
            ['name', 'twitter:title', page.title], ['name', 'twitter:description', page.description],
            ['name', 'twitter:image', imageUrl], ['name', 'twitter:image:alt', copy.imageAlt]
        ]) html = replaceMeta(html, attribute, identity, value);
        html = withoutCanonical(html);
        if (indexable) {
            const links = `<link href="${escapeHtml(canonicalUrl)}" rel="canonical">\n`
                + ['ja', 'en', 'x-default'].map((language) =>
                    `<link href="${escapeHtml(absolute(localePath(publicPath, language === 'en' ? 'en' : 'ja')))}" rel="alternate" hreflang="${language}">`).join('\n');
            html = html.replace('</head>', `${links}\n</head>`);
        }
        const siteId = absolute('/#website');
        const structuredData = {
            '@context': 'https://schema.org',
            '@graph': [
                { '@type': 'WebSite', '@id': siteId, name: 'GitHub Planet', alternateName: 'GitHubPlanet',
                    url: absolute('/'), inLanguage: ['ja', 'en'] },
                { '@type': page.showcase ? 'WebPage' : 'WebApplication', '@id': `${canonicalUrl}#page`,
                    name: page.heading, url: canonicalUrl, description: page.description,
                    inLanguage: locale, image: imageUrl, isPartOf: { '@id': siteId },
                    ...(page.showcase ? { about: { '@type': 'Thing', name: page.showcase.mainLanguage },
                        breadcrumb: { '@id': `${canonicalUrl}#breadcrumb` } }
                        : { applicationCategory: 'DeveloperApplication', operatingSystem: 'Web browser',
                            isAccessibleForFree: true, sameAs: 'https://github.com/nitr0yukkuri/githubplanet' }) }
            ]
        };
        if (page.showcase) structuredData['@graph'].push({
            '@type': 'BreadcrumbList', '@id': `${canonicalUrl}#breadcrumb`,
            itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'GitHub Planet', item: absolute(localePath('/', locale)) },
                { '@type': 'ListItem', position: 2, name: page.heading, item: canonicalUrl }
            ]
        });
        // 初期HTMLと描画後でcanonical・見出しが食い違うと、検索側が別ページとして判定できない。
        html = html.replace('</head>', `<script type="application/ld+json">${JSON.stringify(structuredData).replaceAll('<', '\\u003c')}</script>\n</head>`)
            .replace(/<h2 id="welcome-title"[^>]*>[\s\S]*?<\/h2>/, `<h2 id="welcome-title">${escapeHtml(copy.welcome)}</h2>`)
            .replace(/<p([^>]*?) data-i18n-html="home\.welcomeBody"[^>]*>[\s\S]*?<\/p>/, `<p$1>${escapeHtml(copy.body)}<br>${escapeHtml(copy.explore)}</p>`)
            .replace(/(<p[^>]*data-i18n="common\.disclaimer"[^>]*>)[\s\S]*?<\/p>/, `$1${escapeHtml(copy.disclaimer)}</p>`)
            .replace('<!-- site-noscript -->', noScriptMarkup(page))
            .replace(/<nav class="home-language-switcher"[^>]*>[\s\S]*?<\/nav>/, `<nav class="home-language-switcher" aria-label="Language">
                <a href="${localePath(publicPath, 'ja')}" data-home-language="ja" hreflang="ja" lang="ja">JA</a>
                <a href="${localePath(publicPath, 'en')}" data-home-language="en" hreflang="en" lang="en">EN</a>
            </nav>`);
        if (locale === 'en') html = html.replace('href="/manifest.json"', 'href="/manifest-en.json"');
        return html;
    }

    function renderUtility(html) {
        return replaceMeta(withoutCanonical(html), 'name', 'robots', 'noindex, follow');
    }

    function sitemap() {
        const paths = ['/', ...[...showcases.keys()].map((slug) => `/showcase/${slug}`)];
        const entries = paths.flatMap((pathname) => ['ja', 'en'].map((locale) => {
            const alternates = ['ja', 'en', 'x-default'].map((language) =>
                `        <xhtml:link rel="alternate" hreflang="${language}" href="${escapeHtml(absolute(localePath(pathname, language === 'en' ? 'en' : 'ja')))}" />`);
            return ['    <url>', `        <loc>${escapeHtml(absolute(localePath(pathname, locale)))}</loc>`, ...alternates, '    </url>'].join('\n');
        }));
        return ['<?xml version="1.0" encoding="UTF-8"?>',
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">', ...entries, '</urlset>'].join('\n');
    }

    return { middleware, resolveHomePage, renderHome, renderUtility, sitemap };
}

