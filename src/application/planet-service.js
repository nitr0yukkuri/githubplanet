import { resolvePlanetIdentity } from './planet-identity.js';
import { derivePlanetProgression } from './planet-progression.js';
import { derivePlanetStats } from './planet-stats.js';
import { LANGUAGE_COLORS } from '../domain/planet/constants.js';
import { calculatePlanetSizeFactor, generatePlanetName } from '../domain/planet/planet.js';
import { safeErrorMetadata } from '../shared/error-metadata.js';

export function createPlanetService({ repository, githubClient, geminiClient, languageColorService, geminiApiKey }) {
    async function refreshAuthenticatedUser(accessToken, previousUser) {
        if (!accessToken) throw new Error('GitHub access token is required');

        const user = await githubClient.getAuthenticatedUser(accessToken);
        if (!user?.id || !user.login) throw new Error('GitHub returned an incomplete user profile');
        if (previousUser?.id && String(user.id) !== String(previousUser.id)) {
            throw new Error('Authenticated GitHub user does not match the active session');
        }

        if (previousUser?.login !== user.login && repository?.updateUsernameByGithubId) {
            // GitHub ID is stable across renames; only synchronize the mutable login after token verification.
            await repository.updateUsernameByGithubId(user.id, user.login);
        }
        return user;
    }

    async function updateAndSavePlanetData(user, accessToken) {
        console.log(`[GraphQL] Fetching data for user: ${user.login}`);

        let userData;
        try {
            userData = await githubClient.getPlanetSource(user.login, accessToken);
        } catch (error) {
            console.error('[GraphQL] データ取得失敗:', safeErrorMetadata(error));
            throw error;
        }

        const stats = derivePlanetStats(userData, user);

        let existingData = null;
        if (repository) {
            try {
                existingData = await repository.findByGithubId(user.id);
            } catch (error) {
                console.error('[DB] 既存データ取得エラー:', safeErrorMetadata(error));
            }
        }

        // I/Oの順序はここに固定し、集計・個性・進捗の仕様変更が互いの実装へ波及しないようにする。
        const identity = await resolvePlanetIdentity({
            mainLanguage: stats.mainLanguage,
            totalCommits: stats.totalCommits,
            existingData,
            geminiClient,
            languageColorService,
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

    async function createPublicPreview(username) {
        const publicSource = await githubClient.getPublicPlanetSource(username);
        const user = { login: publicSource.username || username };
        const stats = derivePlanetStats(publicSource, user);
        const planetColor = LANGUAGE_COLORS[stats.mainLanguage] || '#808080';

        // 匿名プレビューは公開repoの概算だけを使い、貢献数や実績を推測して表示しない。
        return {
            username: user.login,
            planetColor,
            planetSizeFactor: calculatePlanetSizeFactor(0),
            mainLanguage: stats.mainLanguage,
            languageStats: stats.languageStats,
            totalCommits: 0,
            weeklyCommits: 0,
            planetName: generatePlanetName(stats.mainLanguage, planetColor, 0),
            achievements: {},
            activeTitle: { prefix: '名もなき', suffix: '旅人' },
            isPublicPreview: true
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

    return { refreshAuthenticatedUser, updateAndSavePlanetData, createPublicPreview, recordLoginProgress };
}

