import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlanetRepository } from '../src/infrastructure/database/planet-repository.js';

test('persists commit batches idempotently and claims scans only after their cooldown', async () => {
    const queries = [];
    const repository = createPlanetRepository({
        async query(sql, params) {
            queries.push({ sql, params });
            if (sql.includes('RETURNING *')) return { rows: [{ scan_status: 'running', api_requests: 0 }] };
            return { rows: [], rowCount: 1 };
        }
    });
    const commit = {
        repositoryFullName: 'alice/project', commitSha: 'abc', authoredAt: '2025-01-01T00:00:00Z',
        languageAdditions: { TypeScript: 4 }, totalAddedLines: 4, unclassifiedAddedLines: 0, filesComplete: true
    };

    await repository.saveAuthoredLanguageCommits(41, [commit]);
    const scan = await repository.tryStartAuthoredLanguageHistoryScan(41, 6 * 60 * 60 * 1_000);

    assert.equal(scan.scanStatus, 'running');
    assert.match(queries[0].sql, /ON CONFLICT \(github_id, repository_full_name, commit_sha\) DO NOTHING/);
    assert.match(queries[1].sql, /retry_after <= NOW\(\)/);
    assert.deepEqual(queries[0].params, [41, JSON.stringify([{
        repository_full_name: commit.repositoryFullName,
        commit_sha: commit.commitSha,
        authored_at: commit.authoredAt,
        language_added_lines: commit.languageAdditions,
        total_added_lines: commit.totalAddedLines,
        unclassified_added_lines: commit.unclassifiedAddedLines,
        files_complete: commit.filesComplete
    }])]);
});

test('records budget-limited scans as partial and schedules their next scan', async () => {
    const queries = [];
    const repository = createPlanetRepository({
        async query(sql, params) {
            queries.push({ sql, params });
            return { rows: [{ scan_status: 'partial', api_requests: 800, request_budget_reached: true }] };
        }
    });
    const progress = {
        repositoriesScanned: 5, privateRepositoriesSkipped: 1, commitsFound: 900, commitsScanned: 790,
        unavailableCommits: 2, incompleteFileCommits: 0, unclassifiedAddedLines: 0,
        repositoryCapReached: false, apiRequests: 800, requestBudgetReached: true
    };

    const result = await repository.pauseAuthoredLanguageHistoryScan(41, progress, 6 * 60 * 60 * 1_000);

    assert.equal(result.scanStatus, 'partial');
    assert.equal(result.requestBudgetReached, true);
    assert.match(queries[0].sql, /scan_status = 'partial'/);
    assert.match(queries[0].sql, /LEAST\(\$11::bigint, 21600000\)/);
    assert.match(queries[0].sql, /request_budget_reached = \$12/);
    assert.deepEqual(queries[0].params.slice(0, 10), [41, 5, 1, 900, 790, 2, 0, 0, false, 800]);
    assert.deepEqual(queries[0].params.slice(10), [6 * 60 * 60 * 1_000, true]);
});
