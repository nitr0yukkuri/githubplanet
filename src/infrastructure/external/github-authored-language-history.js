import { measureExternalOperation } from '../observability/external-performance.js';

const GITHUB_API_TIMEOUT_MS = 10_000;
const MAX_REQUESTS_PER_SCAN = 800;
// Cloud RunのHTTP要求中だけ同期処理し、応答後に止まりうる背景スキャンを避ける。
const MAX_REQUESTS_PER_HTTP_REQUEST = 15;
const MIN_REST_REQUEST_RESERVE = 1_000;
const MIN_GRAPHQL_POINT_RESERVE = 500;
const MAX_REPOSITORIES_PER_YEAR = 100;
const DETAIL_CONCURRENCY = 3;
const GRAPHQL_REPOSITORIES_QUERY = `
    query AuthoredCommitRepositories($login: String!, $from: DateTime!, $to: DateTime!) {
        user(login: $login) {
            contributionsCollection(from: $from, to: $to) {
                commitContributionsByRepository(maxRepositories: 100) {
                    repository { nameWithOwner isPrivate }
                }
            }
        }
    }
`;

function cooldownFromHeaders(headers = {}) {
    const retryAfter = Number(headers['retry-after']) * 1_000 || 0;
    const resetAt = Number(headers['x-ratelimit-reset']) * 1_000 || 0;
    return Math.max(retryAfter, resetAt - Date.now(), 0);
}

function classifyAddedLines(files, totalAdditions, extensionMap) {
    const languageAdditions = {};
    let classifiedLines = 0;
    let unclassifiedAddedLines = 0;
    for (const file of Array.isArray(files) ? files : []) {
        const additions = Math.max(0, Math.trunc(Number(file.additions) || 0));
        if (!additions) continue;
        classifiedLines += additions;
        const basename = String(file.filename || '').split('/').at(-1).toLowerCase();
        const extension = basename.includes('.') ? basename.split('.').at(-1) : '';
        const language = extensionMap[extension];
        if (!language) unclassifiedAddedLines += additions;
        else languageAdditions[language] = (languageAdditions[language] || 0) + additions;
    }
    unclassifiedAddedLines += Math.max(0, totalAdditions - classifiedLines);
    return { languageAdditions, unclassifiedAddedLines, classifiedLines };
}

async function mapWithConcurrency(items, limit, operation) {
    const results = new Array(items.length);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) {
            const index = next++;
            try {
                results[index] = { status: 'fulfilled', value: await operation(items[index]) };
            } catch (reason) {
                results[index] = { status: 'rejected', reason };
            }
        }
    }));
    return results;
}

