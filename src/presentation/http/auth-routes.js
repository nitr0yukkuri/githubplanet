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

function hasCookie(req, cookieName) {
    if (!cookieName) return undefined;
    const header = typeof req.get === 'function'
        ? req.get('cookie')
        : req.headers?.cookie;
    if (typeof header !== 'string') return false;

    return header.split(';').some((cookie) => cookie.trim().startsWith(`${cookieName}=`));
}

function safeErrorMetadata(error) {
    const errorName = typeof error?.name === 'string' && /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(error.name)
        ? error.name
        : 'Error';
    const errorCode = typeof error?.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(error.code)
        ? error.code
        : 'unknown';
    return { errorName, errorCode };
}

export function registerAuthRoutes(app, {
    githubClient,
    planetService,
    clientId,
    callbackUrl,
    sessionCookieName,
    logger = console
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
                logger.error(JSON.stringify({
                    event: 'oauth.session.save_failed',
                    ...safeErrorMetadata(error)
                }));
                return res.redirect(req.session.login_return_to);
            }
            res.redirect(authUrl.href);
        });
    });

    app.get('/callback', async (req, res) => {
        const { code, state } = req.query;
        const { code_verifier: codeVerifier } = req.session;
        const loginReturnTo = req.session.login_return_to === '/en' ? '/en' : '/';
        const expectedState = req.session.oauth_state;
        const rejectionReason = !code
            ? 'missing_code'
            : !codeVerifier
                ? 'missing_code_verifier'
                : !matchesOAuthState(expectedState, state)
                    ? 'state_mismatch'
                    : null;
        if (rejectionReason) {
            // Cookie/stateの値は出さず、存在情報だけを記録して本番の切り分けに使う。
            logger.warn(JSON.stringify({
                event: 'oauth.callback.rejected',
                reason: rejectionReason,
                sessionCookiePresent: hasCookie(req, sessionCookieName),
                codeVerifierPresent: Boolean(codeVerifier),
                expectedStatePresent: expectedState !== undefined,
                suppliedStatePresent: state !== undefined
            }));
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
            logger.error(JSON.stringify({
                event: 'oauth.callback.processing_failed',
                ...safeErrorMetadata(error)
            }));
            delete req.session.login_return_to;
            res.redirect(loginReturnTo);
        }
    });
}
