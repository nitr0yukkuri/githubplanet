import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateLoginProgress } from '../src/application/login-progress.js';

test('establishes a silent baseline for an existing user after migration', () => {
    const result = calculateLoginProgress({
        previousContributions: null,
        previousNotifiedAchievementIds: null,
        currentContributions: 120,
        currentAchievementIds: ['FIRST_PLANET']
    });

    assert.equal(result.contributionDelta, 0);
    assert.deepEqual(result.newlyUnlockedAchievementIds, []);
    assert.deepEqual(result.achievementBaselineIds, ['FIRST_PLANET']);
});

test('notifies current achievements for a genuinely new planet', () => {
    const result = calculateLoginProgress({
        previousContributions: null,
        previousNotifiedAchievementIds: null,
        currentContributions: 1,
        currentAchievementIds: ['FIRST_PLANET', 'FIRST_COMMIT'],
        notifyCurrentAchievements: true
    });

    assert.equal(result.contributionDelta, 0);
    assert.deepEqual(result.newlyUnlockedAchievementIds, ['FIRST_PLANET', 'FIRST_COMMIT']);
});

test('returns only progress since the previous login baseline', () => {
    const result = calculateLoginProgress({
        previousContributions: '100',
        previousNotifiedAchievementIds: ['FIRST_PLANET'],
        currentContributions: 128,
        currentAchievementIds: ['FIRST_PLANET', 'COMMIT_100']
    });

    assert.equal(result.contributionDelta, 28);
    assert.deepEqual(result.newlyUnlockedAchievementIds, ['COMMIT_100']);
});

test('does not report a negative contribution delta for a rolling total', () => {
    const result = calculateLoginProgress({
        previousContributions: 200,
        previousNotifiedAchievementIds: [],
        currentContributions: 180,
        currentAchievementIds: []
    });

    assert.equal(result.contributionDelta, 0);
});
