export function createMemoryWebhookStore({ now = Date.now } = {}) {
    const deliveries = new Set(), hashes = new Set(), jobs = [];
    return {
        jobs,
        clear() { deliveries.clear(); hashes.clear(); jobs.length = 0; },
        async enqueue(id, hash, payload) {
            if (deliveries.has(id) || hashes.has(hash)) return false;
            deliveries.add(id); hashes.add(hash);
            payload.commits.forEach((commit) => jobs.push({ id: String(jobs.length + 1),
                payload: { repository: payload.repository, commits: [commit] }, attempts: 0, availableAt: now() }));
            return true;
        },
        async claimPending(leaseToken) {
            const job = jobs.find((item) => !item.completed && item.availableAt <= now() && (!item.leaseUntil || item.leaseUntil <= now()));
            if (!job) return null;
            job.leaseToken = leaseToken; job.leaseUntil = now() + 300000; job.attempts++;
            return { ...job };
        },
        async complete(job) {
            const current = jobs.find((item) => item.id === job.id);
            if (current.leaseToken !== job.leaseToken || current.completed) return false;
            current.completed = true; return true;
        },
        async retry(job, errorCode, delay) {
            const current = jobs.find((item) => item.id === job.id);
            if (current.leaseToken !== job.leaseToken || current.completed) return;
            current.leaseUntil = null; current.availableAt = now() + delay; current.errorCode = errorCode;
        },
        async cleanup() {}
    };
}
