const ANONYMOUS_GITHUB_PROFILE_LOOKUP_LIMIT = 40;
const ANONYMOUS_GITHUB_PROFILE_LOOKUP_WINDOW_MS = 60 * 60 * 1000;

export function createPlanetQueryService({ repository, githubClient, planetService, cacheDuration }) {
    const publicPreviewCache = new Map();
    const publicPreviewCacheTtlMs = 5 * 60 * 1000;
    const maxPublicPreviewCacheEntries = 200;
    const githubIdentityCache = new Map();
    const githubIdentityCacheTtlMs = 30_000;
    const missingGithubIdentityCacheTtlMs = 10_000;
    const maxGithubIdentityCacheEntries = 500;

    function resolveGithubIdentity(key, requestUser) {
        const cached = githubIdentityCache.get(key);
        if (cached?.promise) return cached.promise;
        if (cached && cached.expiresAt > Date.now()) {
            githubIdentityCache.delete(key);
            githubIdentityCache.set(key, cached);
            return cached.value;
        }
        githubIdentityCache.delete(key);

        while (githubIdentityCache.size >= maxGithubIdentityCacheEntries) {
            githubIdentityCache.delete(githubIdentityCache.keys().next().value);
        }

        const entry = { promise: null, value: null, expiresAt: 0 };
        entry.promise = requestUser()
            .then((user) => {
                entry.value = user;
                entry.expiresAt = Date.now() + githubIdentityCacheTtlMs;
                return user;
            })
            .catch((error) => {
                if (error.response?.status === 404) {
                    entry.expiresAt = Date.now() + missingGithubIdentityCacheTtlMs;
                    return null;
                }
                githubIdentityCache.delete(key);
                throw error;
            })
            .finally(() => { entry.promise = null; });
        githubIdentityCache.set(key, entry);
        return entry.promise;
    }

    function resolveGithubUser(username, accessToken) {
        const key = `login:${String(username || '').trim().toLowerCase()}`;
        return resolveGithubIdentity(key, () => githubClient.getUser(username, accessToken));
    }

    async function resolveGithubUserById(githubId, accessToken) {
        const normalizedGithubId = String(githubId ?? '').trim();
        if (!/^[1-9]\d*$/.test(normalizedGithubId)
            || typeof githubClient.getUserById !== 'function') return null;

        const user = await resolveGithubIdentity(
            `id:${normalizedGithubId}`,
            async () => {
                if (!accessToken) {
                    if (typeof repository?.reserveGithubProfileLookup !== 'function') {
                        throw new Error('Anonymous GitHub profile lookup budget is unavailable');
                    }
                    const reservation = await repository.reserveGithubProfileLookup(
                        ANONYMOUS_GITHUB_PROFILE_LOOKUP_LIMIT,
                        ANONYMOUS_GITHUB_PROFILE_LOOKUP_WINDOW_MS
                    );
                    if (reservation?.allowed !== true) {
                        const error = new Error('Anonymous GitHub profile lookup budget reached');
                        error.response = { status: 429 };
                        error.retryAfterMs = reservation?.retryAfterMs;
                        throw error;
                    }
                }
                return githubClient.getUserById(normalizedGithubId, accessToken);
            }
        );
        return user && String(user.id) === normalizedGithubId ? user : null;
    }

    function isExpired(lastUpdated) {
        return Date.now() - new Date(lastUpdated).getTime() > cacheDuration;
    }

    async function getPublicPlanetPreview(username) {
        const normalizedUsername = String(username || '').trim();
        if (!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(normalizedUsername)
            || !planetService?.createPublicPreview) return null;

        const key = normalizedUsername.toLowerCase();
        const cached = publicPreviewCache.get(key);
        if (cached?.promise) return cached.promise;
        if (cached && cached.expiresAt > Date.now()) {
            publicPreviewCache.delete(key);
            publicPreviewCache.set(key, cached);
            return cached.value;
        }
        publicPreviewCache.delete(key);

        while (publicPreviewCache.size >= maxPublicPreviewCacheEntries) {
            const removableKey = [...publicPreviewCache]
                .find(([, entry]) => !entry.promise)?.[0];
            if (!removableKey) throw new Error('Public planet preview cache is busy');
            publicPreviewCache.delete(removableKey);
        }

        const entry = { promise: null, value: null, expiresAt: 0 };
        entry.promise = planetService.createPublicPreview(normalizedUsername)
            .then((preview) => {
                entry.value = preview;
                entry.expiresAt = Date.now() + publicPreviewCacheTtlMs;
                return preview;
            })
            .catch((error) => {
                if (error.response?.status === 404) {
                    entry.value = null;
                    entry.expiresAt = Date.now() + 30_000;
                    return null;
                }
                publicPreviewCache.delete(key);
                throw error;
            })
            .finally(() => { entry.promise = null; });
        publicPreviewCache.set(key, entry);
        return entry.promise;
    }

    async function refresh(user, accessToken) {
        await planetService.updateAndSavePlanetData(user, accessToken);
    }

    async function getByUsername(username, accessToken) {
        let row = await repository.findByUsername(username);
        let user = null;

        // 表示名は再利用されるため、保存行を返す前に不変IDで所有者を照合する。
        if (row || accessToken) {
            user = await resolveGithubUser(username, accessToken);
            if (!user && row) {
                // GitHubは旧プロフィールURLを転送しないため、保存済みIDから現在のログイン名を解決する。
                user = await resolveGithubUserById(row.githubId, accessToken);
                if (!user) return { ...row, githubProfileVerified: false };
            }
            if (!user) return null;
            if (row && String(user.id) !== String(row.githubId)) {
                row = await repository.findByGithubId(user.id);
            }
            if (row && user.login && user.login !== row.username) {
                await repository.updateUsernameByGithubId(user.id, user.login);
                row = { ...row, username: user.login };
            }
        }

        const shouldUpdate = Boolean(accessToken) && (!row || (row.lastUpdated && isExpired(row.lastUpdated)));
        if (shouldUpdate) {
            try {
                await refresh(user || await resolveGithubUser(username, accessToken), accessToken);
                const updatedRow = await repository.findByGithubId(user.id);
                if (updatedRow) row = updatedRow;
            } catch (error) {
                console.warn(`[Visit Update] Failed to update ${username}: ${error.message}`);
            }
        }

        if (!row && !accessToken) return getPublicPlanetPreview(username);
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

    async function getGithubProfileUrlById(githubId) {
        const normalizedGithubId = String(githubId ?? '').trim();
        if (!/^[1-9]\d*$/.test(normalizedGithubId)
            || typeof repository?.findByGithubId !== 'function') return null;
        const row = await repository.findByGithubId(normalizedGithubId);
        if (!row) return null;

        const user = await resolveGithubUserById(normalizedGithubId);
        const login = String(user?.login || '');
        if (!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(login)) return null;

        if (login !== row.username && typeof repository.updateUsernameByGithubId === 'function') {
            try {
                await repository.updateUsernameByGithubId(normalizedGithubId, login);
            } catch (error) {
                // 名前の同期に失敗しても、確認できた現在のプロフィールへは転送する。
                console.warn('[GitHub Profile] Could not save the current login:', error.message);
            }
        }
        return `https://github.com/${encodeURIComponent(login)}`;
    }

    return {
        getByUsername,
        getGithubProfileUrlById,
        getLanguageHistoryByGithubId,
        getRandom,
        saveActiveTitle
    };
}
