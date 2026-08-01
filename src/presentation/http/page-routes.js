import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export function registerPageRoutes(app, { rootDirectory, isProduction, systemApiKey, sessionSecret }) {
    const pageTitles = {
        'index.html': 'GitHub Planet',
        'achievements.html': 'Achievements - GitHub Planet',
        'settings.html': 'Settings - GitHub Planet',
        'card.html': 'GitHub Planet Card'
    };
    const pageCache = new Map();

    function sendPage(req, res, fileName) {
        const isEnglish = /^\/(en|english)(\/|$)/.test(req.path);
        if (!isEnglish) return res.sendFile(path.join(rootDirectory, fileName));

        let html = isProduction ? pageCache.get(fileName) : undefined;
        if (!html) {
            html = fs.readFileSync(path.join(rootDirectory, fileName), 'utf8');
            if (isProduction) pageCache.set(fileName, html);
        }

        html = html
            .replace('<html lang="ja">', '<html lang="en">')
            .replace(/<title>[^<]*<\/title>/, `<title>${pageTitles[fileName]}</title>`);

        if (fileName === 'index.html') {
            html = html
                .replace('GitHubの活動履歴からあなただけの惑星を生成しよう。', 'Generate your own planet from your GitHub activity.')
                .replaceAll('あなたのコードが、星になる。GitHubの活動履歴からあなただけの惑星を生成しよう。', 'Your code becomes a star. Generate your own planet from your GitHub activity.')
                .replace('content="https://githubplanet-git-543426763451.asia-northeast2.run.app/"', 'content="https://githubplanet-git-543426763451.asia-northeast2.run.app/en"')
                .replace('href="https://githubplanet-git-543426763451.asia-northeast2.run.app/" rel="canonical"', 'href="https://githubplanet-git-543426763451.asia-northeast2.run.app/en" rel="canonical"');
        }

        res.type('html').send(html);
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

    app.get('/manifest.json', (req, res) => {
        res.type('application/manifest+json');
        res.sendFile(path.join(rootDirectory, 'manifest.json'));
    });

    app.get('/manifest-en.json', (req, res) => {
        res.type('application/manifest+json');
        res.sendFile(path.join(rootDirectory, 'manifest-en.json'));
    });

    app.get('/sw.js', (req, res) => {
        res.setHeader('Cache-Control', 'no-cache');
        res.type('application/javascript');
        res.sendFile(path.join(rootDirectory, 'sw.js'));
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
        let protocol = req.headers['x-forwarded-proto'] || req.protocol;
        if (req.get('host') && req.get('host').includes('onrender.com')) protocol = 'https';

        const host = req.headers['x-forwarded-host'] || req.get('host');
        const timestamp = Date.now();
        const signature = generateSignature(targetUsername);
        const targetUrl = `${protocol}://${host}/card.html?username=${targetUsername}&fix=true&ts=${timestamp}&sig=${signature}`;

        console.log(`[Card] Redirecting generation for: ${targetUrl}`);
        res.redirect(`https://image.thum.io/get/png/width/800/crop/400/noanimate/wait/3/${targetUrl}`);
    });

    app.get(['/card', '/card.html', '/en/card', '/en/card.html', '/english/card', '/english/card.html'], (req, res) => {
        const { username, fix } = req.query;
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
        res.sendFile(path.join(rootDirectory, 'sender.html'));
    });

    app.get(['/achievements', '/en/achievements', '/english/achievements'], (req, res) => {
        sendPage(req, res, 'achievements.html');
    });

    app.get(['/settings', '/en/settings', '/english/settings'], (req, res) => {
        sendPage(req, res, 'settings.html');
    });
}
