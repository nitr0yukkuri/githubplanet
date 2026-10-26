import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlanetService } from '../src/application/planet-service.js';

function createSource() {
    const today = new Date().toISOString().slice(0, 10);
    return {
        ownedRepositories: [{
            receivedStars: 4,
            languages: [
                { bytes: 70, language: 'TypeScript' },
                { bytes: 20, language: 'Sass' }
            ]
        }],
        contributedRepositories: [{ languages: [{ bytes: 30, language: 'CSS' }] }],
        mergedPullRequests: [{
            repositoryNameWithOwner: 'nitr0yukkuri/githubplanet',
            repositoryOwnerLogin: 'someone-else'
        }],
        starredRepositoryCount: 6,
        totalContributions: 120000,
        dailyContributions: [{ date: today, count: 150 }]
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
    assert.deepEqual(result.languageStats, { TypeScript: 70, CSS: 20 });
    assert.equal(result.totalCommits, 99999);
    assert.equal(result.observedTotalContributions, 120000);
    assert.equal(result.isNewPlanet, true);
    assert.equal(result.weeklyCommits, 100);
    assert.equal(result.planetColor, '#007acc');
  assert.equal(result.planetName, '堅牢な神秘の帝星');
    assert.equal(result.planetSizeFactor, 2);
    assert.ok(result.achievements.COMMIT_1000);
    assert.ok(result.achievements.CONTRIBUTION_10000);
    assert.ok(result.achievements.OS_CONTRIBUTOR);
    assert.ok(result.achievements.FIRST_CONTACT);
    assert.ok(result.achievements.PLANET_ARCHITECT);
    assert.ok(result.unlockedTitles.prefixes.includes('星間の'));
    assert.ok(result.unlockedTitles.suffixes.includes('交信者'));
    assert.ok(result.unlockedTitles.prefixes.includes('星を創りし'));
    assert.ok(result.unlockedTitles.suffixes.includes('設計者'));
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
            mainLanguage: 'TypeScript',
            planetColor: '#123456',
            planetName: '既存の惑星名',
            achievements: { FIRST_PLANET: existingAchievement },
            unlockedTitles: { prefixes: ['名もなき'], suffixes: ['旅人'] },
            activeTitle: { prefix: '記念すべき', suffix: '職人' }
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
    assert.equal(result.isNewPlanet, false);
    assert.equal(saved.planetName, '既存の惑星名');
});

test('refreshes the authenticated username by stable GitHub ID', async () => {
    const calls = [];
    const currentUser = { id: 42, login: 'new-login', html_url: 'https://github.com/new-login' };
    const service = createPlanetService({
        repository: {
            async updateUsernameByGithubId(...args) { calls.push(args); }
        },
        githubClient: {
            async getAuthenticatedUser(token) {
                calls.push(['getAuthenticatedUser', token]);
                return currentUser;
            }
        },
        geminiClient: {},
        geminiApiKey: ''
    });

    assert.equal(await service.refreshAuthenticatedUser('token', { id: '42', login: 'old-login' }), currentUser);
    assert.deepEqual(calls, [
        ['getAuthenticatedUser', 'token'],
        [42, 'new-login']
    ]);
});

test('retries username synchronization when the database update fails', async () => {
    let updateCalls = 0;
    const service = createPlanetService({
        repository: {
            async updateUsernameByGithubId() {
                updateCalls++;
                throw new Error('database unavailable');
            }
        },
        githubClient: {
            async getAuthenticatedUser() {
                return { id: 42, login: 'new-login', html_url: 'https://github.com/new-login' };
            }
        },
        geminiClient: {},
        geminiApiKey: ''
    });

    await assert.rejects(
        service.refreshAuthenticatedUser('token', { id: 42, login: 'old-login' }),
        /database unavailable/
    );
    await assert.rejects(
        service.refreshAuthenticatedUser('token', { id: 42, login: 'old-login' }),
        /database unavailable/
    );
    assert.equal(updateCalls, 2);
});

test('rejects an authenticated identity change that does not match the session ID', async () => {
    const service = createPlanetService({
        repository: {},
        githubClient: { async getAuthenticatedUser() { return { id: 99, login: 'other-user' }; } },
        geminiClient: {},
        geminiApiKey: ''
    });

    await assert.rejects(
        service.refreshAuthenticatedUser('token', { id: 42, login: 'old-user' }),
        /does not match the active session/
    );
});
