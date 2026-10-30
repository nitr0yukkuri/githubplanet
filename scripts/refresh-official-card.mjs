import { appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { safeErrorMetadata } from '../src/shared/error-metadata.js';

export function requireRefreshToken(token) {
    if (!token) throw new Error('Configure CARD_REFRESH_TOKEN before enabling official profile refresh');
}

export async function refreshOfficialCard({ token, fetchImpl = fetch, now = Date.now,
    wait = delay, timeoutMs = 15 * 60 * 1000 }) {
    requireRefreshToken(token);
    const deadline = now() + timeoutMs;
    while (now() < deadline) {
        const response = await fetchImpl('https://githubplanet.dev/api/planets/me/refresh', {
            method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
        });
        if (response.status === 404) {
            await response.body?.cancel();
            await wait(Math.min(20000, Math.max(0, deadline - now())));
            continue;
        }
        if (!response.ok) throw new Error(`Official profile refresh failed (${response.status})`);
        const { username } = await response.json();
        if (typeof username !== 'string' || !/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(username)) {
            throw new Error('Official profile refresh returned an invalid username');
        }
        return username;
    }
    throw new Error('Official profile refresh deployment wait timed out');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        requireRefreshToken(process.env.CARD_REFRESH_TOKEN);
        if (!process.argv.includes('--check-config')) {
            const username = await refreshOfficialCard({ token: process.env.CARD_REFRESH_TOKEN });
            if (!process.env.GITHUB_ENV) throw new Error('GitHub Actions environment file is unavailable');
            await appendFile(process.env.GITHUB_ENV, `CARD_PROFILE_USERNAME=${username}\n`, 'utf8');
            console.log('Official profile planet data refreshed successfully.');
        }
    } catch (error) {
        // fetchの例外本文に認証情報が含まれても、Actionsログへ書き出さない。
        console.error('[Official card refresh] Failed:', safeErrorMetadata(error));
        process.exitCode = 1;
    }
}
