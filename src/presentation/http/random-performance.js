function nowNanoseconds() {
    return process.hrtime.bigint();
}

function elapsedMilliseconds(startedAt) {
    return Number(nowNanoseconds() - startedAt) / 1_000_000;
}

function hasCookie(cookieHeader, name) {
    return new RegExp(`(?:^|;\\s*)${name}=`).test(cookieHeader || '');
}

export function createRandomPerformanceReporter({ enabled = false, logger = console.log } = {}) {
    function report(event) {
        if (!enabled) return;
        try {
            logger(`[Random Performance] ${JSON.stringify(event)}`);
        } catch {
            // Performance logging must never affect the request.
        }
    }

    return {
        startMiddleware(req, res, next) {
            if (!enabled || req.path !== '/api/planets/random') return next();

            req.randomPerformance = {
                requestStartedAt: nowNanoseconds(),
                sessionStoreCookiePresent: hasCookie(req.headers?.cookie, 'connect\\.sid'),
                randomHistoryCookiePresent: hasCookie(req.headers?.cookie, 'githubplanet_random_planet')
            };
            next();
        },

        beforeSessionMiddleware(req, res, next) {
            if (enabled && req.randomPerformance) {
                req.randomPerformance.sessionStartedAt = nowNanoseconds();
            }
            next();
        },

        middleware(req, res, next) {
            if (!enabled || req.path !== '/api/planets/random') return next();

            const performanceState = req.randomPerformance || {
                requestStartedAt: nowNanoseconds(),
                sessionStoreCookiePresent: false,
                randomHistoryCookiePresent: false
            };
            const sessionSaveDurations = [];
            const session = req.session;
            const sessionLoadMs = performanceState.sessionStartedAt
                ? elapsedMilliseconds(performanceState.sessionStartedAt)
                : null;

            if (session?.save) {
                const originalSave = session.save.bind(session);
                session.save = (callback) => {
                    const saveStartedAt = nowNanoseconds();
                    return originalSave((error) => {
                        sessionSaveDurations.push({
                            durationMs: elapsedMilliseconds(saveStartedAt),
                            error: error?.message || null
                        });
                        callback?.(error);
                    });
                };
            }

            res.once('finish', () => {
                report({
                    event: 'random_request',
                    httpMs: elapsedMilliseconds(performanceState.requestStartedAt),
                    sessionLoadMs,
                    sessionStoreCookiePresent: performanceState.sessionStoreCookiePresent,
                    randomHistoryCookiePresent: performanceState.randomHistoryCookiePresent,
                    authenticated: Boolean(session?.planetData?.user?.id),
                    sessionSave: sessionSaveDurations,
                    routeStages: performanceState.routeStages || [],
                    statusCode: res.statusCode
                });
            });

            next();
        },

        markRandomStage(req, stage) {
            if (!enabled || !req?.randomPerformance) return;

            const performanceState = req.randomPerformance;
            const markedAt = nowNanoseconds();
            const previousStageAt = performanceState.lastRouteStageAt
                || performanceState.requestStartedAt;
            const routeStages = performanceState.routeStages
                || (performanceState.routeStages = []);
            routeStages.push({
                stage,
                durationMs: elapsedMilliseconds(previousStageAt),
                fromRequestMs: elapsedMilliseconds(performanceState.requestStartedAt)
            });
            performanceState.lastRouteStageAt = markedAt;
        },

        recordRandomQuery({
            durationMs,
            exclusionCount,
            returnedRows,
            poolBefore = null,
            poolAfter = null,
            queryCount = null,
            strategy = null,
            error = null
        }) {
            report({
                event: 'random_sql',
                dbRoundTripMs: durationMs,
                exclusionCount,
                returnedRows,
                poolBefore,
                poolAfter,
                queryCount,
                strategy,
                error
            });
        }
    };
}
