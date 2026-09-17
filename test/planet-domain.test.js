import assert from 'node:assert/strict';
import test from 'node:test';
import {
    checkAchievements,
    clampCommitCount,
    generatePlanetName,
    normalizePlanetCommitCounts
} from '../src/domain/planet/planet.js';

test('clamps commit counts exactly as the current API does', () => {
    assert.equal(clampCommitCount('12.9', 100), 12);
    assert.equal(clampCommitCount(-4, 100), 0);
    assert.equal(clampCommitCount(500, 100), 100);
    assert.equal(clampCommitCount('invalid', 100), 0);
    assert.deepEqual(normalizePlanetCommitCounts({ totalCommits: 200000, weeklyCommits: 130, keep: true }), {
        totalCommits: 99999,
        weeklyCommits: 100,
        keep: true
    });
});

test('generates the same Japanese planet names at commit boundaries', () => {
    assert.equal(generatePlanetName('TypeScript', '#007acc', 500), '堅牢な蒼穹の星');
    assert.equal(generatePlanetName('TypeScript', '#007acc', 501), '堅牢な蒼穹の巨星');
    assert.equal(generatePlanetName('TypeScript', '#007acc', 1001), '堅牢な蒼穹の帝星');
    assert.equal(generatePlanetName('Other', '#ffffff', 0), '未知の神秘の星');
});

test('unlocks the same achievements without replacing existing timestamps', () => {
    const now = new Date('2026-07-18T00:00:00.000Z');
    const existing = { FIRST_PLANET: { id: 'FIRST_PLANET', unlockedAt: 'old' } };
    const result = checkAchievements(existing, {
        totalCommits: 1000,
        weeklyCommits: 50,
        languagesCount: 5,
        hasContributedToOthers: true,
        hasMergedExternalPullRequest: true,
        totalStars: 10,
        createdAt: '2025-01-01T00:00:00.000Z'
    }, now);

    assert.equal(result.FIRST_PLANET.unlockedAt, 'old');
    assert.equal(result.COMMIT_1000.unlockedAt, now.toISOString());
    assert.equal(result.CONTRIBUTION_10000, undefined);
    assert.deepEqual(Object.keys(result).sort(), [
        'COMMIT_100', 'COMMIT_1000', 'COMMIT_500', 'FIRST_COMMIT', 'FIRST_CONTACT', 'FIRST_PLANET',
        'OCTOCAT_FRIEND', 'OS_CONTRIBUTOR', 'POLYGLOT_PIONEER', 'STARGAZER', 'VELOCITY_STAR'
    ]);

    const milestone = checkAchievements({}, {
        totalCommits: 10000,
        weeklyCommits: 0,
        languagesCount: 0,
        hasContributedToOthers: false,
        totalStars: 0
    }, now);
    assert.equal(milestone.CONTRIBUTION_10000.unlockedAt, now.toISOString());
});

test('unlocks the bridge achievement only when two languages reach 10,000 bytes', () => {
    const belowThreshold = checkAchievements({}, {
        totalCommits: 1,
        weeklyCommits: 0,
        languagesCount: 2,
        languageStats: { TypeScript: 10000, CSS: 9999 },
        hasContributedToOthers: false,
        totalStars: 0
    });
    const atThreshold = checkAchievements({}, {
        totalCommits: 1,
        weeklyCommits: 0,
        languagesCount: 2,
        languageStats: { TypeScript: 10000, CSS: 10000 },
        hasContributedToOthers: false,
        totalStars: 0
    });

    assert.equal(belowThreshold.DUAL_WORLD_BRIDGE, undefined);
    assert.ok(atThreshold.DUAL_WORLD_BRIDGE);
});

test('unlocks first contact only for a merged pull request in an externally owned repository', () => {
    const withoutMergedExternalPullRequest = checkAchievements({}, {
        totalCommits: 0,
        weeklyCommits: 0,
        languagesCount: 0,
        hasContributedToOthers: true,
        hasMergedExternalPullRequest: false,
        totalStars: 0
    });
    const withMergedExternalPullRequest = checkAchievements({}, {
        totalCommits: 0,
        weeklyCommits: 0,
        languagesCount: 0,
        hasContributedToOthers: true,
        hasMergedExternalPullRequest: true,
        totalStars: 0
    });

    assert.equal(withoutMergedExternalPullRequest.FIRST_CONTACT, undefined);
    assert.ok(withMergedExternalPullRequest.FIRST_CONTACT);
});
