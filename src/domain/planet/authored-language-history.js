function dateKey(value) {
    const timestamp = new Date(value);
    return Number.isFinite(timestamp.getTime()) ? timestamp.toISOString().slice(0, 10) : '';
}

function dominantLanguage(languageLines) {
    return Object.entries(languageLines)
        .filter(([, lines]) => Number(lines) > 0)
        .sort(([leftLanguage, leftLines], [rightLanguage, rightLines]) => (
            Number(rightLines) - Number(leftLines)
            || leftLanguage.localeCompare(rightLanguage, 'en')
        ))[0]?.[0] || '';
}

// 追加行を累積し、既存コード量ではなく本人が積み上げた変更の傾向を再生する。
export function buildAuthoredLanguageHistory(commitRows = []) {
    const commitsByDate = new Map();
    const seenCommitShas = new Set();
    for (const row of commitRows) {
        const date = dateKey(row.authoredAt);
        if (!date) continue;

        // リポジトリ名は所有者変更で変わるため、同一コミットSHAは一度だけ集計する。
        const commitSha = String(row.commitSha || '').toLowerCase();
        if (commitSha && seenCommitShas.has(commitSha)) continue;
        if (commitSha) seenCommitShas.add(commitSha);
        const bucket = commitsByDate.get(date) || { lastAuthoredAt: null, additions: {} };
        const authoredAt = new Date(row.authoredAt).toISOString();
        if (!bucket.lastAuthoredAt || authoredAt > bucket.lastAuthoredAt) bucket.lastAuthoredAt = authoredAt;
        for (const [language, rawLines] of Object.entries(row.languageAdditions || {})) {
            const lines = Math.max(0, Math.trunc(Number(rawLines) || 0));
            if (language && lines > 0) bucket.additions[language] = (bucket.additions[language] || 0) + lines;
        }
        commitsByDate.set(date, bucket);
    }

    const cumulative = {};
    return [...commitsByDate.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([date, bucket]) => {
            for (const [language, lines] of Object.entries(bucket.additions)) {
                cumulative[language] = (cumulative[language] || 0) + lines;
            }
            return {
                date,
                capturedAt: bucket.lastAuthoredAt,
                languageStats: { ...cumulative },
                mainLanguage: dominantLanguage(cumulative)
            };
        })
        .filter((entry) => Object.values(entry.languageStats).some((lines) => lines > 0));
}
