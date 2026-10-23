export function createPlanetQueryService({ repository, githubClient, planetService, cacheDuration }) {
    function isExpired(lastUpdated) {
        return Date.now() - new Date(lastUpdated).getTime() > cacheDuration;
    }

    async function refresh(username, accessToken) {
        const user = await githubClient.getUser(username, accessToken);
        await planetService.updateAndSavePlanetData(user, accessToken);
    }

    async function getByUsername(username, accessToken) {
        let row = await repository.findByUsername(username);
        const shouldUpdate = Boolean(accessToken) && (!row || (row.lastUpdated && isExpired(row.lastUpdated)));

        if (shouldUpdate) {
            try {
                await refresh(username, accessToken);
                const updatedRow = await repository.findByUsername(username);
                if (updatedRow) row = updatedRow;
            } catch (error) {
                console.warn(`[Visit Update] Failed to update ${username}: ${error.message}`);
            }
        }

        return row;
    }

    async function getRandom({ loggedInUserId, lastRandomVisitedId }) {
        const excludeIds = [];
        if (loggedInUserId) excludeIds.push(loggedInUserId);
        if (lastRandomVisitedId) excludeIds.push(lastRandomVisitedId);

        let row = await repository.findRandom(excludeIds);
        if (!row && loggedInUserId) row = await repository.findRandom([loggedInUserId]);
        if (!row) row = await repository.findRandom();
        return row || null;
    }

    async function saveActiveTitle(githubId, activeTitle, unlockedTitles) {
        const { prefix, suffix } = activeTitle || {};
        if (!githubId
            || typeof prefix !== 'string'
            || typeof suffix !== 'string'
            || !Array.isArray(unlockedTitles?.prefixes)
            || !Array.isArray(unlockedTitles?.suffixes)
            || !unlockedTitles.prefixes.includes(prefix)
            || !unlockedTitles.suffixes.includes(suffix)) return false;

        await repository.updateActiveTitle(githubId, activeTitle);
        return true;
    }

    async function getLanguageHistoryByGithubId(githubId) {
        return repository.findLanguageHistoryByGithubId(githubId);
    }

    return { getByUsername, getLanguageHistoryByGithubId, getRandom, saveActiveTitle };
}
