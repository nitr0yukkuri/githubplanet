import assert from 'node:assert/strict';
import test from 'node:test';
import { derivePlanetStats } from '../src/application/planet-stats.js';

test('keeps language composition on public owned repositories and forks', () => {
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
            repositoryOwnerLogin: 'someone-else',
            repositoryNameWithOwner: 'nitr0yukkuri/githubplanet'
        }],
        starredRepositoryCount: 6,
        totalContributions: 120_000,
        dailyContributions: [
            { date: '2026-08-24', count: 150 },
            { date: '2026-08-22', count: 20 }
        ]
    }, { login: 'tester', created_at: '2020-01-01T00:00:00.000Z' }, {
        now: new Date('2026-08-30T12:00:00.000Z')
    });

    assert.equal(stats.mainLanguage, 'TypeScript');
    assert.deepEqual(stats.languageStats, { TypeScript: 70, CSS: 20 });
    assert.equal(stats.totalCommits, 99_999);
    assert.equal(stats.weeklyCommits, 100);
    assert.equal(stats.totalStars, 10);
    assert.equal(stats.hasContributedToOthers, true);
    assert.equal(stats.hasMergedGithubPlanetPullRequest, true);
});
