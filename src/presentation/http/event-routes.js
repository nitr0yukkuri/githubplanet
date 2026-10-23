import crypto from 'crypto';

const MAX_METEOR_EVENT_ID = 9_223_372_036_854_775_807n;

export function registerEventRoutes(app, {
    geminiClient,
    meteorService,
    meteorEventRepository,
    systemApiKey,
    webhookSecret,
    webhookDeliveryStore,
    requireInternalAuth = false,
    requireWebhookSignature = false,
    logger = console
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

    app.get('/api/meteors', async (req, res) => {
        const afterId = req.query?.after ?? '0';
        if (typeof afterId !== 'string'
            || !/^\d{1,19}$/.test(afterId)
            || BigInt(afterId) > MAX_METEOR_EVENT_ID) {
            return res.status(400).json({ error: 'Invalid meteor event cursor' });
        }

        res.setHeader('Cache-Control', 'no-store');
        if (!meteorEventRepository) return res.json({ events: [] });

        try {
            const events = await meteorEventRepository.findAfter(afterId);
            return res.json({ events });
        } catch (error) {
            logger.error('[Meteor Event Replay Error]', error);
            return res.status(503).json({ error: 'Meteor events are temporarily unavailable' });
        }
    });

    app.post('/api/meteor', requireAuthorization, async (req, res) => {
        try {
            const result = await meteorService.emitManualMeteor(req.body);
            res.json({ success: true, color: result.color });
        } catch (error) {
            console.error('[Manual Meteor Error]', error);
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
                if (typeof webhookDeliveryStore?.claimGithubWebhookDelivery !== 'function') {
                    return res.status(503).send('Webhook delivery store is unavailable');
                }

                let isNewDelivery;
                try {
                    const payloadHash = crypto.createHash('sha256').update(req.rawBody).digest('hex');
                    isNewDelivery = await webhookDeliveryStore.claimGithubWebhookDelivery(deliveryId, payloadHash);
                } catch (error) {
                    console.error('[Webhook Delivery Store Error]', error);
                    return res.status(503).send('Webhook delivery could not be recorded');
                }
                if (!isNewDelivery) return res.status(200).send('OK');
            }

            const payload = req.body;
            res.status(200).send('OK');

            // GitHubへのACK速度は維持しつつ、業務処理はApplicationのユースケースに委譲する。
            meteorService.processWebhook(payload)
                .catch((error) => console.error('[Webhook Async Error]', error));
        } catch (error) {
            console.error('[Webhook Error]', error);
            if (!res.headersSent) res.status(500).send('Error');
        }
    });

    app.get('/api/test-gemini', requireAuthorization, async (req, res) => {
        const output = await geminiClient.ask("Explain 'Hello World' in one short sentence.");
        res.json({ status: output ? 'success' : 'error', output });
    });

    app.get('/api/debug-color/:lang', requireAuthorization, async (req, res) => {
        const mainLanguage = req.params.lang;
        const color = await geminiClient.resolveLanguageColor(mainLanguage);
        res.json({ target_language: mainLanguage, generated_color: color });
    });

    app.get('/api/debug-name/:lang', requireAuthorization, async (req, res) => {
        const mainLanguage = req.params.lang;
        const planetColor = req.query.color || '#808080';
        const totalCommits = parseInt(req.query.commits || '100');
        const suffix = totalCommits > 1000 ? '帝星' : totalCommits > 500 ? '巨星' : '星';
        const prompt = `Programming language: ${mainLanguage}. Color: ${planetColor}.
    Generate a cool Japanese planet name in the format: "[Adjective][ColorName]の${suffix}".
    The adjective should describe the nature of "${mainLanguage}". The color name should describe the color "${planetColor}".
    Example: "JavaScript" -> "柔軟な黄金の${suffix}".
    Return ONLY the name string.`;
        const generatedName = await geminiClient.ask(prompt);

        res.json({
            input_language: mainLanguage,
            input_color: planetColor,
            generated_name: generatedName || '生成失敗'
        });
    });
}
