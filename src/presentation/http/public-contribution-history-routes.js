import { timingSafeEqual } from 'node:crypto';

function hasValidApiKey(req, expectedKey) {
    const supplied = Buffer.from(String(req.get('x-api-key') || ''));
    const expected = Buffer.from(String(expectedKey || ''));
    return expected.length > 0
        && supplied.length === expected.length
        && timingSafeEqual(supplied, expected);
}

export function registerPublicContributionHistoryRoutes(app, { service, systemApiKey }) {
    app.get('/api/planets/user/:username/public-history', async (req, res) => {
        if (!service?.getByUsername) return res.status(503).json({ error: 'Public history unavailable' });

        try {
            const result = await service.getByUsername(req.params.username);
            if (!result) return res.status(404).json({ error: 'Planet not found' });
            res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
            return res.status(result.status === 'pending' ? 202 : 200).json(result);
        } catch (error) {
            console.error('[Public History Read Error]', error.code || error.name || 'unknown');
            return res.status(503).json({ error: 'Public history temporarily unavailable' });
        }
    });

    app.post('/api/system/planet-history/refresh', async (req, res) => {
        if (!systemApiKey) return res.status(503).json({ error: 'Internal refresh is not configured' });
        if (!hasValidApiKey(req, systemApiKey)) return res.status(401).json({ error: 'Unauthorized' });
        if (!service?.refreshNext) return res.status(503).json({ error: 'Public history refresh is unavailable' });

        try {
            const result = await service.refreshNext();
            return res.status(result.status === 'deferred' ? 202 : 200).json(result);
        } catch (error) {
            console.error('[Public History Refresh Error]', error.code || error.name || 'unknown');
            return res.status(503).json({ error: 'Public history refresh failed' });
        }
    });
}
