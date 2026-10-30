import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { normalizePlanetCommitCounts } from '../../domain/planet/planet.js';
import { getShowcasePlanet } from '../../domain/planet/showcase-planets.js';
import { toPlanetResponse } from './planet-response.js';
import { safeErrorMetadata } from '../../shared/error-metadata.js';

const ANONYMOUS_RANDOM_COOKIE = 'githubplanet_random_planet';

function readCookie(cookieHeader, name) {
    const entry = (cookieHeader || '')
        .split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${name}=`));
    if (!entry) return undefined;

    try {
        const value = decodeURIComponent(entry.slice(name.length + 1));
        return /^-?\d+$/.test(value) ? value : undefined;
    } catch {
        return undefined;
    }
}

function writeAnonymousRandomCookie(res, planetId) {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.append(
        'Set-Cookie',
        `${ANONYMOUS_RANDOM_COOKIE}=${encodeURIComponent(String(planetId))}; Path=/; HttpOnly; SameSite=Lax${secure}`
    );
}

export function registerPlanetRoutes(app, {
    planetService,
    planetQueryService,
    authoredLanguageHistoryService,
    historyDisabledUsernames = [],
    cacheDuration,
    randomHistoryStorage = 'cookie',
    randomPerformance = null
}) {
    const disabledHistoryUsernames = new Set(
        historyDisabledUsernames.map((username) => String(username).trim().toLowerCase()).filter(Boolean)
    );
    const isHistoryDisabled = (username) => disabledHistoryUsernames.has(
        String(username || '').trim().toLowerCase()
    );
    // /api/me verifies the GitHub profile, so cap repeated upstream calls per stable account ID.
    const authenticatedMeRateLimit = rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 100,
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: (req) => {
            const userId = req.session?.planetData?.user?.id;
            return userId ? `github-user:${userId}` : ipKeyGenerator(req.ip);
        }
    });

    app.get('/github-profile/:githubId', async (req, res) => {
        if (!/^[1-9]\d*$/.test(String(req.params.githubId || ''))) {
            return res.status(400).send('Invalid GitHub account ID.');
        }
        if (typeof planetQueryService?.getGithubProfileUrlById !== 'function') {
            return res.status(503).send('GitHub profile lookup is unavailable.');
        }

        try {
            const profileUrl = await planetQueryService.getGithubProfileUrlById(req.params.githubId);
            if (!profileUrl) {
                return res.status(410).send('This GitHub profile is no longer publicly available.');
            }
            return res.redirect(302, profileUrl);
        } catch (error) {
            if ([403, 429].includes(error.response?.status)) {
                if (error.retryAfterMs) {
                    res.setHeader('Retry-After', String(Math.ceil(error.retryAfterMs / 1_000)));
                }
                return res.status(429).send('GitHub rate limit reached. Try again later.');
            }
            console.error('[GitHub Profile Redirect] Lookup failed:', safeErrorMetadata(error));
            return res.status(502).send('GitHub profile could not be verified.');
        }
    });

    app.get('/api/me', authenticatedMeRateLimit, async (req, res) => {
        if (!req.session.planetData?.user) {
            return res.status(401).json({ error: 'Not logged in' });
        }

        let githubProfileVerified = false;
        if (req.session.github_token && planetService?.refreshAuthenticatedUser) {
            try {
                const user = await planetService.refreshAuthenticatedUser(
                    req.session.github_token,
                    req.session.planetData.user
                );
                req.session.planetData.user = user;
                if (req.session.planetData.planetData) {
                    req.session.planetData.planetData.username = user.login;
                }
                githubProfileVerified = true;
            } catch (error) {
                console.warn('[GitHub Profile] Could not refresh the authenticated username:', safeErrorMetadata(error));
            }
        }

        const lastUpdated = req.session.last_updated;
        const hadPlanetData = Boolean(req.session.planetData.planetData);
        const isStale = !hadPlanetData || !lastUpdated || (Date.now() - lastUpdated > cacheDuration);

        if (req.session.github_token && isStale) {
            console.log('[Auto Update] データを更新中... (キャッシュ切れ)');
            try {
                const user = req.session.planetData.user;
                const updatedPlanetData = await planetService.updateAndSavePlanetData(user, req.session.github_token);
                const { observedTotalContributions, isNewPlanet, ...newPlanetData } = updatedPlanetData;
                req.session.planetData.planetData = newPlanetData;
                req.session.last_updated = Date.now();
                if (!hadPlanetData) {
                    try {
                        req.session.pendingProgressNotice = await planetService.recordLoginProgress(
                            user.id,
                            updatedPlanetData
                        );
                    } catch (error) {
                        console.error('[Login Progress] 初回記録に失敗しました:', safeErrorMetadata(error));
                    }
                }
                console.log('[Auto Update] 更新完了');
            } catch (error) {
                console.error('[Auto Update] 更新失敗 (キャッシュを返します):', safeErrorMetadata(error));
            }
        } else {
            console.log('[Auto Update] キャッシュ有効のためスキップ');
        }

        if (!req.session.planetData.planetData) {
            res.setHeader('Retry-After', '5');
            return res.status(503).json({
                error: 'Planet data is temporarily unavailable',
                authenticated: true
            });
        }

        const progressNotice = req.session.pendingProgressNotice || {
            contributionDelta: 0,
            newlyUnlockedAchievementIds: []
        };
        delete req.session.pendingProgressNotice;

        res.json({
            ...req.session.planetData,
            planetData: normalizePlanetCommitCounts(req.session.planetData.planetData),
            progressNotice,
            githubProfileVerified
        });
    });

    app.post('/api/save-title', async (req, res) => {
        const userId = req.session?.planetData?.user?.id;
        if (!userId || !planetQueryService) {
            return res.status(401).json({ error: 'Not logged in' });
        }

        const { prefix, suffix } = req.body || {};
        const unlockedTitles = req.session.planetData.planetData?.unlockedTitles || {
            prefixes: ['名もなき'],
            suffixes: ['旅人']
        };
        const newTitle = { prefix, suffix };

        try {
            const saved = await planetQueryService.saveActiveTitle(userId, newTitle, unlockedTitles);
            if (!saved) return res.status(400).json({ error: 'Invalid title' });
            if (req.session.planetData.planetData) {
                req.session.planetData.planetData.activeTitle = newTitle;
            }
            res.json({ success: true, activeTitle: newTitle });
        } catch (error) {
            console.error('Save Title Error:', safeErrorMetadata(error));
            res.status(500).json({ error: 'DB Error' });
        }
    });

    app.get('/api/me/language-history', async (req, res) => {
        const githubId = req.session?.planetData?.user?.id;
        if (!githubId) return res.status(401).json({ error: 'Not logged in' });
        res.set('Cache-Control', 'private, no-store');
        if (isHistoryDisabled(req.session?.planetData?.user?.login)) {
            return res.json({ history: [] });
        }
        if (!planetQueryService) return res.status(503).json({ error: 'DB unavailable' });

        try {
            const rows = await planetQueryService.getLanguageHistoryByGithubId(githubId);
            res.json({
                history: rows.map((row) => ({
                    capturedAt: row.capturedAt,
                    mainLanguage: row.mainLanguage,
                    planetColor: row.planetColor,
                    languagePercentages: row.languagePercentages || {}
                }))
            });
        } catch (error) {
            console.error('[API /me/language-history Error]', safeErrorMetadata(error));
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });

    app.get('/api/me/authored-language-history', async (req, res) => {
        const user = req.session?.planetData?.user;
        if (!user?.id) return res.status(401).json({ error: 'Not logged in' });
        if (isHistoryDisabled(user.login)) {
            res.set('Cache-Control', 'private, no-store');
            return res.json({
                history: [],
                status: { state: 'disabled', ready: false, partial: false }
            });
        }
        if (!authoredLanguageHistoryService) {
            return res.status(503).json({ error: 'History unavailable' });
        }
        res.set('Cache-Control', 'private, no-store');

        try {
            res.json(await authoredLanguageHistoryService.getHistory(user.id));
        } catch (error) {
            console.error('[API /me/authored-language-history Error]', safeErrorMetadata(error));
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });

    app.post('/api/me/authored-language-history/scan', async (req, res) => {
        const user = req.session?.planetData?.user;
        if (!user?.id || !req.session.github_token) {
            return res.status(401).json({ error: 'Not logged in' });
        }
        if (isHistoryDisabled(user.login)) {
            res.set('Cache-Control', 'private, no-store');
            return res.json({
                history: [],
                status: { state: 'disabled', ready: false, partial: false },
                scanStarted: false
            });
        }
        if (!authoredLanguageHistoryService) {
            return res.status(503).json({ error: 'History unavailable' });
        }
        res.set('Cache-Control', 'private, no-store');

        try {
            const scanStarted = await authoredLanguageHistoryService.startScan({
                githubId: user.id,
                login: user.login,
                accessToken: req.session.github_token,
                accountCreatedAt: user.created_at
            });
            const result = await authoredLanguageHistoryService.getHistory(user.id);
            res.json({ ...result, scanStarted });
        } catch (error) {
            console.error('[API /me/authored-language-history/scan Error]', safeErrorMetadata(error));
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });

    app.get('/api/planets/showcase/:slug', (req, res) => {
        const planet = getShowcasePlanet(req.params.slug);
        if (!planet) return res.status(404).json({ error: 'Showcase planet not found' });
        res.json(planet);
    });

    app.get('/api/planets/user/:username', async (req, res) => {
        if (!planetQueryService) return res.status(503).json({ error: 'DB unavailable' });

        try {
            const row = await planetQueryService.getByUsername(req.params.username, req.session.github_token);
            if (!row) return res.status(404).json({ error: 'Planet not found' });
            res.json(toPlanetResponse(row));
        } catch (error) {
            console.error('[API /user/:username Error]', safeErrorMetadata(error));
            if ([403, 429].includes(error.response?.status)) {
                if (error.retryAfterMs) {
                    res.setHeader('Retry-After', String(Math.ceil(error.retryAfterMs / 1_000)));
                }
                return res.status(429).json({ error: 'GitHub public API rate limit reached' });
            }
            if (error.response?.status === 404) return res.status(404).json({ error: 'Planet not found' });
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });

    app.get('/api/planets/random', async (req, res) => {
        if (!planetQueryService) return res.status(503).json({ error: 'DB unavailable' });

        try {
            randomPerformance?.markRandomStage(req, 'route-entered');
            const loggedInUserId = req.session?.planetData?.user?.id;
            const useSessionHistory = Boolean(loggedInUserId) || randomHistoryStorage === 'session';
            const cookieHistoryId = readCookie(
                req.headers?.cookie,
                ANONYMOUS_RANDOM_COOKIE
            );
            randomPerformance?.markRandomStage(req, 'history-resolved');
            randomPerformance?.markRandomStage(req, 'query-start');
            const row = await planetQueryService.getRandom({
                loggedInUserId,
                lastRandomVisitedId: useSessionHistory
                    ? req.session?.lastRandomVisitedId || cookieHistoryId
                    : cookieHistoryId
            });
            randomPerformance?.markRandomStage(req, 'query-complete');
            if (!row) return res.status(404).json({ error: 'No planets found' });

            if (useSessionHistory) {
                req.session.lastRandomVisitedId = row.githubId;
            } else {
                writeAnonymousRandomCookie(res, row.githubId);
            }
            randomPerformance?.markRandomStage(req, 'history-stored');
            res.json(toPlanetResponse(row));
            randomPerformance?.markRandomStage(req, 'response-serialized');
        } catch (error) {
            console.error('[API /random Error]', safeErrorMetadata(error));
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });
}
