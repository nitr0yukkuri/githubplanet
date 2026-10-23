import { MAX_TOTAL_COMMITS, MAX_WEEKLY_COMMITS, TITLE_REWARDS } from '../domain/planet/constants.js';
import { checkAchievements, clampCommitCount, generatePlanetName } from '../domain/planet/planet.js';

export function createPlanetService({ repository, githubClient, geminiClient, geminiApiKey }) {
    async function updateAndSavePlanetData(user, accessToken) {
        console.log(`[GraphQL] Fetching data for user: ${user.login}`);

        let userData;
        try {
            userData = await githubClient.getPlanetSource(user.login, accessToken);
        } catch (error) {
            console.error('[GraphQL] データ取得失敗:', error.message);
            throw error;
        }

        const ownedRepos = userData.ownedRepositories || [];
        const contributedRepos = userData.contributedRepositories || [];
        const hasMergedExternalPullRequest = (userData.mergedPullRequests || []).some((pullRequest) => {
            const ownerLogin = pullRequest.repositoryOwnerLogin;
            return ownerLogin && ownerLogin.toLowerCase() !== user.login.toLowerCase();
        });
        // 未マージPRやStarだけでは、実際に作品へ採用された開発貢献とは言えないため対象外にする。
        const hasMergedGithubPlanetPullRequest = (userData.mergedPullRequests || []).some((pullRequest) => (
            pullRequest.repositoryNameWithOwner?.toLowerCase() === 'nitr0yukkuri/githubplanet'
        ));
        const starredCount = userData.starredRepositoryCount || 0;
        const observedTotalContributions = userData.totalContributions || 0;
        let totalCommits = observedTotalContributions;
        let weeklyCommits = 0;
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

        for (const contribution of userData.dailyContributions || []) {
            if (new Date(contribution.date) >= oneWeekAgo) weeklyCommits += contribution.count;
        }

        totalCommits = clampCommitCount(totalCommits, MAX_TOTAL_COMMITS);
        weeklyCommits = clampCommitCount(weeklyCommits, MAX_WEEKLY_COMMITS);

        const languageStats = {};
        let receivedStars = 0;
        // 主言語と軌跡は公開所有repo/forkで計算し、参加先全体の言語構成が混ざるのを防ぐ。
        for (const repo of ownedRepos) {
            for (const languageEntry of repo.languages || []) {
                const language = languageEntry.language === 'Sass' ? 'CSS' : languageEntry.language;
                languageStats[language] = (languageStats[language] || 0) + languageEntry.bytes;
            }
            if (repo.receivedStars) receivedStars += repo.receivedStars;
        }

        let mainLanguage = 'Unknown';
        let maxBytes = 0;
        for (const [language, bytes] of Object.entries(languageStats)) {
            if (bytes > maxBytes) {
                maxBytes = bytes;
                mainLanguage = language;
            }
        }

        let existingData = null;
        let existingAchievements = {};
        let unlockedTitles = { prefixes: ['名もなき'], suffixes: ['旅人'] };
        let activeTitle = { prefix: '名もなき', suffix: '旅人' };
        if (repository) {
            try {
                existingData = await repository.findByGithubId(user.id);
                if (existingData) {
                    existingAchievements = existingData.achievements || {};
                    unlockedTitles = existingData.unlockedTitles || unlockedTitles;
                    activeTitle = existingData.activeTitle || activeTitle;
                }
            } catch (error) {
                console.error('[DB] 既存データ取得エラー:', error.message);
            }
        }

        let planetColor = '#808080';
        let planetName = generatePlanetName(mainLanguage, '#808080', totalCommits);
        let shouldAskGeminiColor = true;
        let shouldAskGeminiName = true;
        if (existingData) {
            if (existingData.mainLanguage === mainLanguage && existingData.planetColor) {
                planetColor = existingData.planetColor;
                shouldAskGeminiColor = false;
            }
            if (existingData.mainLanguage === mainLanguage && existingData.planetName) {
                const oldName = existingData.planetName;
                if (!oldName.includes('未知の') && !oldName.includes('神秘')) {
                    planetName = oldName;
                    shouldAskGeminiName = false;
                }
            }
        }

        if (shouldAskGeminiColor) planetColor = await geminiClient.resolveLanguageColor(mainLanguage);
        let planetSizeFactor = 1.0 + Math.min(1.0, Math.log10(Math.max(1, totalCommits)) / 2.5);
        planetSizeFactor = parseFloat(planetSizeFactor.toFixed(2));

        if (geminiApiKey && shouldAskGeminiName) {
            planetName = generatePlanetName(mainLanguage, planetColor, totalCommits);
            if (planetName.includes('未知の') || planetName.includes('神秘')) {
                console.log(`[Gemini] 暫定名 "${planetName}" をかっこいい名前に修正します...`);
                const suffix = totalCommits > 1000 ? '帝星' : totalCommits > 500 ? '巨星' : '星';
                const prompt = `Programming language: ${mainLanguage}. Color: ${planetColor}.
            Generate a cool Japanese planet name in the format: "[Adjective][ColorName]の${suffix}".
            The adjective should describe the nature of "${mainLanguage}". The color name should describe the color "${planetColor}".
            Example: "JavaScript" -> "柔軟な黄金の${suffix}".
            Return ONLY the name string.`;
                const aiName = await geminiClient.ask(prompt);
                if (aiName) planetName = aiName.replace(/(\r\n|\n|\r)/gm, '');
            } else {
                console.log('[Gemini] 名前生成スキップ: キャッシュまたはデフォルト名を採用');
            }
        } else {
            console.log('[Gemini] 名前生成スキップ: 既存のかっこいい名前を再利用');
        }

        let achievements = {};
        if (repository) {
            achievements = checkAchievements(existingAchievements, {
                totalCommits,
                weeklyCommits,
                languagesCount: Object.keys(languageStats).length,
                languageStats,
                hasContributedToOthers: contributedRepos.length > 0,
                hasMergedExternalPullRequest,
                hasMergedGithubPlanetPullRequest,
                totalStars: starredCount + receivedStars,
                createdAt: user.created_at
            });
            for (const key of Object.keys(achievements)) {
                const reward = TITLE_REWARDS[key];
                if (!reward) continue;
                if (!unlockedTitles.prefixes.includes(reward.prefix)) unlockedTitles.prefixes.push(reward.prefix);
                if (!unlockedTitles.suffixes.includes(reward.suffix)) unlockedTitles.suffixes.push(reward.suffix);
            }

            await repository.save({
                githubId: user.id, username: user.login, planetColor, planetSizeFactor, mainLanguage,
                languageStats, totalCommits, achievements, planetName, weeklyCommits, unlockedTitles, activeTitle
            });
        }

        return {
            mainLanguage, planetColor, languageStats, totalCommits, weeklyCommits, planetSizeFactor,
            planetName, achievements, unlockedTitles, activeTitle,
            observedTotalContributions,
            isNewPlanet: !existingData
        };
    }

    async function recordLoginProgress(githubId, updateResult) {
        if (!repository?.recordLoginProgress) {
            return { contributionDelta: 0, newlyUnlockedAchievementIds: [] };
        }
        return repository.recordLoginProgress(githubId, {
            currentContributions: updateResult.observedTotalContributions,
            currentAchievementIds: Object.keys(updateResult.achievements || {}),
            notifyCurrentAchievements: updateResult.isNewPlanet
        });
    }

    return { updateAndSavePlanetData, recordLoginProgress };
}
