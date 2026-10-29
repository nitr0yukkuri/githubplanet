export function createWebhookDeliveryStore(pool) {
    if (!pool) return undefined;
    return {
        async enqueue(deliveryId, payloadHash, payload) {
            if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deliveryId || '')) throw new Error('Invalid GitHub webhook delivery ID');
            if (!/^[0-9a-f]{64}$/.test(payloadHash || '')) throw new Error('Invalid GitHub webhook payload hash');
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                const received = await client.query(`
                    INSERT INTO github_webhook_deliveries (delivery_id, payload_sha256)
                    VALUES ($1::uuid, $2) ON CONFLICT DO NOTHING RETURNING delivery_id
                `, [deliveryId, payloadHash]);
                if (received.rowCount) {
                    // 受信済みだけが残って通知を失わないよう、仕事の保存までを同じtransactionにする。
                    await client.query(`
                        INSERT INTO github_webhook_jobs (delivery_id, commit_index, payload)
                        SELECT $1::uuid, item.ordinality::integer,
                            jsonb_build_object('repository', $3::jsonb, 'commits', jsonb_build_array(item.value))
                        FROM jsonb_array_elements($2::jsonb) WITH ORDINALITY AS item(value, ordinality)
                    `, [deliveryId, JSON.stringify(payload.commits), JSON.stringify(payload.repository)]);
                }
                await client.query('COMMIT');
                return received.rowCount === 1;
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally { client.release(); }
        },
        async claimPending(leaseToken) {
            const result = await pool.query(`
                WITH candidate AS (
                    SELECT id FROM github_webhook_jobs
                    WHERE completed_at IS NULL AND available_at <= NOW()
                        AND (lease_until IS NULL OR lease_until <= NOW())
                    ORDER BY available_at, id FOR UPDATE SKIP LOCKED LIMIT 1
                )
                UPDATE github_webhook_jobs AS job
                SET lease_token = $1::uuid, lease_until = NOW() + INTERVAL '5 minutes', attempts = attempts + 1
                FROM candidate WHERE job.id = candidate.id
                RETURNING job.id, job.payload, job.attempts
            `, [leaseToken]);
            const row = result.rows[0];
            return row ? { id: String(row.id), payload: row.payload, attempts: row.attempts, leaseToken } : null;
        },
        async complete(job) {
            const result = await pool.query(`
                UPDATE github_webhook_jobs
                SET completed_at = NOW(), lease_token = NULL, lease_until = NULL, last_error_code = NULL
                WHERE id = $1 AND lease_token = $2::uuid AND completed_at IS NULL
            `, [job.id, job.leaseToken]);
            return result.rowCount === 1;
        },
        async retry(job, errorCode, delayMs) {
            await pool.query(`
                UPDATE github_webhook_jobs
                SET lease_token = NULL, lease_until = NULL, last_error_code = $3,
                    available_at = NOW() + ($4::integer * INTERVAL '1 millisecond')
                WHERE id = $1 AND lease_token = $2::uuid AND completed_at IS NULL
            `, [job.id, job.leaseToken, errorCode, Math.min(300000, Math.max(1000, delayMs))]);
        },
        async cleanup() {
            // 未完了の仕事は期限切れで削除せず、停止後も再試行できるように残す。
            await pool.query(`
                DELETE FROM github_webhook_deliveries WHERE delivery_id IN (
                    SELECT d.delivery_id FROM github_webhook_deliveries AS d
                    WHERE d.received_at < NOW() - INTERVAL '30 days'
                        AND NOT EXISTS (SELECT 1 FROM github_webhook_jobs j
                            WHERE j.delivery_id = d.delivery_id AND j.completed_at IS NULL)
                    LIMIT 1000
                )
            `);
        }
    };
}
