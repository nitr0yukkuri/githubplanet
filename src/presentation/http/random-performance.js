function nowNanoseconds() {
    return process.hrtime.bigint();
}

function elapsedMilliseconds(startedAt) {
    return Number(nowNanoseconds() - startedAt) / 1_000_000;
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
        middleware(req, res, next) {
            if (!enabled || req.path !== '/api/planets/random') return next();

            const requestStartedAt = nowNanoseconds();
            const sessionSaveDurations = [];
            const session = req.session;

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
                    httpMs: elapsedMilliseconds(requestStartedAt),
                    sessionSave: sessionSaveDurations,
                    statusCode: res.statusCode
                });
            });

            next();
        },

        recordRandomQuery({ durationMs, exclusionCount, returnedRows, error = null }) {
            report({
                event: 'random_sql',
                dbRoundTripMs: durationMs,
                exclusionCount,
                returnedRows,
                error
            });
        }
    };
}
