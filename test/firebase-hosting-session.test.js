import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('本番環境ではFirebase Hostingが転送する予約済みCookie名を使う', async () => {
    const serverSource = await readFile(new URL('../server.js', import.meta.url), 'utf8');

    assert.match(
        serverSource,
        /const sessionCookieName = isProduction \? '__session' : 'connect\.sid';/
    );
    assert.match(serverSource, /app\.use\(session\(\{[\s\S]*?name: sessionCookieName,/);
});
