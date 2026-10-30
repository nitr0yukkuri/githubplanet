import assert from 'node:assert/strict';
import test from 'node:test';
import { resolvePlanetIdentity } from '../src/application/planet-identity.js';
import { derivePlanetProgression } from '../src/application/planet-progression.js';
import { derivePlanetStats } from '../src/application/planet-stats.js';

test('derives activity statistics without GitHub, Gemini, or database access', () => {
    const stats = derivePlanetStats({
        ownedRepositories: [{
            receivedStars: 4,
            languages: [
                { language: 'TypeScript', bytes: 70 },
                { language: 'Sass', bytes: 20 }
            ]
        }],
        contributedRepositories: [{
            receivedStars: 99,
            languages: [{ language: 'CSS', bytes: 30 }]
        }],
        mergedPullRequests: [{
            repositoryNameWithOwner: 'nitr0yukkuri/githubplanet',
            repositoryOwnerLogin: 'nitr0yukkuri'
        }],
        starredRepositoryCount: 6,
        totalContributions: 120000,
        dailyContributions: [
            { date: '2026-08-24', count: 150 },
            { date: '2026-08-22', count: 20 }
        ],
        featuredProjects: []
    }, {
        login: 'tester',
        created_at: '2020-01-01T00:00:00.000Z'
    }, {
        now: new Date('2026-08-30T12:00:00.000Z')
    });

    assert.deepEqual(stats, {
        mainLanguage: 'TypeScript',
        languageStats: { TypeScript: 70, CSS: 20 },
        totalCommits: 99999,
        weeklyCommits: 100,
        observedTotalContributions: 120000,
        languagesCount: 2,
        featuredProjects: [],
        hasContributedToOthers: true,
        hasMergedExternalPullRequest: true,
        hasMergedGithubPlanetPullRequest: true,
        totalStars: 10,
        createdAt: '2020-01-01T00:00:00.000Z'
    });
});

test('keeps a stable existing identity without calling Gemini again', async () => {
    const calls = [];
    const identity = await resolvePlanetIdentity({
        mainLanguage: 'TypeScript',
        totalCommits: 1000,
        existingData: {
            mainLanguage: 'TypeScript',
            planetColor: '#123456',
            planetName: '既存の惑星名'
        },
        languageColorService: {
            async resolveLanguageColor() { calls.push('color'); return '#ffffff'; }
        },
        geminiClient: {
            async ask() {
                calls.push('name');
                return '別の名前';
            }
        },
        geminiApiKey: 'configured'
    });

    assert.deepEqual(identity, {
        planetColor: '#123456',
        planetName: '既存の惑星名',
        planetSizeFactor: 2
    });
    assert.deepEqual(calls, []);
});

test('contains Gemini color and name decisions inside planet identity resolution', async () => {
    let prompt;
    const identity = await resolvePlanetIdentity({
        mainLanguage: 'NewLanguage',
        totalCommits: 600,
        existingData: null,
        languageColorService: { async resolveLanguageColor() { return '#123456'; } },
        geminiClient: {
            async ask(value) {
                prompt = value;
                return '新しい惑星名\n';
            }
        },
        geminiApiKey: 'configured'
    });

    assert.equal(identity.planetColor, '#123456');
    assert.equal(identity.planetName, '新しい惑星名');
    assert.equal(identity.planetSizeFactor, 2);
    assert.match(prompt, /Programming language: NewLanguage/);
});

test('derives achievements and titles without mutating the stored title collection', () => {
    const storedTitles = { prefixes: ['名もなき'], suffixes: ['旅人'] };
    const existingAchievement = { id: 'FIRST_PLANET', unlockedAt: 'existing' };
    const progression = derivePlanetProgression({
        existingData: {
            achievements: { FIRST_PLANET: existingAchievement },
            unlockedTitles: storedTitles,
            activeTitle: { prefix: '名もなき', suffix: '旅人' }
        },
        stats: {
            totalCommits: 1000,
            weeklyCommits: 50,
            languagesCount: 1,
            languageStats: { TypeScript: 10000 },
            hasContributedToOthers: true,
            hasMergedExternalPullRequest: true,
            hasMergedGithubPlanetPullRequest: true,
            totalStars: 10,
            createdAt: '2020-01-01T00:00:00.000Z'
        },
        enabled: true
    });

    assert.equal(progression.achievements.FIRST_PLANET, existingAchievement);
    assert.ok(progression.achievements.FIRST_CONTACT);
    assert.ok(progression.achievements.PLANET_ARCHITECT);
    assert.ok(progression.unlockedTitles.prefixes.includes('星間の'));
    assert.ok(progression.unlockedTitles.suffixes.includes('交信者'));
    assert.ok(progression.unlockedTitles.prefixes.includes('星を創りし'));
    assert.ok(progression.unlockedTitles.suffixes.includes('設計者'));
    assert.deepEqual(storedTitles, { prefixes: ['名もなき'], suffixes: ['旅人'] });
});

test('keeps the existing no-database progression behavior', () => {
    const progression = derivePlanetProgression({
        existingData: null,
        stats: {},
        enabled: false
    });

    assert.deepEqual(progression, {
        achievements: {},
        unlockedTitles: { prefixes: ['名もなき'], suffixes: ['旅人'] },
        activeTitle: { prefix: '名もなき', suffix: '旅人' }
    });
});

