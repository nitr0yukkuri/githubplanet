import { buildAuthoredLanguageHistory } from '../domain/planet/authored-language-history.js';

const SCAN_TTL_MS = 6 * 60 * 60 * 1_000;
const DEFAULT_RETRY_MS = 5 * 60 * 1_000;
const REQUEST_CHUNK_RETRY_MS = 1_000;
const inFlightScans = new Set();

export function createAuthoredLanguageHistoryService({ repository, githubClient }) {
    async function startScan({ githubId, login, accessToken, accountCreatedAt, now }) {
        if (!githubId || !login || !accessToken
            || !repository?.tryStartAuthoredLanguageHistoryScan
            || !githubClient?.scanHistoricalAuthoredLanguageCommits
            || !Number.isFinite(new Date(accountCreatedAt).getTime())) return false;
        const key = String(githubId);
        if (inFlightScans.has(key)) return false;

        const previousScan = await repository.getAuthoredLanguageHistoryScan(githubId);
        const resumable = ['partial', 'failed', 'running'].includes(previousScan?.scanStatus);
        const continueCurrentBudget = resumable && !previousScan.requestBudgetReached;
        const resumeProgress = {
            repositoriesScanned: continueCurrentBudget ? previousScan.repositoriesScanned : 0,
            privateRepositoriesSkipped: continueCurrentBudget ? previousScan.privateRepositoriesSkipped : 0,
            commitsFound: continueCurrentBudget ? previousScan.commitsFound : 0,
            commitsScanned: continueCurrentBudget ? previousScan.commitsScanned : 0,
            unavailableCommits: continueCurrentBudget ? previousScan.unavailableCommits : 0,
            incompleteFileCommits: continueCurrentBudget ? previousScan.incompleteFileCommits : 0,
            unclassifiedAddedLines: continueCurrentBudget ? previousScan.unclassifiedAddedLines : 0,
            repositoryCapReached: continueCurrentBudget && previousScan.repositoryCapReached,
            apiRequests: continueCurrentBudget ? previousScan.apiRequests : 0,
            scanCursor: resumable ? previousScan.scanCursor || {} : {}
        };
        const claimed = await repository.tryStartAuthoredLanguageHistoryScan(githubId, SCAN_TTL_MS);
        if (!claimed) return false;

        // インスタンス内だけのロックでは重複を防げないため、DBの条件付き更新を先に通す。
        inFlightScans.add(key);
        try {
            const savedKeys = await repository.findAuthoredLanguageCommitKeys(githubId);
            const knownCommits = new Set(savedKeys.flatMap(({ repositoryFullName, commitSha }) => {
                const normalizedSha = commitSha.toLowerCase();
                return [
                    `${repositoryFullName.toLowerCase()}:${normalizedSha}`,
                    normalizedSha
                ];
            }));
            const progress = await githubClient.scanHistoricalAuthoredLanguageCommits({
                login,
                accessToken,
                accountCreatedAt,
                now,
                knownCommits,
                initialProgress: resumeProgress,
                onBatch: (batch) => repository.saveAuthoredLanguageCommits(githubId, batch),
                onProgress: (value) => repository.updateAuthoredLanguageHistoryScan(githubId, value)
            });
            if (progress.requestBudgetReached) {
                await repository.pauseAuthoredLanguageHistoryScan(githubId, progress, SCAN_TTL_MS);
            } else if (progress.yielded) {
                await repository.pauseAuthoredLanguageHistoryScan(githubId, progress, REQUEST_CHUNK_RETRY_MS);
            } else {
                await repository.completeAuthoredLanguageHistoryScan(githubId, progress);
            }
        } catch (error) {
            await repository.failAuthoredLanguageHistoryScan(
                githubId,
                error.message,
                error.retryAfterMs || DEFAULT_RETRY_MS,
                error.scanProgress || error.progress || null
            ).catch((saveError) => console.warn('[Language History] Could not save scan failure:', saveError.message));
            console.warn(`[Language History] Scan failed for ${login}:`, error.message);
        } finally {
            inFlightScans.delete(key);
        }
        return true;
    }

    async function getHistory(githubId) {
        const scan = await repository.getAuthoredLanguageHistoryScan(githubId);
        const rows = scan ? await repository.findAuthoredLanguageCommits(githubId) : [];
        const history = buildAuthoredLanguageHistory(rows);
        return {
            history,
            status: {
                state: scan?.scanStatus || 'idle',
                ready: history.length > 0,
                partial: Boolean(scan && (
                    scan.scanStatus === 'partial'
                    || scan.scanStatus === 'failed'
                    || scan.privateRepositoriesSkipped > 0
                    || scan.unavailableCommits > 0
                    || scan.incompleteFileCommits > 0
                    || scan.unclassifiedAddedLines > 0
                    || scan.repositoryCapReached
                    || scan.requestBudgetReached
                )),
                updatedAt: scan?.updatedAt || null,
                scanCompletedAt: scan?.scanCompletedAt || null,
                retryAfter: scan?.retryAfter || null,
                repositoriesScanned: Number(scan?.repositoriesScanned) || 0,
                privateRepositoriesSkipped: Number(scan?.privateRepositoriesSkipped) || 0,
                commitsFound: Number(scan?.commitsFound) || 0,
                commitsScanned: Number(scan?.commitsScanned) || 0,
                unavailableCommits: Number(scan?.unavailableCommits) || 0,
                incompleteFileCommits: Number(scan?.incompleteFileCommits) || 0,
                unclassifiedAddedLines: Number(scan?.unclassifiedAddedLines) || 0,
                repositoryCapReached: Boolean(scan?.repositoryCapReached),
                apiRequests: Number(scan?.apiRequests) || 0,
                requestBudgetReached: Boolean(scan?.requestBudgetReached)
            }
        };
    }

    return { startScan, getHistory };
}

