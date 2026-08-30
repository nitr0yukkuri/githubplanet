import { normalizePlanetCommitCounts } from '../../domain/planet/planet.js';
import { getShowcasePlanet } from '../../domain/planet/showcase-planets.js';
import { toPlanetResponse } from './planet-response.js';

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
    cacheDuration,
    randomHistoryStorage = 'cookie',
    randomPerformance = null
}) {
    app.get('/api/me', async (req, res) => {
        if (!req.session.planetData) {
            return res.status(401).json({ error: 'Not logged in' });
        }

        const lastUpdated = req.session.last_updated;
        const isStale = !lastUpdated || (Date.now() - lastUpdated > cacheDuration);

        if (req.session.github_token && isStale) {
            console.log('[Auto Update] データを更新中... (キャッシュ切れ)');
            try {
                const user = req.session.planetData.user;
                const updatedPlanetData = await planetService.updateAndSavePlanetData(user, req.session.github_token);
                const { observedTotalContributions, isNewPlanet, ...newPlanetData } = updatedPlanetData;
                req.session.planetData.planetData = newPlanetData;
                req.session.last_updated = Date.now();
                console.log('[Auto Update] 更新完了');
            } catch (error) {
                console.error('[Auto Update] 更新失敗 (キャッシュを返します):', error.message);
            }
        } else {
            console.log('[Auto Update] キャッシュ有効のためスキップ');
        }

        const progressNotice = req.session.pendingProgressNotice || {
            contributionDelta: 0,
            newlyUnlockedAchievementIds: []
        };
        delete req.session.pendingProgressNotice;

        res.json({
            ...req.session.planetData,
            planetData: normalizePlanetCommitCounts(req.session.planetData.planetData),
            progressNotice
        });
    });

    app.post('/api/save-title', async (req, res) => {
        if (!req.session.planetData || !planetQueryService) {
            return res.status(401).json({ error: 'Not logged in' });
        }

        const { prefix, suffix } = req.body;
        const userId = req.session.planetData.user.id;
        const newTitle = { prefix, suffix };

        try {
            await planetQueryService.saveActiveTitle(userId, newTitle);
            if (req.session.planetData.planetData) {
                req.session.planetData.planetData.activeTitle = newTitle;
            }
            res.json({ success: true, activeTitle: newTitle });
        } catch (error) {
            console.error('Save Title Error:', error);
            res.status(500).json({ error: 'DB Error' });
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
            console.error('[API /user/:username Error]', error);
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
                req.session.lastRandomVisitedId = row.github_id;
            } else {
                writeAnonymousRandomCookie(res, row.github_id);
            }
            randomPerformance?.markRandomStage(req, 'history-stored');
            res.json(toPlanetResponse(row));
            randomPerformance?.markRandomStage(req, 'response-serialized');
        } catch (error) {
            console.error('[API /random Error]', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });
}
