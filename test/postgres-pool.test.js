import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { createPostgresPool } from '../src/infrastructure/database/postgres.js';

test('handles idle PostgreSQL client errors without leaving the pool error unobserved', () => {
    const OriginalPool = pg.Pool;
    let errorHandler;

    class FakePool {
        on(eventName, handler) {
            if (eventName === 'error') errorHandler = handler;
        }
    }

    pg.Pool = FakePool;
    try {
        createPostgresPool('postgresql://user:password@example.com/database');
        assert.equal(typeof errorHandler, 'function');
    } finally {
        pg.Pool = OriginalPool;
    }
});
