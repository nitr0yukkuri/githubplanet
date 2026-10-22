import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlanetRepository } from '../src/infrastructure/database/planet-repository.js';

test('claims a GitHub webhook delivery once and periodically removes expired IDs', async () => {
    const claimed = new Set();
    const queries = [];
    const pool = {
        async query(sql, parameters = []) {
            queries.push(sql);
            if (sql.includes('INSERT INTO github_webhook_deliveries')) {
                const [deliveryId, payloadHash] = parameters;
                if (claimed.has(deliveryId) || claimed.has(payloadHash)) return { rowCount: 0, rows: [] };
                claimed.add(deliveryId);
                claimed.add(payloadHash);
                return { rowCount: 1, rows: [{ delivery_id: deliveryId }] };
            }
            return { rowCount: 0, rows: [] };
        }
    };
    const repository = createPlanetRepository(pool, { randomQueryStrategy: 'legacy' });
    const firstId = '123e4567-e89b-12d3-a456-426614174000';
    const secondId = '123e4567-e89b-12d3-a456-426614174001';
    const firstPayloadHash = 'a'.repeat(64);
    const secondPayloadHash = 'b'.repeat(64);

    assert.equal(await repository.claimGithubWebhookDelivery(firstId, firstPayloadHash), true);
    assert.equal(await repository.claimGithubWebhookDelivery(firstId, firstPayloadHash), false);
    assert.equal(await repository.claimGithubWebhookDelivery(secondId, firstPayloadHash), false);
    assert.equal(await repository.claimGithubWebhookDelivery(secondId, secondPayloadHash), true);
    assert.equal(queries.filter((sql) => sql.includes('DELETE FROM github_webhook_deliveries')).length, 1);
});

test('rejects invalid GitHub webhook delivery IDs before querying the database', async () => {
    let queryCount = 0;
    const repository = createPlanetRepository({
        async query() {
            queryCount += 1;
            return { rowCount: 0, rows: [] };
        }
    }, { randomQueryStrategy: 'legacy' });

    await assert.rejects(
        repository.claimGithubWebhookDelivery('../not-a-uuid', 'a'.repeat(64)),
        /Invalid GitHub webhook delivery ID/
    );
    assert.equal(queryCount, 0);
});
