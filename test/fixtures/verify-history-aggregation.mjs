import assert from 'node:assert/strict';
import { createAuthoredLanguageHistoryRepository } from '../../src/infrastructure/database/authored-language-history-repository.js';
import { buildAuthoredLanguageHistory } from '../../src/domain/planet/authored-language-history.js';

// 呼出し元は使い捨てのローカル検証DBだけを用意する。
export async function verifyHistoryAggregation(pool) {
    const id = '90000001003';
    await pool.query("INSERT INTO planets(github_id,username) VALUES($1,'history-sql-fixture')", [id]);
    try {
        const repository = createAuthoredLanguageHistoryRepository(pool);
        await pool.query(`INSERT INTO authored_language_commits(github_id,repository_full_name,commit_sha,authored_at,language_added_lines)
            SELECT $1,'fixture/repo', 'sha-' || value, '2025-01-01Z'::timestamptz + ((value % 10) || ' days')::interval,
                jsonb_build_object('TypeScript',value % 7, 'CSS',value % 3)
            FROM generate_series(1,10000) AS value`, [id]);
        await repository.saveAuthoredLanguageCommits(id, [
            { repositoryFullName:'renamed/repo',commitSha:'SHA-1',authoredAt:'2025-01-02Z',languageAdditions:{TypeScript:1,CSS:1},totalAddedLines:2,unclassifiedAddedLines:0,filesComplete:true },
            { repositoryFullName:'fixture/repo',commitSha:'zero',authoredAt:'2025-01-11Z',languageAdditions:{},totalAddedLines:0,unclassifiedAddedLines:0,filesComplete:true }
        ]);
        const raw = await repository.findAuthoredLanguageCommits(id);
        const days = await repository.findAuthoredLanguageHistoryDays(id);
        assert.equal(raw.length, 10002);
        assert.equal(days.length, 11);
        assert.deepEqual(buildAuthoredLanguageHistory(days), buildAuthoredLanguageHistory(raw));
        assert.deepEqual(await repository.findAuthoredLanguageCommitKeys(id, []), []);
        const known = await repository.findAuthoredLanguageCommitKeys(id, ['SHA-1', 'missing']);
        assert.equal(known.length, 2);
        assert.ok(known.every(row => row.commitSha.toLowerCase() === 'sha-1'));
        return { commits: raw.length, returnedDays: days.length, identicalHistory: true };
    } finally { await pool.query('DELETE FROM planets WHERE github_id=$1', [id]); }
}