export function createGithubAuthoredLanguageHistoryClient({ axios, extensionMap, onRequestTiming }) {
    async function graphql(query, variables, accessToken, onHeaders) {
        const response = await measureExternalOperation(onRequestTiming, 'authored_language_repositories', async () => {
            try {
                const result = await axios.post('https://api.github.com/graphql', { query, variables }, {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: GITHUB_API_TIMEOUT_MS
                });
                onHeaders(result.headers || {});
                if (result.data.errors) {
                    const error = new Error('GitHub GraphQL history query failed');
                    error.response = { status: 200, headers: result.headers || {}, data: result.data };
                    if (result.data.errors.some(({ type, message }) => (
                        type === 'RATE_LIMITED' || /rate limit|resource limits exceeded/i.test(message || '')
                    ))) error.retryAfterMs = cooldownFromHeaders(result.headers);
                    throw error;
                }
                return result.data.data.user;
            } catch (error) {
                const headers = error.response?.headers || {};
                onHeaders(headers);
                if (error.response?.status === 403 || error.response?.status === 429
                    || headers['retry-after'] || headers['x-ratelimit-remaining'] === '0') {
                    error.retryAfterMs ||= cooldownFromHeaders(headers);
                }
                throw error;
            }
        }, { provider: 'github' });
        return response;
    }

    async function rest(path, params, accessToken, operation, onHeaders) {
        return measureExternalOperation(onRequestTiming, operation, async () => {
            try {
                const response = await axios.get(`https://api.github.com${path}`, {
                    params,
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        Accept: 'application/vnd.github+json',
                        'X-GitHub-Api-Version': '2022-11-28'
                    },
                    timeout: GITHUB_API_TIMEOUT_MS
                });
                onHeaders(response.headers || {});
                return response.data;
            } catch (error) {
                const headers = error.response?.headers || {};
                onHeaders(headers);
                if (error.response?.status === 403 || error.response?.status === 429
                    || headers['retry-after'] || headers['x-ratelimit-remaining'] === '0') {
                    error.retryAfterMs ||= cooldownFromHeaders(headers);
                }
                throw error;
            }
        }, { provider: 'github' });
    }

    return {
        async scanHistoricalAuthoredLanguageCommits({
            login,
            accessToken,
            accountCreatedAt,
            now = new Date(),
            knownCommits = new Set(),
            initialProgress = {},
            onBatch = async () => {},
            onProgress = async () => {}
        }) {
            const createdAt = new Date(accountCreatedAt);
            const through = new Date(now);
            const progress = {
                repositoriesScanned: Number(initialProgress.repositoriesScanned) || 0,
                privateRepositoriesSkipped: Number(initialProgress.privateRepositoriesSkipped) || 0,
                commitsFound: Number(initialProgress.commitsFound) || 0,
                commitsScanned: Number(initialProgress.commitsScanned) || 0,
                unavailableCommits: Number(initialProgress.unavailableCommits) || 0,
                incompleteFileCommits: Number(initialProgress.incompleteFileCommits) || 0,
                unclassifiedAddedLines: Number(initialProgress.unclassifiedAddedLines) || 0,
                repositoryCapReached: Boolean(initialProgress.repositoryCapReached),
                apiRequests: Number(initialProgress.apiRequests) || 0,
                scanCursor: initialProgress.scanCursor && typeof initialProgress.scanCursor === 'object'
                    ? { ...initialProgress.scanCursor }
                    : {},
                requestBudgetReached: false,
                yielded: false
            };
            if (!login || !accessToken || !Number.isFinite(createdAt.getTime())
                || !Number.isFinite(through.getTime()) || createdAt > through) return progress;

            const remainingState = { restRemaining: null, graphqlRemaining: null };
            let requestsThisInvocation = 0;
            const updateRemaining = (kind) => (headers = {}) => {
                const remaining = Number(headers['x-ratelimit-remaining']);
                if (!Number.isInteger(remaining) || remaining < 0) return;
                const key = kind === 'rest' ? 'restRemaining' : 'graphqlRemaining';
                // 並列REST応答が逆順で戻っても、残数を多く見積もらない。
                if (remainingState[key] === null || remaining < remainingState[key]) remainingState[key] = remaining;
            };
            const canRequest = (kind) => {
                if (requestsThisInvocation >= MAX_REQUESTS_PER_HTTP_REQUEST) {
                    progress.yielded = true;
                    return false;
                }
                const remaining = remainingState[kind === 'rest' ? 'restRemaining' : 'graphqlRemaining'];
                const reserve = kind === 'rest' ? MIN_REST_REQUEST_RESERVE : MIN_GRAPHQL_POINT_RESERVE;
                if (progress.apiRequests >= MAX_REQUESTS_PER_SCAN || (remaining !== null && remaining <= reserve)) {
                    progress.requestBudgetReached = true;
                    return false;
                }
                return true;
            };
            const request = async (kind, operation) => {
                if (!canRequest(kind)) {
                    const error = new Error('Authored language history scan request budget reached');
                    error.code = 'GITHUB_HISTORY_REQUEST_BUDGET_REACHED';
                    throw error;
                }
                progress.apiRequests += 1;
                requestsThisInvocation += 1;
                try {
                    return await operation();
                } catch (error) {
                    error.scanProgress = { ...progress, scanCursor: { ...progress.scanCursor } };
                    throw error;
                }
            };

            const firstYear = createdAt.getUTCFullYear();
            const lastYear = through.getUTCFullYear();
            const resumeCursor = { ...progress.scanCursor };
            const requestedYear = Number(resumeCursor.year);
            const startYear = Number.isInteger(requestedYear)
                ? Math.min(lastYear + 1, Math.max(firstYear, requestedYear))
                : firstYear;

            for (let year = startYear; year <= lastYear; year += 1) {
                const from = new Date(Math.max(Date.UTC(year, 0, 1), createdAt.getTime()));
                const to = new Date(Math.min(Date.UTC(year + 1, 0, 1) - 1, through.getTime()));
                progress.scanCursor = { year, repositoryFullName: null, page: 1 };
                if (!canRequest('graphql')) {
                    await onProgress({ ...progress });
                    return progress;
                }
                const queryUser = await request('graphql', () => graphql(
                    GRAPHQL_REPOSITORIES_QUERY,
                    { login, from: from.toISOString(), to: to.toISOString() },
                    accessToken,
                    updateRemaining('graphql')
                ));
                const repositories = queryUser?.contributionsCollection?.commitContributionsByRepository || [];
                if (repositories.length >= MAX_REPOSITORIES_PER_YEAR) progress.repositoryCapReached = true;

                const cursorRepository = year === requestedYear
                    ? String(resumeCursor.repositoryFullName || '').toLowerCase()
                    : '';
                const matchingRepositoryIndex = cursorRepository
                    ? repositories.findIndex((item) => (
                        String(item?.repository?.nameWithOwner || '').toLowerCase() === cursorRepository
                    ))
                    : 0;
                const startRepositoryIndex = matchingRepositoryIndex >= 0 ? matchingRepositoryIndex : 0;

                for (let repositoryIndex = startRepositoryIndex; repositoryIndex < repositories.length; repositoryIndex += 1) {
                    const item = repositories[repositoryIndex];
                    const repository = item?.repository;
                    const fullName = repository?.nameWithOwner;
                    if (!fullName) continue;
                    if (repository.isPrivate) {
                        progress.privateRepositoriesSkipped += 1;
                        continue;
                    }
                    const [owner, name] = fullName.split('/');
                    if (!owner || !name) continue;
                    const resumeThisRepository = year === requestedYear
                        && matchingRepositoryIndex === repositoryIndex;
                    let page = resumeThisRepository
                        ? Math.max(1, Math.trunc(Number(resumeCursor.page) || 1))
                        : 1;
                    const seen = new Set();
                    while (true) {
                        progress.scanCursor = { year, repositoryFullName: fullName, page };
                        if (!canRequest('rest')) {
                            await onProgress({ ...progress });
                            return progress;
                        }
                        const commits = await request('rest', () => rest(
                            `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/commits`,
                            { author: login, since: from.toISOString(), until: to.toISOString(), per_page: 100, page },
                            accessToken,
                            'list_authored_commits',
                            updateRemaining('rest')
                        ));
                        const commitList = Array.isArray(commits) ? commits : [];
                        if (commitList.length === 0) {
                            progress.repositoriesScanned += 1;
                            const nextRepository = repositories
                                .slice(repositoryIndex + 1)
                                .map((nextItem) => nextItem?.repository?.nameWithOwner)
                                .find(Boolean) || null;
                            progress.scanCursor = repositoryIndex + 1 < repositories.length
                                ? { year, repositoryFullName: nextRepository, page: 1 }
                                : { year: year + 1, repositoryFullName: null, page: 1 };
                            await onProgress({ ...progress });
                            break;
                        }
                        const references = commitList.filter((commit) => {
                            const sha = commit?.sha;
                            if (!sha) return false;
                            const normalizedSha = sha.toLowerCase();
                            const key = `${fullName.toLowerCase()}:${normalizedSha}`;
                            if (seen.has(normalizedSha)) return false;
                            seen.add(normalizedSha);
                            const isNew = !knownCommits.has(key) && !knownCommits.has(normalizedSha);
                            if (isNew) progress.commitsFound += 1;
                            return isNew;
                        });
                        const details = await mapWithConcurrency(references, DETAIL_CONCURRENCY, async (commit) => {
                            const detail = await request('rest', () => rest(
                                `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/commits/${encodeURIComponent(commit.sha)}`,
                                undefined,
                                accessToken,
                                'get_authored_commit_details',
                                updateRemaining('rest')
                            ));
                            const totalAddedLines = Math.max(0, Math.trunc(Number(detail.stats?.additions) || 0));
                            const classified = classifyAddedLines(detail.files, totalAddedLines, extensionMap);
                            const fileAdditions = (detail.files || []).reduce((sum, file) => (
                                sum + Math.max(0, Math.trunc(Number(file.additions) || 0))
                            ), 0);
                            return {
                                repositoryFullName: fullName,
                                commitSha: commit.sha,
                                authoredAt: detail.commit?.author?.date || commit.commit?.author?.date,
                                languageAdditions: classified.languageAdditions,
                                totalAddedLines,
                                unclassifiedAddedLines: classified.unclassifiedAddedLines,
                                filesComplete: Array.isArray(detail.files) && fileAdditions >= totalAddedLines
                            };
                        });
                        const batch = [];
                        let failure = null;
                        for (let index = 0; index < details.length; index += 1) {
                            const result = details[index];
                            const commit = references[index];
                            const normalizedSha = commit.sha.toLowerCase();
                            const key = `${fullName.toLowerCase()}:${normalizedSha}`;
                            if (result.status === 'rejected') {
                                if (result.reason?.code === 'GITHUB_HISTORY_REQUEST_BUDGET_REACHED') {
                                    if (!progress.yielded) progress.requestBudgetReached = true;
                                } else if ([404, 409].includes(result.reason?.response?.status)) {
                                    progress.unavailableCommits += 1;
                                    knownCommits.add(key);
                                    knownCommits.add(normalizedSha);
                                } else failure ||= result.reason;
                                continue;
                            }
                            if (!result.value.authoredAt) {
                                progress.unavailableCommits += 1;
                                knownCommits.add(key);
                                knownCommits.add(normalizedSha);
                                continue;
                            }
                            batch.push(result.value);
                            knownCommits.add(key);
                            knownCommits.add(normalizedSha);
                        }
                        if (batch.length) {
                            await onBatch(batch);
                            progress.commitsScanned += batch.length;
                            progress.incompleteFileCommits += batch.filter((row) => !row.filesComplete).length;
                            progress.unclassifiedAddedLines += batch.reduce((sum, row) => sum + row.unclassifiedAddedLines, 0);
                        }
                        if (failure) {
                            failure.progress = { ...progress };
                            failure.scanProgress = { ...progress, scanCursor: { ...progress.scanCursor } };
                            await onProgress({ ...progress });
                            throw failure;
                        }
                        if (progress.yielded || progress.requestBudgetReached) {
                            await onProgress({ ...progress });
                            return progress;
                        }
                        if (commitList.length < 100) {
                            progress.repositoriesScanned += 1;
                            const nextRepository = repositories
                                .slice(repositoryIndex + 1)
                                .map((nextItem) => nextItem?.repository?.nameWithOwner)
                                .find(Boolean) || null;
                            progress.scanCursor = repositoryIndex + 1 < repositories.length
                                ? { year, repositoryFullName: nextRepository, page: 1 }
                                : { year: year + 1, repositoryFullName: null, page: 1 };
                            await onProgress({ ...progress });
                            break;
                        }
                        page += 1;
                        progress.scanCursor = { year, repositoryFullName: fullName, page };
                        await onProgress({ ...progress });
                    }
                }
                progress.scanCursor = { year: year + 1, repositoryFullName: null, page: 1 };
                await onProgress({ ...progress });
            }
            progress.scanCursor = {};
            return progress;
        }
    };
}

