import assert from 'node:assert/strict';
import test from 'node:test';
import { createMeteorEventRepository } from '../src/infrastructure/database/meteor-event-repository.js';

test('persists a meteor before returning its replay cursor and removes expired history', async () => {
    const queries = [];
    const client = {
        async query(sql, parameters = []) {
            queries.push({ sql: sql.trim(), parameters });
            if (sql.includes('INSERT INTO meteor_events')) {
                return {
                    rows: [{
                        id: '42',
                        payload: JSON.parse(parameters[0]),
                        created_at: '2026-10-23T06:00:00.000Z'
                    }]
                };
            }
            return { rows: [], rowCount: 0 };
        },
        release() {}
    };
    const pool = {
        async connect() { return client; },
        async query(sql, parameters) {
            queries.push({ sql: sql.trim(), parameters });
            return { rows: [], rowCount: 0 };
        }
    };
    const repository = createMeteorEventRepository(pool, { logger: { warn() {} } });

    const event = await repository.append({ color: '#abcdef', language: 'Elm', scale: 1.2 });

    assert.deepEqual(event, {
        color: '#abcdef',
        language: 'Elm',
        scale: 1.2,
        id: '42',
        createdAt: '2026-10-23T06:00:00.000Z'
    });
    assert.equal(queries[0].sql, 'BEGIN');
    assert.match(queries[1].sql, /pg_advisory_xact_lock/);
    assert.match(queries[2].sql, /INSERT INTO meteor_events/);
    assert.equal(queries[3].sql, 'COMMIT');
    assert.match(queries[4].sql, /INTERVAL '30 minutes'/);
    assert.deepEqual(queries[4].parameters, [500]);
});

test('replays recent events in ascending ID order after a validated cursor', async () => {
    let parameters;
    const client = {
        async query(sql, values) {
            assert.match(sql, /ORDER BY id ASC/);
            parameters = values;
            return {
                rows: [{ id: '43', payload: { language: 'Perl' }, created_at: new Date('2026-10-23T06:00:01.000Z') }]
            };
        }
    };
    const repository = createMeteorEventRepository({
        async connect() { return { ...client, release() {} }; },
        query: client.query
    });

    const events = await repository.findAfter('42');

    assert.deepEqual(parameters, ['42', 500]);
    assert.deepEqual(events, [{
        language: 'Perl',
        id: '43',
        createdAt: '2026-10-23T06:00:01.000Z'
    }]);
});

test('rejects invalid cursors and replay limits before querying the database', async () => {
    let calls = 0;
    const repository = createMeteorEventRepository({
        async query() { calls += 1; return { rows: [] }; }
    });

    await assert.rejects(() => repository.findAfter('not-a-number'), TypeError);
    await assert.rejects(() => repository.findAfter('0', 501), RangeError);
    assert.equal(calls, 0);
});
