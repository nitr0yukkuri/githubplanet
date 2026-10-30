import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionCookieOptions } from '../src/presentation/http/session-cookie-options.js';

test('本番環境ではFirebase Hostingが転送する予約済みCookie名を使う', () => {
    assert.deepEqual(createSessionCookieOptions(true), {
        name: '__session', cookie: { secure: true, httpOnly: true, sameSite: 'lax' }
    });
    assert.deepEqual(createSessionCookieOptions(false), {
        name: 'connect.sid', cookie: { secure: false, httpOnly: true, sameSite: 'lax' }
    });
});
