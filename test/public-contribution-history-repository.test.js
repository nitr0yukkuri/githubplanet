import assert from 'node:assert/strict';
import test from 'node:test';
import { createPublicContributionHistoryRepository } from '../src/infrastructure/database/public-contribution-history-repository.js';

function completeHistory() {
    return {
        githubLogin: 'octocat',
        calendarStartedAt: '2025-01-01T00:00:00.000Z',
        calendarYears: [2025],
        capturedAt: '2025-01-02T00:00:00.000Z',
        dailyContributions: [
            { date: '2025-01-01', contributionCount: 2 },
            { date: '2025-01-02', contributionCount: 0 }
        ]
    };
}

test('compacts verified zero-contribution days and schedules the next refresh atomically', async () => {
    let call;
    const repository = createPublicContributionHistoryRepository({
        async query(sql, parameters) {
            call = { sql, parameters };
            return { rowCount: 1, rows: [{ github_id: '42' }] };
        }
    });

    assert.equal(await repository.savePublicContributionHistory('42', completeHistory()), true);
    assert.match(call.sql, /planet_public_contribution_histories/);
    assert.match(call.sql, /daily_contributions IS DISTINCT FROM EXCLUDED\.daily_contributions/);
    assert.match(call.sql, /planet_public_history_refresh_jobs/);
    assert.deepEqual(JSON.parse(call.parameters[4]), [{ date: '2025-01-01', contributionCount: 2 }]);
});

test('rejects incomplete calendars before writing to PostgreSQL', async () => {
    let calls = 0;
    const repository = createPublicContributionHistoryRepository({
        async query() { calls += 1; return { rowCount: 0, rows: [] }; }
    });

    await assert.rejects(
        repository.savePublicContributionHistory('42', {
            ...completeHistory(),
            dailyContributions: [{ date: '2025-01-01', contributionCount: 1 }]
        }),
        /Incomplete public contribution history days/
    );
    assert.equal(calls, 0);
});

test('claims one due planet with a short lease and skips a row claimed by another worker', async () => {
    let sql;
    const repository = createPublicContributionHistoryRepository({
        async query(value) {
            sql = value;
            return { rows: [{ github_id: '42', username: 'octocat', failure_count: 2 }] };
        }
    });

    assert.deepEqual(await repository.claimNextPublicHistoryRefresh(), {
        githubId: '42', username: 'octocat', failureCount: 2
    });
    assert.match(sql, /FOR UPDATE OF job SKIP LOCKED/);
    assert.match(sql, /LIMIT 1/);
    assert.match(sql, /lease_until = NOW\(\) \+ INTERVAL '10 minutes'/);
});
