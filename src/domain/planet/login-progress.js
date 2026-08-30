function normalizeIds(ids) {
    return [...new Set(Array.isArray(ids) ? ids.filter(Boolean) : [])];
}

export function calculateLoginProgress({
    previousContributions,
    previousNotifiedAchievementIds,
    currentContributions,
    currentAchievementIds,
    notifyCurrentAchievements = false
}) {
    const currentIds = normalizeIds(currentAchievementIds);
    const hasContributionBaseline = previousContributions !== null
        && previousContributions !== undefined;
    const previousTotal = hasContributionBaseline ? Number(previousContributions) : 0;
    const currentTotal = Math.max(0, Number(currentContributions) || 0);
    const contributionDelta = hasContributionBaseline && Number.isFinite(previousTotal)
        ? Math.max(0, currentTotal - previousTotal)
        : 0;

    const hasAchievementBaseline = Array.isArray(previousNotifiedAchievementIds);
    const previousIds = new Set(normalizeIds(previousNotifiedAchievementIds));
    const newlyUnlockedAchievementIds = hasAchievementBaseline || notifyCurrentAchievements
        ? currentIds.filter((id) => !previousIds.has(id))
        : [];

    return {
        contributionDelta,
        newlyUnlockedAchievementIds,
        achievementBaselineIds: currentIds
    };
}
