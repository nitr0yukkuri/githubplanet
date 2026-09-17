import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { createPostgresPool } from '../src/infrastructure/database/postgres.js';

test('handles idle PostgreSQL client errors without leaving the pool error unobserved', () => {
    const OriginalPool = pg.Pool;
    let errorHandler;
    let poolOptions;

    class FakePool {
        constructor(options) {
            poolOptions = options;
        }

        on(eventName, handler) {
            if (eventName === 'error') errorHandler = handler;
        }
    }

    pg.Pool = FakePool;
    try {
        createPostgresPool('postgresql://user:password@example.com/database', {
            max: 1,
            queryTimeout: 0,
            statementTimeout: 0
        });
        assert.equal(typeof errorHandler, 'function');
        assert.equal(poolOptions.max, 1);
        assert.equal(poolOptions.query_timeout, 0);
        assert.equal(poolOptions.statement_timeout, 0);
    } finally {
        pg.Pool = OriginalPool;
    }
});
