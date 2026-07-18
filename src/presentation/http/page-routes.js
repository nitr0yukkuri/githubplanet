import crypto from 'crypto';
import path from 'path';

export function registerPageRoutes(app, { rootDirectory, isProduction, systemApiKey, sessionSecret }) {
    function generateSignature(username) {
        return crypto.createHmac('sha256', sessionSecret).update(username).digest('hex');
    }

    app.get(['/', '/en', '/english'], (req, res) => {
        res.sendFile(path.join(rootDirectory, 'index.html'));
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
        res.redirect(`https://image.thum.io/get/png/width/800/crop/400/noanimate/wait/8/${targetUrl}`);
    });

    app.get(['/card.html', '/en/card.html', '/english/card.html'], (req, res) => {
        const { username, fix } = req.query;
        if (fix) return res.sendFile(path.join(rootDirectory, 'card.html'));

        const loggedInUser = req.session.planetData?.user?.login;
        if (!isProduction || (loggedInUser && loggedInUser === username)) {
            return res.sendFile(path.join(rootDirectory, 'card.html'));
        }

        res.status(403).send('Forbidden: This card is private.');
    });

    app.get('/sender', (req, res) => {
        res.sendFile(path.join(rootDirectory, 'sender.html'));
    });

    app.get(['/achievements', '/en/achievements', '/english/achievements'], (req, res) => {
        res.sendFile(path.join(rootDirectory, 'achievements.html'));
    });

    app.get(['/settings', '/en/settings', '/english/settings'], (req, res) => {
        res.sendFile(path.join(rootDirectory, 'settings.html'));
    });
}
