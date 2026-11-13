export const JOB_LEASE_SECONDS = 15 * 60;

export function retryAfterLease(remainingSeconds) {
    const remaining = Number.isFinite(remainingSeconds) && remainingSeconds > 0
        ? remainingSeconds : JOB_LEASE_SECONDS;
    return Math.min(43_200, Math.ceil(remaining) + 1);
}
