import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { createApplication } from './src/bootstrap/create-application.js';
import { createPostgresPool } from './src/infrastructure/database/postgres.js';
import { assertDatabaseMigrationsApplied } from './src/infrastructure/database/migrations.js';
import { createLanguageColorRepository } from './src/infrastructure/database/language-color-repository.js';
import { safeErrorMetadata } from './src/shared/error-metadata.js';

const port = Number.parseInt(process.env.PORT, 10) || 3000;
const publicBaseUrl = (process.env.PUBLIC_BASE_URL || 'https://githubplanet.dev').replace(/\/+$/, '');
const pool = createPostgresPool(process.env.DATABASE_URL);
await assertDatabaseMigrationsApplied(pool).catch((error) => {
    console.error('[DB] Startup migration check failed:', safeErrorMetadata(error));
    process.exit(1);
});
const languageColorCache = await createLanguageColorRepository(pool)?.loadLanguageColorCache() || {};
let io;
const { app } = createApplication({
    pool, languageColorCache, rootDirectory: path.dirname(fileURLToPath(import.meta.url)),
    emitMeteor: (payload) => io.emit('meteor', payload)
});

const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on port ${port}`);
});

// Cloud Run直URLへ切り替えたPollingフォールバックは、公開サイトのOriginだけ許可する。
io = new Server(server, { cors: { origin: publicBaseUrl } });
// HTTPログの400だけでは拒否理由が分からないため、WebSocket失敗の必要項目だけ記録する。
io.engine.on('connection_error', (error) => {
    const request = error.req;
    const requestUrl = new URL(request?.url || '/', 'http://localhost');
    if (requestUrl.searchParams.get('transport') !== 'websocket') return;

    console.warn('[Socket.IO] WebSocket connection rejected', {
        code: Number.isInteger(error.code) && error.code >= 0 && error.code <= 6 ? error.code : 'unknown',
        transport: 'websocket'
    });
});
io.on('connection', (socket) => {
    console.log('[Socket.IO] Client connected', {
        transport: socket.conn.transport.name
    });
});
