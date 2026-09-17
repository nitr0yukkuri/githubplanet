import assert from 'node:assert/strict';
import test from 'node:test';
import { toPlanetResponse } from '../src/presentation/http/planet-response.js';

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

test('preserves the language color when contributions are zero but language stats exist', () => {
    const response = toPlanetResponse({
        username: 'newcomer', planet_color: '#007acc', planet_size_factor: 1, main_language: 'TypeScript',
        language_stats: { TypeScript: 1 }, total_commits: 0, weekly_commits: 0
    });

    assert.equal(response.mainLanguage, 'TypeScript');
    assert.equal(response.planetColor, '#007acc');
    assert.equal(response.planetName, '堅牢な蒼穹の星');
});
