import { MAX_TOTAL_COMMITS, MAX_WEEKLY_COMMITS } from '../domain/planet/constants.js';
import { clampCommitCount } from '../domain/planet/planet.js';

export function derivePlanetStats(userData, user, { now = new Date() } = {}) {
    const ownedRepos = userData.ownedRepositories || [];
    const contributedRepos = userData.contributedRepositories || [];
    // 主言語と軌跡は公開所有repo/forkから算出し、参加先の言語構成を混ぜない。
    const hasMergedExternalPullRequest = (userData.mergedPullRequests || []).some((pullRequest) => {
        const ownerLogin = pullRequest.repositoryOwnerLogin;
        return ownerLogin && ownerLogin.toLowerCase() !== user.login.toLowerCase();
    });
    // 未マージPRやStarだけでは、実際に作品へ採用された開発貢献とは言えないため対象外にする。
    const hasMergedGithubPlanetPullRequest = (userData.mergedPullRequests || []).some((pullRequest) => (
        pullRequest.repositoryNameWithOwner?.toLowerCase() === 'nitr0yukkuri/githubplanet'
    ));
    const starredCount = Number(userData.starredRepositoryCount) || 0;
    const observedTotalContributions = userData.totalContributions || 0;
    const oneWeekAgo = new Date(now);
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const contributionDays = userData.dailyContributions || [];

    let weeklyCommits = 0;
    for (const day of contributionDays) {
        const count = Number(day.count) || 0;
        if (new Date(day.date) >= oneWeekAgo) weeklyCommits += count;
    }

    const languageStats = {};
    let receivedStars = 0;
    for (const repo of ownedRepos) {
        for (const { language: rawLanguage, bytes: rawBytes } of repo.languages || []) {
            const language = rawLanguage === 'Sass' ? 'CSS' : rawLanguage;
            const bytes = Math.max(0, Number(rawBytes) || 0);
            if (language && bytes > 0) {
                languageStats[language] = (languageStats[language] || 0) + bytes;
            }
        }
        receivedStars += Number(repo.receivedStars) || 0;
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
        hasContributedToOthers: contributedRepos.length > 0,
        hasMergedExternalPullRequest,
        hasMergedGithubPlanetPullRequest,
        totalStars: starredCount + receivedStars,
        createdAt: user.created_at
    };
}
