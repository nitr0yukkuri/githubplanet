import { buildWebhookMeteors } from '../domain/meteor/webhook-meteors.js';
export function createMeteorService({ languageColorService, extensionMap, emitMeteor, logger = console }) {
    async function emitManualMeteor({ language, color, scale }) {
        const finalColor = color || await languageColorService.resolveLanguageColor(language || 'Unknown');
        const finalScale = scale > 1.5 ? 1.5 : (scale || 1.0);
        const resolvedLanguage = language || 'Manual';

        logger.log(`[Manual Meteor] Language: ${language}, Color: ${finalColor}, Scale: ${finalScale}`);
        await emitMeteor({ color: finalColor, language: resolvedLanguage, scale: finalScale });
        return { color: finalColor };
    }

    async function emitWebhookMeteor({ commitId, language, scale }, emissionOptions) {
        const color = await languageColorService.resolveLanguageColor(language);
        logger.log('[Webhook] Commit: ' + commitId.slice(0, 7) + ' -> Scale: ' + scale.toFixed(2));
        await emitMeteor({ color, language, scale }, emissionOptions);
    }

    async function processWebhook(payload) {
        for (const input of buildWebhookMeteors(payload, extensionMap)) await emitWebhookMeteor(input);
    }

    return { emitManualMeteor, emitWebhookMeteor, processWebhook };
}
