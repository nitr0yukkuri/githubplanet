const MAX_REPLAY_EVENTS = 500;
const MAX_EVENT_ID = 9_223_372_036_854_775_807n;
const CLEANUP_INTERVAL_MS = 60 * 1_000;

function parseEventId(value) {
    const normalized = String(value ?? '0');
    if (!/^\d{1,19}$/.test(normalized) || BigInt(normalized) > MAX_EVENT_ID) {
        throw new TypeError('Meteor event cursor must be a non-negative PostgreSQL bigint');
    }
    return normalized;
}

function mapMeteorEvent(row) {
    return {
        ...(typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload),
        id: String(row.id),
        createdAt: new Date(row.created_at).toISOString()
    };
}

export function createMeteorEventRepository(pool, { logger = console } = {}) {
    if (!pool) return undefined;

    let lastCleanupAt = 0;

    return {
        async append(event) {
            const client = await pool.connect();
            let inTransaction = false;
            let result;
            try {
                await client.query('BEGIN');
                inTransaction = true;
                // ID順で再生するため、複数Cloud Runインスタンスの採番とcommitを直列化する。
                await client.query(
                    'SELECT pg_advisory_xact_lock(hashtext($1))',
                    ['githubplanet_meteor_event_append']
                );
                result = await client.query(`
                    INSERT INTO meteor_events (payload)
                    VALUES ($1::jsonb)
                    RETURNING id, payload, created_at
                `, [JSON.stringify(event)]);
                await client.query('COMMIT');
                inTransaction = false;
            } catch (error) {
                if (inTransaction) await client.query('ROLLBACK').catch(() => undefined);
                throw error;
            } finally {
                client.release();
            }

            const row = result.rows[0];

            if (Date.now() - lastCleanupAt >= CLEANUP_INTERVAL_MS) {
                lastCleanupAt = Date.now();
                try {
                    await pool.query(`
                        DELETE FROM meteor_events
                        WHERE created_at < NOW() - INTERVAL '30 minutes'
                           OR id NOT IN (
                                SELECT id FROM meteor_events ORDER BY id DESC LIMIT $1
                           )
                    `, [MAX_REPLAY_EVENTS]);
                } catch (error) {
                    // 保存済みの流星は配信し、掃除だけ次回へ回す。
                    lastCleanupAt = 0;
                    logger.warn(`[Meteor Events] 古いイベントの削除をスキップ: ${error.message}`);
                }
            }

            return mapMeteorEvent(row);
        },

        async getLatestId() {
            const result = await pool.query(`
                SELECT COALESCE(MAX(id), 0)::text AS id
                FROM meteor_events
            `);
            return result.rows[0]?.id ?? '0';
        },

        async findAfter(afterId = '0', limit = MAX_REPLAY_EVENTS) {
            const cursor = parseEventId(afterId);
            if (!Number.isInteger(limit) || limit < 1 || limit > MAX_REPLAY_EVENTS) {
                throw new RangeError(`Meteor event limit must be between 1 and ${MAX_REPLAY_EVENTS}`);
            }

            const result = await pool.query(`
                SELECT id, payload, created_at
                FROM meteor_events
                WHERE id > $1::bigint
                  AND created_at >= NOW() - INTERVAL '30 minutes'
                ORDER BY id ASC
                LIMIT $2
            `, [cursor, limit]);
            return result.rows.map(mapMeteorEvent);
        }
    };
}
