function nowNanoseconds() {
    return process.hrtime.bigint();
}

function elapsedMilliseconds(startedAt) {
    return Number(nowNanoseconds() - startedAt) / 1_000_000;
}

function reportSafely(reporter, event) {
    try {
        reporter?.(event);
    } catch {
        // Performance logging must never affect the external API request.
    }
}

export function createExternalPerformanceReporter({ enabled = false, logger = console.log } = {}) {
    function report(event) {
        if (!enabled) return;
        try {
            logger(`[External Performance] ${JSON.stringify(event)}`);
        } catch {
            // Performance logging must never affect the request.
        }
    }

    return {
        record(event) {
            report({ event: 'external_request', ...event });
        }
    };
}

export function measureExternalOperation(reporter, operation, execute, details = {}) {
    if (!reporter) return execute();

    const startedAt = nowNanoseconds();
    return Promise.resolve()
        .then(execute)
        .then((result) => {
            reportSafely(reporter, {
                operation,
                ...details,
                durationMs: elapsedMilliseconds(startedAt),
                outcome: 'success'
            });
            return result;
        })
        .catch((error) => {
            reportSafely(reporter, {
                operation,
                ...details,
                durationMs: elapsedMilliseconds(startedAt),
                outcome: 'error',
                errorCode: error?.code || error?.response?.status || 'unknown'
            });
            throw error;
        });
}
