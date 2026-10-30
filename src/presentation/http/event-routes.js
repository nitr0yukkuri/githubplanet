import crypto from 'crypto';
import { safeErrorMetadata } from '../../shared/error-metadata.js';

export function registerEventRoutes(app, {
    geminiClient,
    languageColorService,
    generatePlanetName,
    meteorService,
    systemApiKey,
    webhookSecret,
    webhookDeliveryService,
    onWebhookAccepted = () => {},
    requireInternalAuth = false,
    requireWebhookSignature = false
}) {
    function isInternalAuthorized(req) {
        if (!requireInternalAuth) return true;
        const apiKey = req.headers['x-api-key'];
        return Boolean(systemApiKey && apiKey === systemApiKey);
    }

    function requireAuthorization(req, res, next) {
        if (isInternalAuthorized(req)) return next();
        return res.status(401).json({ error: 'Unauthorized' });
    }

    function hasValidWebhookSignature(req) {
        if (!requireWebhookSignature) return true;
        if (!webhookSecret || !req.rawBody) return false;

        const supplied = req.get('x-hub-signature-256') || '';
        const expected = `sha256=${crypto.createHmac('sha256', webhookSecret).update(req.rawBody).digest('hex')}`;
        const suppliedBuffer = Buffer.from(supplied);
        const expectedBuffer = Buffer.from(expected);
        return suppliedBuffer.length === expectedBuffer.length
            && crypto.timingSafeEqual(suppliedBuffer, expectedBuffer);
    }

    app.post('/api/meteor', requireAuthorization, async (req, res) => {
        try {
            const result = await meteorService.emitManualMeteor(req.body);
            res.json({ success: true, color: result.color });
        } catch (error) {
            console.error('[Manual Meteor Error]', safeErrorMetadata(error));
            res.status(500).json({ error: 'Failed' });
        }
    });

    app.post('/webhook', async (req, res) => {
        try {
            if (requireWebhookSignature && !webhookSecret) {
                return res.status(503).send('Webhook secret is not configured');
            }
            if (!hasValidWebhookSignature(req)) {
                return res.status(401).send('Invalid signature');
            }

            if (requireWebhookSignature) {
                const deliveryId = req.get('x-github-delivery') || '';
                if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deliveryId)) {
                    return res.status(400).send('Invalid delivery ID');
                }
                if (typeof webhookDeliveryService?.accept !== 'function') {
                    return res.status(503).send('Webhook delivery store is unavailable');
                }

                try {
                    const payloadHash = crypto.createHash('sha256').update(req.rawBody).digest('hex');
                    await webhookDeliveryService.accept(deliveryId, payloadHash, req.body);
                } catch (error) {
                    console.error('[Webhook Delivery Store Error]', safeErrorMetadata(error));
                    if (error instanceof TypeError) return res.status(400).send('Invalid webhook payload');
                    return res.status(503).send('Webhook delivery could not be recorded');
                }
                // 200はDBへ再試行可能な仕事を保存できたことを示し、処理完了とは区別する。
                res.status(200).send('OK');
                onWebhookAccepted();
                return;
            }

            const payload = req.body;
            // DBなしの開発用経路も、応答後に失敗を握りつぶさない。
            await meteorService.processWebhook(payload);
            res.status(200).send('OK');
        } catch (error) {
            console.error('[Webhook Error]', safeErrorMetadata(error));
            if (!res.headersSent) res.status(500).send('Error');
        }
    });

    app.get('/api/test-gemini', requireAuthorization, async (req, res) => {
        const output = await geminiClient.ask("Explain 'Hello World' in one short sentence.");
        res.json({ status: output ? 'success' : 'error', output });
    });

    app.get('/api/debug-color/:lang', requireAuthorization, async (req, res) => {
        const mainLanguage = req.params.lang;
        const color = await languageColorService.resolveLanguageColor(mainLanguage);
        res.json({ target_language: mainLanguage, generated_color: color });
    });

    app.get('/api/debug-name/:lang', requireAuthorization, async (req, res) => {
        const mainLanguage = req.params.lang;
        const planetColor = req.query.color || '#808080';
        const totalCommits = parseInt(req.query.commits || '100');
        const generatedName = await generatePlanetName({ mainLanguage, planetColor, totalCommits });

        res.json({
            input_language: mainLanguage,
            input_color: planetColor,
            generated_name: generatedName || '生成失敗'
        });
    });
}
