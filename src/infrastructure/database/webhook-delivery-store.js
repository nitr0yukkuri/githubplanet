export function createWebhookDeliveryStore(pool) {
    if (!pool) return undefined;
    let lastWebhookDeliveryCleanupAt = 0;
    return {
        async claimGithubWebhookDelivery(deliveryId, payloadHash) {
            if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deliveryId || '')) {
                throw new Error('Invalid GitHub webhook delivery ID');
            }
            if (!/^[0-9a-f]{64}$/.test(payloadHash || '')) {
                throw new Error('Invalid GitHub webhook payload hash');
            }

            const now = Date.now();
            if (now - lastWebhookDeliveryCleanupAt >= 60 * 60 * 1_000) {
                await pool.query(`
                    DELETE FROM github_webhook_deliveries
                    WHERE received_at < NOW() - INTERVAL '30 days'
                `);
                lastWebhookDeliveryCleanupAt = now;
            }

            const result = await pool.query(`
                INSERT INTO github_webhook_deliveries (delivery_id, payload_sha256)
                VALUES ($1::uuid, $2)
                ON CONFLICT DO NOTHING
                RETURNING delivery_id
            `, [deliveryId, payloadHash]);
            return result.rowCount === 1;
        },
    };
}
