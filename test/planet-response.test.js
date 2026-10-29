import assert from 'node:assert/strict';
import test from 'node:test';
import { toPlanetResponse } from '../src/presentation/http/planet-response.js';

test('maps database rows to the existing API shape', () => {
    const response = toPlanetResponse({
        username: 'tester', planetColor: '#007acc', planetSizeFactor: '1.75', mainLanguage: 'TypeScript',
        languageStats: { TypeScript: 100 }, totalCommits: 150000, weeklyCommits: 120,
        planetName: null, achievements: null, activeTitle: null
    });

    assert.deepEqual(response, {
        username: 'tester', planetColor: '#007acc', planetSizeFactor: 1.75, mainLanguage: 'TypeScript',
        languageStats: { TypeScript: 100 }, totalCommits: 99999, weeklyCommits: 100,
        planetName: '堅牢な蒼穹の帝星', achievements: {}, activeTitle: { prefix: '名もなき', suffix: '旅人' }
    });
});

test('normalizes planets with no usable activity to Unknown', () => {
    const response = toPlanetResponse({
        username: 'empty', planetColor: '#007acc', planetSizeFactor: 1, mainLanguage: 'TypeScript',
        languageStats: {}, totalCommits: 0, weeklyCommits: 0
    });
    assert.equal(response.mainLanguage, 'Unknown');
    assert.equal(response.planetColor, '#808080');
    assert.equal(response.planetName, '未知の神秘の星');
});

test('preserves the language color when contributions are zero but language stats exist', () => {
    const response = toPlanetResponse({
        username: 'newcomer', planetColor: '#007acc', planetSizeFactor: 1, mainLanguage: 'TypeScript',
        languageStats: { TypeScript: 1 }, totalCommits: 0, weeklyCommits: 0
    });

    assert.equal(response.mainLanguage, 'TypeScript');
    assert.equal(response.planetColor, '#007acc');
    assert.equal(response.planetName, '堅牢な蒼穹の星');
});

test('preserves an unavailable GitHub profile marker for the UI to hide its stale link', () => {
    const response = toPlanetResponse({
        username: '0x3EF8', planetColor: '#007acc', planetSizeFactor: 1, mainLanguage: 'TypeScript',
        languageStats: { TypeScript: 1 }, totalCommits: 0, weeklyCommits: 0,
        githubProfileVerified: false
    });

    assert.equal(response.githubProfileVerified, false);
});

test('includes the saved GitHub ID so profile links can resolve a renamed login', () => {
    const response = toPlanetResponse({
        githubId: 76643867, username: '0x3EF8', planetColor: '#007acc', planetSizeFactor: 1,
        mainLanguage: 'TypeScript', languageStats: { TypeScript: 1 }, totalCommits: 0, weeklyCommits: 0
    });

    assert.equal(response.githubId, '76643867');
});

test('marks quota fallback as a saved snapshot without losing its statistics', () => {
    const response = toPlanetResponse({
        username: 'tester', githubId: 42, planetColor: '#007acc', planetSizeFactor: 1,
        mainLanguage: 'TypeScript', languageStats: { TypeScript: 100 }, totalCommits: 123,
        weeklyCommits: 2, githubProfileVerified: false, isStoredSnapshot: true,
        lastUpdated: '2026-10-01T00:00:00Z'
    });
    assert.equal(response.isStoredSnapshot, true);
    assert.equal(response.githubProfileVerified, false);
    assert.equal(response.snapshotCapturedAt, '2026-10-01T00:00:00Z');
    assert.equal(response.totalCommits, 123);
    assert.deepEqual(response.languageStats, { TypeScript: 100 });
});
