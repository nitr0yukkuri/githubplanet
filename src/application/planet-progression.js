import { TITLE_REWARDS } from '../domain/planet/constants.js';
import { checkAchievements } from '../domain/planet/planet.js';

function createDefaultUnlockedTitles() {
    return { prefixes: ['名もなき'], suffixes: ['旅人'] };
}

function createDefaultActiveTitle() {
    return { prefix: '名もなき', suffix: '旅人' };
}

export function derivePlanetProgression({ existingData, stats, enabled }) {
    const previousUnlockedTitles = existingData?.unlockedTitles || createDefaultUnlockedTitles();
    const unlockedTitles = {
        prefixes: [...previousUnlockedTitles.prefixes],
        suffixes: [...previousUnlockedTitles.suffixes]
    };
    const activeTitle = existingData?.activeTitle || createDefaultActiveTitle();

    if (!enabled) {
        return { achievements: {}, unlockedTitles, activeTitle };
    }

    const achievements = checkAchievements(existingData?.achievements || {}, {
        totalCommits: stats.totalCommits,
        weeklyCommits: stats.weeklyCommits,
        languagesCount: stats.languagesCount,
        languageStats: stats.languageStats,
        hasContributedToOthers: stats.hasContributedToOthers,
        hasMergedExternalPullRequest: stats.hasMergedExternalPullRequest,
        hasMergedGithubPlanetPullRequest: stats.hasMergedGithubPlanetPullRequest,
        totalStars: stats.totalStars,
        createdAt: stats.createdAt
    });

    for (const key of Object.keys(achievements)) {
        const reward = TITLE_REWARDS[key];
        if (!reward) continue;
        if (!unlockedTitles.prefixes.includes(reward.prefix)) unlockedTitles.prefixes.push(reward.prefix);
        if (!unlockedTitles.suffixes.includes(reward.suffix)) unlockedTitles.suffixes.push(reward.suffix);
    }

    return { achievements, unlockedTitles, activeTitle };
}

