import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { createRandomPerformanceReporter } from '../src/presentation/http/random-performance.js';

function parseLog(message) {
    return JSON.parse(message.replace('[Random Performance] ', ''));
}

test('reports random SQL, session save, and HTTP timings', async () => {
    const logs = [];
    const reporter = createRandomPerformanceReporter({
        enabled: true,
        logger: (message) => logs.push(message)
    });
    const response = new EventEmitter();
    response.statusCode = 200;
    let saved = false;
    const request = {
        path: '/api/planets/random',
        session: {
            save(callback) {
                saved = true;
                setImmediate(() => callback());
            }
        }
    };

    reporter.middleware(request, response, () => {});
    request.session.save(() => {});
    reporter.recordRandomQuery({
        durationMs: 12.5,
        exclusionCount: 2,
        returnedRows: 1
    });
    await new Promise((resolve) => setImmediate(resolve));
    response.emit('finish');

    assert.equal(saved, true);
    assert.equal(logs.length, 2);
    assert.deepEqual(parseLog(logs[0]), {
        event: 'random_sql',
        dbRoundTripMs: 12.5,
        exclusionCount: 2,
        returnedRows: 1,
        error: null
    });
    const requestLog = parseLog(logs[1]);
    assert.equal(requestLog.event, 'random_request');
    assert.equal(requestLog.statusCode, 200);
    assert.equal(requestLog.sessionSave.length, 1);
    assert.equal(requestLog.sessionSave[0].error, null);
    assert.equal(typeof requestLog.sessionSave[0].durationMs, 'number');
    assert.equal(typeof requestLog.httpMs, 'number');
});

test('does not instrument random requests when disabled', () => {
    const logs = [];
    const reporter = createRandomPerformanceReporter({
        enabled: false,
        logger: (message) => logs.push(message)
    });
    let nextCalled = false;
    const request = {
        path: '/api/planets/random',
        session: { save() { throw new Error('should not be wrapped'); } }
    };
    const response = new EventEmitter();

    reporter.middleware(request, response, () => {
        nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(logs.length, 0);
});
