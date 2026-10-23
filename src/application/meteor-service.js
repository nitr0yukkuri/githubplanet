export function createMeteorService({ geminiClient, extensionMap, emitMeteor, logger = console }) {
    async function emitManualMeteor({ language, color, scale }) {
        const finalColor = color || await geminiClient.resolveLanguageColor(language || 'Unknown');
        const finalScale = scale > 1.5 ? 1.5 : (scale || 1.0);
        const resolvedLanguage = language || 'Manual';

        logger.log(`[Manual Meteor] Language: ${language}, Color: ${finalColor}, Scale: ${finalScale}`);
        await emitMeteor({ color: finalColor, language: resolvedLanguage, scale: finalScale });
        return { color: finalColor };
    }

    async function processWebhook(payload) {
        if (!payload || !payload.repository || !Array.isArray(payload.commits)) return;
        const repositoryLanguage = payload.repository.language || 'Unknown';

        for (const commit of payload.commits) {
            let targetLanguage = repositoryLanguage;
            const files = [...(commit.added || []), ...(commit.modified || [])];
            const totalLines = parseInt(commit.total_lines || 0, 10);
            const changeCount = files.length;
            let meteorScale = totalLines > 0
                ? 1.0 + (Math.log10(totalLines + 1) * 0.25)
                : 1.0 + (changeCount / 10) * 0.5;
            if (meteorScale > 2.0) meteorScale = 2.0;

            for (const file of files) {
                const extension = file.split('.').pop().toLowerCase();
                if (extensionMap[extension]) {
                    targetLanguage = extensionMap[extension];
                    break;
                }
            }

            const resolvedColor = await geminiClient.resolveLanguageColor(targetLanguage);
            logger.log(`[Webhook] Commit: ${commit.id.substring(0, 7)} -> Scale: ${meteorScale.toFixed(2)}, Lines: ${totalLines}`);
            await emitMeteor({ color: resolvedColor, language: targetLanguage, scale: meteorScale });
        }
    }

    return { emitManualMeteor, processWebhook };
}
