import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import tls from 'node:tls';
import { once } from 'node:events';
import test, { before, after } from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { createPostgresPool } from '../src/infrastructure/database/postgres.js';

let key, cert, caPath, fixtureDirectory;
before(() => {
    fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'githubplanet-tls-'));
    caPath = path.join(fixtureDirectory, 'server.crt');
    const keyPath = path.join(fixtureDirectory, 'server.key');
    // 実サービスに流用できる秘密鍵を保存せず、検証専用の証明書を毎回生成する。
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
        '-keyout', keyPath, '-out', caPath, '-subj', '/CN=database.fixture.test',
        '-addext', 'subjectAltName=DNS:database.fixture.test'], { stdio: 'ignore' });
    key = fs.readFileSync(keyPath);
    cert = fs.readFileSync(caPath);
});
after(() => {
    if (!fixtureDirectory) return;
    for (const file of ['server.key', 'server.crt']) {
        const target = path.join(fixtureDirectory, file);
        if (fs.existsSync(target)) fs.unlinkSync(target);
    }
    fs.rmdirSync(fixtureDirectory);
});

async function withTlsDatabase(callback) {
    const sockets = new Set();
    const context = tls.createSecureContext({ key, cert });
    const server = net.createServer((socket) => {
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));
        socket.on('error', () => {});
        socket.once('data', (request) => {
            assert.equal(request.readInt32BE(4), 80877103, 'PostgreSQL SSL negotiation');
            socket.write('S');
            const secured = new tls.TLSSocket(socket, { isServer: true, secureContext: context });
            secured.on('error', () => socket.destroy());
            secured.on('end', () => secured.end());
            let startup = Buffer.alloc(0), authenticated = false;
            secured.on('data', (part) => {
                if (authenticated) return;
                startup = Buffer.concat([startup, part]);
                if (startup.length < 4 || startup.length < startup.readInt32BE(0)) return;
                authenticated = true;
                secured.write(Buffer.from([82, 0, 0, 0, 8, 0, 0, 0, 0, 90, 0, 0, 0, 5, 73]));
            });
        });
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try { await callback(server.address().port); }
    finally { for (const socket of sockets) socket.destroy(); await new Promise((resolve) => server.close(resolve)); }
}

async function connect(port, { trust = false, hostname = 'database.fixture.test' } = {}) {
    const url = new URL(`postgresql://fixture:fixture@database.fixture.test:${port}/fixture`);
    if (trust) url.searchParams.set('sslrootcert', caPath);
    const pool = createPostgresPool(url.href, { max: 1 });
    const client = new pg.Client({ ...pool.options, host: '127.0.0.1',
        ssl: { ...pool.options.ssl, servername: hostname }, connectionTimeoutMillis: 5000 });
    try { await client.connect(); return client.connection.stream.authorized; }
    finally { await client.end().catch(() => {}); await pool.end(); }
}

test('rejects an untrusted PostgreSQL TLS certificate in a real handshake', { timeout: 10000 }, async () => {
    await withTlsDatabase(async (port) => {
        await assert.rejects(connect(port), (error) => /SELF_SIGNED|VERIFY_LEAF|UNABLE_TO_GET_ISSUER/.test(error.code));
    });
});

test('rejects a hostname mismatch even with a trusted PostgreSQL certificate', { timeout: 10000 }, async () => {
    await withTlsDatabase(async (port) => {
        await assert.rejects(connect(port, { trust: true, hostname: 'wrong.fixture.test' }), { code: 'ERR_TLS_CERT_ALTNAME_INVALID' });
    });
});

test('connects through PostgreSQL SSL negotiation with the configured CA and matching hostname', { timeout: 10000 }, async () => {
    await withTlsDatabase(async (port) => {
        assert.equal(await connect(port, { trust: true }), true);
    });
});
