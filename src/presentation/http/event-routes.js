import crypto from 'crypto';

export function registerEventRoutes(app, {
    geminiClient,
    extensionMap,
    emitMeteor,
    systemApiKey,
    webhookSecret,
    requireInternalAuth = false,
    requireWebhookSignature = false
}) {
    function isInternalAuthorized(req) {
        if (!requireInternalAuth) return true;
        if (req.session?.planetData?.user?.login) return true;
        const apiKey = req.headers['x-api-key'] || req.query.api_key;
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
            const { language, color, scale } = req.body;
            const finalColor = color || await geminiClient.resolveLanguageColor(language || 'Unknown');
            let finalScale = scale || 1.0;
            if (finalScale > 1.5) finalScale = 1.5;

            console.log(`[Manual Meteor] Language: ${language}, Color: ${finalColor}, Scale: ${finalScale}`);
            emitMeteor({ color: finalColor, language: language || 'Manual', scale: finalScale });
            res.json({ success: true, color: finalColor });
        } catch (error) {
            console.error('[Manual Meteor Error]', error);
            res.status(500).json({ error: 'Failed' });
        }
    });

    app.post('/webhook', (req, res) => {
        try {
            if (requireWebhookSignature && !webhookSecret) {
                return res.status(503).send('Webhook secret is not configured');
            }
            if (!hasValidWebhookSignature(req)) {
                return res.status(401).send('Invalid signature');
            }

            const payload = req.body;
            res.status(200).send('OK');

            (async () => {
                if (!payload || !payload.repository || !payload.commits || !Array.isArray(payload.commits)) return;
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
                    console.log(`[Webhook] Commit: ${commit.id.substring(0, 7)} -> Scale: ${meteorScale.toFixed(2)}, Lines: ${totalLines}`);
                    emitMeteor({ color: resolvedColor, language: targetLanguage, scale: meteorScale });
                }
            })().catch((error) => console.error('[Webhook Async Error]', error));
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
