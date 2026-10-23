import { resolvePlanetIdentity } from './planet-identity.js';
import { derivePlanetProgression } from './planet-progression.js';
import { derivePlanetStats } from './planet-stats.js';

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

        const stats = derivePlanetStats(userData, user);

        let existingData = null;
        if (repository) {
            try {
                existingData = await repository.findByGithubId(user.id);
            } catch (error) {
                console.error('[DB] 既存データ取得エラー:', error.message);
            }
        }

        // I/Oの順序はここに固定し、集計・個性・進捗の仕様変更が互いの実装へ波及しないようにする。
        const identity = await resolvePlanetIdentity({
            mainLanguage: stats.mainLanguage,
            totalCommits: stats.totalCommits,
            existingData,
            geminiClient,
            geminiApiKey
        });
        const progression = derivePlanetProgression({
            existingData,
            stats,
            enabled: Boolean(repository)
        });

        if (repository) {
            await repository.save({
                githubId: user.id,
                username: user.login,
                planetColor: identity.planetColor,
                planetSizeFactor: identity.planetSizeFactor,
                mainLanguage: stats.mainLanguage,
                languageStats: stats.languageStats,
                totalCommits: stats.totalCommits,
                achievements: progression.achievements,
                planetName: identity.planetName,
                weeklyCommits: stats.weeklyCommits,
                unlockedTitles: progression.unlockedTitles,
                activeTitle: progression.activeTitle
            });
        }

        return {
            mainLanguage: stats.mainLanguage,
            planetColor: identity.planetColor,
            languageStats: stats.languageStats,
            totalCommits: stats.totalCommits,
            weeklyCommits: stats.weeklyCommits,
            planetSizeFactor: identity.planetSizeFactor,
            planetName: identity.planetName,
            achievements: progression.achievements,
            unlockedTitles: progression.unlockedTitles,
            activeTitle: progression.activeTitle,
            observedTotalContributions: stats.observedTotalContributions,
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

