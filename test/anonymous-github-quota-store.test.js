import assert from 'node:assert/strict';
import test from 'node:test';
import { createAnonymousGithubQuotaStore } from '../src/infrastructure/database/anonymous-github-quota-store.js';

test('reserves anonymous GitHub lookups per HMAC client key in PostgreSQL', async () => {
    const calls = [];
    let requestCount = 0;
    const windowStartedAt = new Date();
    const repository = createAnonymousGithubQuotaStore({
        async query(sql, params = []) {
            calls.push([sql, params]);
            if (sql.includes('INSERT INTO github_profile_lookup_quota')) {
                requestCount += 1;
                return { rows: [{ request_count: requestCount, window_started_at: windowStartedAt }] };
            }
            return { rows: [] };
        }
    });

    const requesterKey = 'a'.repeat(64);
    const firstReservation = await repository.reserveGithubProfileLookup(requesterKey, 2, 3_600_000);
    assert.equal(firstReservation.allowed, true);
    assert.ok(firstReservation.retryAfterMs > 0 && firstReservation.retryAfterMs <= 3_600_000);
    assert.equal((await repository.reserveGithubProfileLookup(requesterKey, 2, 3_600_000)).allowed, true);
    assert.equal((await repository.reserveGithubProfileLookup(requesterKey, 2, 3_600_000)).allowed, false);

    const reservation = calls.find(([sql]) => sql.includes('INSERT INTO github_profile_lookup_quota'));
    assert.deepEqual(reservation[1], [requesterKey, 3_600_000]);
    assert.match(reservation[0], /ON CONFLICT \(quota_key\) DO UPDATE/);
    assert.match(reservation[0], /quota\.request_count \+ 1/);
    assert.doesNotMatch(reservation[1].join(' '), /203\.0\.113\./);
    await assert.rejects(repository.reserveGithubProfileLookup('203.0.113.1', 2, 3_600_000), /Invalid anonymous GitHub lookup key/);
});
