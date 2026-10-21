import { MAX_TOTAL_COMMITS, MAX_WEEKLY_COMMITS } from '../domain/planet/constants.js';
import { clampCommitCount } from '../domain/planet/planet.js';

export function derivePlanetStats(userData, user, { now = new Date() } = {}) {
    const ownedRepos = userData.ownedRepositories || [];
    const contributedRepos = userData.contributedRepositories || [];
    const repositories = [...ownedRepos, ...contributedRepos];
    const hasMergedExternalPullRequest = (userData.mergedPullRequests || []).some((pullRequest) => {
        const ownerLogin = pullRequest.repositoryOwnerLogin;
        return ownerLogin && ownerLogin.toLowerCase() !== user.login.toLowerCase();
    });
    // 未マージPRやStarだけでは、実際に作品へ採用された開発貢献とは言えないため対象外にする。
    const hasMergedGithubPlanetPullRequest = (userData.mergedPullRequests || []).some((pullRequest) => (
        pullRequest.repositoryNameWithOwner?.toLowerCase() === 'nitr0yukkuri/githubplanet'
    ));
    const starredCount = Number(userData.starredRepositoryCount) || 0;
    const calendar = userData.contributionCalendar;
    const observedTotalContributions = calendar?.totalContributions
        ?? userData.totalContributions
        ?? 0;
    const oneWeekAgo = new Date(now);
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const contributionDays = calendar?.weeks
        ? calendar.weeks.flatMap((week) => week.contributionDays || [])
        : userData.dailyContributions || [];

    let weeklyCommits = 0;
    for (const day of contributionDays) {
        const count = Number(day.contributionCount ?? day.count) || 0;
        if (new Date(day.date) >= oneWeekAgo) weeklyCommits += count;
    }

    const languageStats = {};
    let receivedStars = 0;
    for (const repo of repositories) {
        const entries = Array.isArray(repo.languages)
            ? repo.languages.map(({ language, bytes }) => [language, bytes])
            : Object.entries(repo.languageBytes || {});
        for (const [rawLanguage, rawBytes] of entries) {
            const language = rawLanguage === 'Sass' ? 'CSS' : rawLanguage;
            const bytes = Math.max(0, Number(rawBytes) || 0);
            if (language && bytes > 0) {
                languageStats[language] = (languageStats[language] || 0) + bytes;
            }
        }
        receivedStars += Number(repo.receivedStars ?? repo.stargazerCount) || 0;
    }

    let mainLanguage = 'Unknown';
    let maxBytes = 0;
    for (const [language, bytes] of Object.entries(languageStats)) {
        if (bytes > maxBytes) {
            maxBytes = bytes;
            mainLanguage = language;
        }
    }

    return {
        mainLanguage,
        languageStats,
        totalCommits: clampCommitCount(observedTotalContributions, MAX_TOTAL_COMMITS),
        weeklyCommits: clampCommitCount(weeklyCommits, MAX_WEEKLY_COMMITS),
        observedTotalContributions,
        languagesCount: Object.keys(languageStats).length,
        featuredProjects: userData.featuredProjects || [],
        hasContributedToOthers: Number(userData.contributedRepositoryCount ?? contributedRepos.length) > 0,
        hasMergedExternalPullRequest,
        hasMergedGithubPlanetPullRequest,
        totalStars: starredCount + receivedStars,
        createdAt: user.created_at
    };
}
