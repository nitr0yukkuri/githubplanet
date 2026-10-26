import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { createPostgresPool } from '../src/infrastructure/database/postgres.js';

function capturePoolOptions(connectionString) {
    const OriginalPool = pg.Pool;
    let poolOptions;
    let errorHandler;
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
        createPostgresPool(connectionString, { max: 1, queryTimeout: 0, statementTimeout: 0 });
        return {
            poolOptions,
            errorHandler,
            parsedSsl: new pg.Client(poolOptions).connectionParameters.ssl
        };
    } finally {
        pg.Pool = OriginalPool;
    }
}

test('handles idle PostgreSQL client errors without leaving the pool error unobserved', () => {
    const { poolOptions, errorHandler } = capturePoolOptions('postgresql://user:password@example.com/database');
    assert.equal(typeof errorHandler, 'function');
    assert.equal(poolOptions.max, 1);
    assert.equal(poolOptions.query_timeout, 0);
    assert.equal(poolOptions.statement_timeout, 0);
    assert.deepEqual(poolOptions.ssl, { rejectUnauthorized: true });
});

test('keeps TLS verification enabled when a remote URL credential contains localhost', () => {
    const { poolOptions } = capturePoolOptions('postgresql://user:password-localhost@example.com/database');
    assert.deepEqual(poolOptions.ssl, { rejectUnauthorized: true });
});

test('does not require TLS for exact local PostgreSQL hosts', () => {
    for (const host of ['localhost', '127.0.0.1', '[::1]', 'db']) {
        const { poolOptions } = capturePoolOptions(`postgresql://user:password@${host}/database`);
        assert.equal(poolOptions.ssl, false, host);
    }
});

test('strips SSL query flags from local connection strings', () => {
    const { poolOptions, parsedSsl } = capturePoolOptions(
        'postgresql://user:password@localhost/database?sslmode=require&ssl=1'
    );
    assert.equal(parsedSsl, false);
    assert.doesNotMatch(poolOptions.connectionString, /sslmode|ssl=/i);
});

test('does not let connection-string SSL flags disable remote certificate verification', () => {
    for (const parameters of [
        'sslmode=no-verify',
        'sslmode=disable',
        'ssl=0',
        'uselibpqcompat=true&sslmode=prefer'
    ]) {
        const connectionString = `postgresql://user:password@example.com/database?${parameters}`;
        const { parsedSsl } = capturePoolOptions(connectionString);
        assert.deepEqual(parsedSsl, { rejectUnauthorized: true }, parameters);
    }
});
