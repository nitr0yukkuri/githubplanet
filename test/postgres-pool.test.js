import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
    assert.equal(poolOptions.ssl, false);
    assert.equal(poolOptions.host, 'localhost');
    assert.equal(poolOptions.connectionString, undefined);
});

test('recognizes empty-authority URLs and PostgreSQL Unix socket paths as local', () => {
    const connectionStrings = [
        'postgresql://user:password@/database?host=localhost&sslmode=disable',
        'postgresql:///database?host=%2Fcloudsql%2Fproject%3Aregion%3Ainstance',
        '/var/run/postgresql database'
    ];
    for (const connectionString of connectionStrings) {
        const { poolOptions, parsedSsl } = capturePoolOptions(connectionString);
        assert.equal(poolOptions.ssl, false, connectionString);
        assert.equal(parsedSsl, false, connectionString);
    }
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

test('keeps a configured root certificate while requiring verification', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'githubplanet-postgres-ca-'));
    const certificatePath = path.join(directory, 'root-ca.pem');
    const certificate = 'test root certificate';
    fs.writeFileSync(certificatePath, certificate);

    try {
        const connectionStrings = [
            `postgresql://user:password@example.com/database?sslmode=no-verify&sslrootcert=${encodeURIComponent(certificatePath)}`,
            `postgresql://user:password@example.com/database?uselibpqcompat=true&sslmode=verify-ca&sslrootcert=${encodeURIComponent(certificatePath)}`
        ];
        for (const connectionString of connectionStrings) {
            const { parsedSsl } = capturePoolOptions(connectionString);
            assert.deepEqual(parsedSsl, { ca: certificate, rejectUnauthorized: true });
        }
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});
