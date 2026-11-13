import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { JSONParser } from '@streamparser/json';
import { buildWebhookMeteor, webhookFileLanguage } from '../src/domain/meteor/webhook-meteors.js';
import { EXTENSION_MAP } from '../src/domain/planet/language-extensions.js';

const MAX_BYTES = 50 * 1024 * 1024;
const respond = (body, status) => new Response(body, { status, headers: { 'Cache-Control': 'no-store' } });
export function rejectWebhookHeaders(request, env) {
    if (request.method !== 'POST') return respond('Method not allowed', 405);
    if (!env.GITHUB_WEBHOOK_SECRET) return respond('Webhook secret is not configured', 503);
    const deliveryId = request.headers.get('X-GitHub-Delivery') || '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deliveryId)) return respond('Invalid delivery ID', 400);
    const signature = request.headers.get('X-Hub-Signature-256') || '';
    if (!/^sha256=[a-f0-9]{64}$/.test(signature)) return respond('Invalid signature', 401);
    if (!new RegExp('^application/json(?:;|$)', 'i').test(request.headers.get('Content-Type') || '') || !['', 'identity'].includes(request.headers.get('Content-Encoding') || '')) return respond('JSON body required', 415);
    if (Number(request.headers.get('Content-Length')) > MAX_BYTES) return respond('Payload too large', 413);
    return null;
}
export async function receiveWebhook(request, env, dispatch) {
    const rejection = rejectWebhookHeaders(request, env);
    if (rejection) return rejection;
    const deliveryId = request.headers.get('X-GitHub-Delivery');
    const signature = request.headers.get('X-Hub-Signature-256');
    const hmac = createHmac('sha256', env.GITHUB_WEBHOOK_SECRET), hash = createHash('sha256');
    const commits = new Map();
    let repositoryLanguage, bytes = 0;
    // 50MBの本文・文字列・解析結果を同時保持すると128MBを越えるため、必要な葉だけ残す。
    const parser = new JSONParser({ paths: ['$.repository.language', '$.commits.*.id', '$.commits.*.total_lines', '$.commits.*.added.*', '$.commits.*.modified.*'], keepStack: false, stringBufferSize: 65536 });
    parser.onValue = ({ value, key, stack }) => {
        if (stack[1]?.key === 'repository') { repositoryLanguage = value; return; }
        if (stack[1]?.key !== 'commits' || !Number.isInteger(stack[2]?.key)) return;
        const index = stack[2].key;
        if (index >= 2048) throw new Error('Commit limit exceeded');
        const commit = commits.get(index) || { fileCount: 0 };
        commits.set(index, commit);
        if (key === 'id') commit.commitId = value;
        else if (key === 'total_lines') commit.totalLines = value;
        else if (typeof value === 'string') {
            commit.fileCount += 1;
            const kind = stack[3]?.key;
            if (!commit[kind]) commit[kind] = webhookFileLanguage(value, EXTENSION_MAP);
        }
    };
    const reader = request.body?.getReader();
    if (!reader) return respond('JSON body required', 400);
    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
            if (bytes > MAX_BYTES) { await reader.cancel(); return respond('Payload too large', 413); }
            hmac.update(value); hash.update(value); parser.write(value);
        }
        if (!parser.isEnded) parser.end();
    } catch { await reader.cancel().catch(() => undefined); return respond('Invalid JSON payload', 400); }
    const expected = Buffer.from('sha256=' + hmac.digest('hex'));
    if (!timingSafeEqual(Buffer.from(signature), expected)) return respond('Invalid signature', 401);
    const inputs = [...commits].sort(([a], [b]) => a - b).flatMap(([, commit]) => {
        const input = buildWebhookMeteor({ ...commit, repositoryLanguage, fileLanguage: commit.added || commit.modified });
        return input ? [input] : [];
    });
    try {
        await dispatch.enqueueWebhookInputs(inputs, { deliveryId, payloadHash: hash.digest('hex') });
        return respond('OK', 200);
    } catch (error) {
        console.error('[Cloudflare Webhook]', { name: error.name });
        return respond('Webhook delivery could not be recorded', 503);
    }
}
