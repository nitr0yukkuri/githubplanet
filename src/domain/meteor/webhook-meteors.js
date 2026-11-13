export function webhookFileLanguage(file, extensionMap) {
    return typeof file === 'string' ? extensionMap[file.split('.').pop().toLowerCase()] : undefined;
}

export function buildWebhookMeteor({ commitId, repositoryLanguage, fileLanguage, totalLines, fileCount }) {
    if (typeof commitId !== 'string' || !commitId || commitId.length > 256) return null;
    const lines = Number.parseInt(totalLines || 0, 10);
    const language = fileLanguage || repositoryLanguage || 'Unknown';
    if (typeof language !== 'string' || language.length > 256) return null;
    return {
        commitId, language,
        scale: Math.min(2, lines > 0 ? 1 + Math.log10(lines + 1) * 0.25 : 1 + fileCount / 10 * 0.5)
    };
}

// Queueには本文やファイル一覧を残さず、既存の言語選択とサイズだけを保存する。
export function buildWebhookMeteors(payload, extensionMap) {
    if (!payload?.repository || !Array.isArray(payload.commits)) return [];
    return payload.commits.flatMap((commit) => {
        const files = [ ...(Array.isArray(commit?.added) ? commit.added : []), ...(Array.isArray(commit?.modified) ? commit.modified : []) ].filter((file) => typeof file === 'string');
        const input = buildWebhookMeteor({ commitId: commit?.id, repositoryLanguage: payload.repository.language,
            fileLanguage: files.map((file) => webhookFileLanguage(file, extensionMap)).find(Boolean), totalLines: commit?.total_lines, fileCount: files.length });
        return input ? [input] : [];
    });
}
