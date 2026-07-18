import assert from 'node:assert/strict';
import test from 'node:test';
import {
    checkAchievements,
    clampCommitCount,
    generatePlanetName,
    normalizePlanetCommitCounts,
    toPlanetResponse
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
        totalStars: 10,
        createdAt: '2025-01-01T00:00:00.000Z'
    }, now);

    assert.equal(result.FIRST_PLANET.unlockedAt, 'old');
    assert.equal(result.COMMIT_1000.unlockedAt, now.toISOString());
    assert.deepEqual(Object.keys(result).sort(), [
        'COMMIT_100', 'COMMIT_1000', 'COMMIT_500', 'FIRST_COMMIT', 'FIRST_PLANET',
        'OCTOCAT_FRIEND', 'OS_CONTRIBUTOR', 'POLYGLOT_PIONEER', 'STARGAZER', 'VELOCITY_STAR'
    ]);
});

test('maps database rows to the existing API shape', () => {
    const response = toPlanetResponse({
        username: 'tester', planet_color: '#007acc', planet_size_factor: '1.75', main_language: 'TypeScript',
        language_stats: { TypeScript: 100 }, total_commits: 150000, weekly_commits: 120,
        planet_name: null, achievements: null, active_title: null
    });

    assert.deepEqual(response, {
        username: 'tester', planetColor: '#007acc', planetSizeFactor: 1.75, mainLanguage: 'TypeScript',
        languageStats: { TypeScript: 100 }, totalCommits: 99999, weeklyCommits: 100,
        planetName: '堅牢な蒼穹の帝星', achievements: {}, activeTitle: { prefix: '名もなき', suffix: '旅人' }
    });
});

test('normalizes planets with no usable activity to Unknown', () => {
    const response = toPlanetResponse({
        username: 'empty', planet_color: '#007acc', planet_size_factor: 1, main_language: 'TypeScript',
        language_stats: {}, total_commits: 0, weekly_commits: 0
    });
    assert.equal(response.mainLanguage, 'Unknown');
    assert.equal(response.planetColor, '#808080');
    assert.equal(response.planetName, '未知の神秘の星');
});
