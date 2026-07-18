import crypto from 'crypto';

function base64URLEncode(value) {
    return value.toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest();
}

export function registerAuthRoutes(app, {
    githubClient,
    planetService,
    clientId,
    callbackUrl
}) {
    app.get(['/login', '/en/login', '/english/login'], (req, res) => {
        const codeVerifier = base64URLEncode(crypto.randomBytes(32));
        req.session.code_verifier = codeVerifier;
        req.session.login_return_to = req.path === '/en/login' || req.path === '/english/login'
            ? '/en'
            : '/';

        const codeChallenge = base64URLEncode(sha256(codeVerifier));
        const authUrl = new URL('https://github.com/login/oauth/authorize');
        authUrl.searchParams.set('client_id', clientId);
        authUrl.searchParams.set('redirect_uri', callbackUrl);
        authUrl.searchParams.set('scope', 'read:user');
        authUrl.searchParams.set('state', crypto.randomBytes(16).toString('hex'));
        authUrl.searchParams.set('code_challenge', codeChallenge);
        authUrl.searchParams.set('code_challenge_method', 'S256');

        req.session.save((error) => {
            if (error) {
                console.error('Login Session Error:', error.message);
                return res.redirect(req.session.login_return_to);
            }
            res.redirect(authUrl.href);
        });
    });

    app.get('/callback', async (req, res) => {
        const { code } = req.query;
        const { code_verifier: codeVerifier } = req.session;
        const loginReturnTo = req.session.login_return_to === '/en' ? '/en' : '/';
        if (!code || !codeVerifier) return res.status(400).send('不正なリクエストです');

        try {
            const accessToken = await githubClient.exchangeCode(code, codeVerifier);
            const user = await githubClient.getAuthenticatedUser(accessToken);
            const planetData = await planetService.updateAndSavePlanetData(user, accessToken);

            req.session.github_token = accessToken;
            req.session.last_updated = Date.now();
            req.session.planetData = { user, planetData };

            delete req.session.login_return_to;
            res.redirect(loginReturnTo);
        } catch (error) {
            console.error('Login Error:', error.message);
            delete req.session.login_return_to;
            res.redirect(loginReturnTo);
        }
    });
}
