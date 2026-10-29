export function createMeteorEventStore(pool) {
    return {
        async append(eventKey, payload) {
            // sequence採番の順とcommit順を揃え、遅いtransactionのイベントをcursorが追い越さないようにする。
            const result = await pool.query(`
                WITH publish_lock AS MATERIALIZED (SELECT pg_advisory_xact_lock(717330, 1))
                INSERT INTO meteor_events (event_key, payload)
                SELECT $1, $2::jsonb FROM publish_lock
                ON CONFLICT (event_key) DO NOTHING RETURNING id
            `, [eventKey, JSON.stringify(payload)]);
            return result.rows[0] ? String(result.rows[0].id) : null;
        },
        async latestId() {
            const result = await pool.query('SELECT COALESCE(MAX(id), 0)::text AS id FROM meteor_events');
            return result.rows[0].id;
        },
        async readAfter(cursor, limit = 100) {
            const result = await pool.query(`
                SELECT id, payload FROM meteor_events WHERE id > $1 ORDER BY id LIMIT $2
            `, [cursor, limit]);
            return result.rows.map((row) => ({ id: String(row.id), payload: row.payload }));
        },
        async cleanup() {
            await pool.query(`DELETE FROM meteor_events WHERE id IN (
                SELECT id FROM meteor_events WHERE created_at < NOW() - INTERVAL '1 day'
                ORDER BY created_at LIMIT 1000
            )`);
        }
    };
}
