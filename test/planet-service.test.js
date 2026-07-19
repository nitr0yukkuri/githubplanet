import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlanetService } from '../src/application/planet-service.js';

function createSource() {
    const today = new Date().toISOString().slice(0, 10);
    return {
        repositories: {
            nodes: [{
                stargazerCount: 4,
                languages: { edges: [
                    { size: 70, node: { name: 'TypeScript' } },
                    { size: 20, node: { name: 'Sass' } }
                ] }
            }]
        },
        repositoriesContributedTo: {
            nodes: [{ languages: { edges: [{ size: 30, node: { name: 'CSS' } }] } }]
        },
        starredRepositories: { totalCount: 6 },
        contributionsCollection: {
            contributionCalendar: {
                totalContributions: 120000,
                weeks: [{ contributionDays: [{ date: today, contributionCount: 150 }] }]
            }
        }
    };
}

test('orchestrates GitHub aggregation, domain rules, and persistence', async () => {
    let saved;
    const repository = {
        findByGithubId: async () => null,
        save: async (planet) => { saved = planet; }
    };
    const githubClient = { getPlanetSource: async () => createSource() };
    const geminiClient = {
        resolveLanguageColor: async (language) => language === 'TypeScript' ? '#007acc' : '#808080',
        ask: async () => null
    };
    const service = createPlanetService({ repository, githubClient, geminiClient, geminiApiKey: '' });
    const result = await service.updateAndSavePlanetData({
        id: 1,
        login: 'tester',
        created_at: '2020-01-01T00:00:00.000Z'
    }, 'token');

    assert.equal(result.mainLanguage, 'TypeScript');
    assert.deepEqual(result.languageStats, { TypeScript: 70, CSS: 50 });
    assert.equal(result.totalCommits, 99999);
    assert.equal(result.weeklyCommits, 100);
    assert.equal(result.planetColor, '#007acc');
  assert.equal(result.planetName, '堅牢な神秘の帝星');
    assert.equal(result.planetSizeFactor, 2);
    assert.ok(result.achievements.COMMIT_1000);
    assert.ok(result.achievements.CONTRIBUTION_10000);
    assert.ok(result.achievements.OS_CONTRIBUTOR);
    assert.ok(result.unlockedTitles.prefixes.includes('星雲を渡る'));
    assert.ok(result.unlockedTitles.suffixes.includes('航海者'));
    assert.ok(result.unlockedTitles.prefixes.includes('銀河に名を刻む'));
    assert.ok(result.unlockedTitles.suffixes.includes('伝説'));
    assert.deepEqual(saved, {
        githubId: 1,
        username: 'tester',
        planetColor: result.planetColor,
        planetSizeFactor: result.planetSizeFactor,
        mainLanguage: result.mainLanguage,
        languageStats: result.languageStats,
        totalCommits: result.totalCommits,
        achievements: result.achievements,
        planetName: result.planetName,
        weeklyCommits: result.weeklyCommits,
        unlockedTitles: result.unlockedTitles,
        activeTitle: result.activeTitle
    });
});

test('reuses the existing color, name, title, and achievements for the same language', async () => {
    let colorCalls = 0;
    let saved;
    const existingAchievement = { id: 'FIRST_PLANET', unlockedAt: 'existing' };
    const repository = {
        findByGithubId: async () => ({
            main_language: 'TypeScript',
            planet_color: '#123456',
            planet_name: '既存の惑星名',
            achievements: { FIRST_PLANET: existingAchievement },
            unlocked_titles: { prefixes: ['名もなき'], suffixes: ['旅人'] },
            active_title: { prefix: '記念すべき', suffix: '職人' }
        }),
        save: async (planet) => { saved = planet; }
    };
    const service = createPlanetService({
        repository,
        githubClient: { getPlanetSource: async () => createSource() },
        geminiClient: {
            resolveLanguageColor: async () => { colorCalls++; return '#ffffff'; },
            ask: async () => null
        },
        geminiApiKey: 'configured'
    });

    const result = await service.updateAndSavePlanetData({ id: 1, login: 'tester' }, 'token');
    assert.equal(colorCalls, 0);
    assert.equal(result.planetColor, '#123456');
    assert.equal(result.planetName, '既存の惑星名');
    assert.deepEqual(result.activeTitle, { prefix: '記念すべき', suffix: '職人' });
    assert.equal(result.achievements.FIRST_PLANET, existingAchievement);
    assert.equal(saved.planetName, '既存の惑星名');
});
