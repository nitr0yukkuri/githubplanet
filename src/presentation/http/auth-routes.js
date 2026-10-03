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

function matchesOAuthState(expectedState, suppliedState) {
    if (typeof expectedState !== 'string' || typeof suppliedState !== 'string') return false;

    const expectedBuffer = Buffer.from(expectedState);
    const suppliedBuffer = Buffer.from(suppliedState);
    return expectedBuffer.length === suppliedBuffer.length
        && crypto.timingSafeEqual(expectedBuffer, suppliedBuffer);
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
        const state = crypto.randomBytes(16).toString('hex');
        req.session.oauth_state = state;
        const authUrl = new URL('https://github.com/login/oauth/authorize');
        authUrl.searchParams.set('client_id', clientId);
        authUrl.searchParams.set('redirect_uri', callbackUrl);
        authUrl.searchParams.set('scope', 'read:user');
        authUrl.searchParams.set('state', state);
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
        const { code, state } = req.query;
        const { code_verifier: codeVerifier } = req.session;
        const loginReturnTo = req.session.login_return_to === '/en' ? '/en' : '/';
        if (!code || !codeVerifier || !matchesOAuthState(req.session.oauth_state, state)) {
            return res.status(400).send('不正なリクエストです');
        }

        // OAuthのstateは一度だけ使い、callbackの再送で同じ認可コードを交換しない。
        delete req.session.oauth_state;

        try {
            const accessToken = await githubClient.exchangeCode(code, codeVerifier);
            const user = await githubClient.getAuthenticatedUser(accessToken);
            const updatedPlanetData = await planetService.updateAndSavePlanetData(user, accessToken);
            const progressNotice = await planetService.recordLoginProgress(user.id, updatedPlanetData);
            const {
                observedTotalContributions,
                isNewPlanet,
                ...planetData
            } = updatedPlanetData;

            req.session.github_token = accessToken;
            req.session.last_updated = Date.now();
            req.session.planetData = { user, planetData };
            req.session.pendingProgressNotice = progressNotice;

            delete req.session.login_return_to;
            res.redirect(loginReturnTo);
        } catch (error) {
            console.error('Login Error:', error.message);
            delete req.session.login_return_to;
            res.redirect(loginReturnTo);
        }
    });
}
