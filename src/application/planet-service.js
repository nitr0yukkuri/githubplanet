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

        const ownedRepos = userData.repositories.nodes || [];
        const contributedRepos = userData.repositoriesContributedTo.nodes || [];
        const repositories = [...ownedRepos, ...contributedRepos];
        const starredCount = userData.starredRepositories ? userData.starredRepositories.totalCount : 0;
        let totalCommits = userData.contributionsCollection?.contributionCalendar?.totalContributions || 0;
        let weeklyCommits = 0;
        const calendar = userData.contributionsCollection?.contributionCalendar;
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

        if (calendar?.weeks) {
            for (const week of calendar.weeks) {
                for (const day of week.contributionDays) {
                    if (new Date(day.date) >= oneWeekAgo) weeklyCommits += day.contributionCount;
                }
            }
        }

        totalCommits = clampCommitCount(totalCommits, MAX_TOTAL_COMMITS);
        weeklyCommits = clampCommitCount(weeklyCommits, MAX_WEEKLY_COMMITS);

        const languageStats = {};
        let receivedStars = 0;
        for (const repo of repositories) {
            for (const edge of repo.languages?.edges || []) {
                const language = edge.node.name === 'Sass' ? 'CSS' : edge.node.name;
                languageStats[language] = (languageStats[language] || 0) + edge.size;
            }
            if (repo.stargazerCount) receivedStars += repo.stargazerCount;
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
                    unlockedTitles = existingData.unlocked_titles || unlockedTitles;
                    activeTitle = existingData.active_title || activeTitle;
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
            if (existingData.main_language === mainLanguage && existingData.planet_color) {
                planetColor = existingData.planet_color;
                shouldAskGeminiColor = false;
            }
            if (existingData.main_language === mainLanguage && existingData.planet_name) {
                const oldName = existingData.planet_name;
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
        let newlyUnlockedAchievementIds = [];
        if (repository) {
            achievements = checkAchievements(existingAchievements, {
                totalCommits,
                weeklyCommits,
                languagesCount: Object.keys(languageStats).length,
                hasContributedToOthers: contributedRepos.length > 0,
                totalStars: starredCount + receivedStars,
                createdAt: user.created_at
            });
            newlyUnlockedAchievementIds = Object.keys(achievements)
                .filter((id) => !existingAchievements[id]);

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
            planetName, achievements, unlockedTitles, activeTitle, newlyUnlockedAchievementIds
        };
    }

    return { updateAndSavePlanetData };
}
