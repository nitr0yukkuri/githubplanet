import { createHash } from 'node:crypto';
import { buildWebhookMeteors } from '../src/domain/meteor/webhook-meteors.js';
import { EXTENSION_MAP } from '../src/domain/planet/language-extensions.js';
import { createAuthoredLanguageHistoryRepository } from '../src/infrastructure/database/authored-language-history-repository.js';
import { readScanIdentity } from './database.js';
import { retryAfterLease } from './job-policy.js';

export function validJob(job) {
    if (!/^[a-f0-9]{64}$/.test(job.hash || '')) return false;
    if (job.type === 'history') return /^[1-9][0-9]{0,19}$/.test(job.githubId || '');
    if (job.type === 'meteor') return validMeteor(job.input);
    return job.type === 'meteor-batch' && Array.isArray(job.inputs) && job.inputs.length > 0
        && job.inputs.length <= 32 && job.inputs.every(validMeteor)
        && Buffer.byteLength(JSON.stringify(job.inputs), 'utf8') <= 96 * 1024;
}

function validMeteor(input) {
    return typeof input?.commitId === 'string' && input.commitId.length > 0 && input.commitId.length <= 256
        && typeof input.language === 'string' && input.language.length > 0 && input.language.length <= 256
        && Number.isFinite(input.scale) && input.scale > 0 && input.scale <= 2;
}

const digest = (value) => createHash('sha256').update(value).digest('hex');
export function jobState(env, id) { return env.JOB_STATE.getByName(id); }
export function createJobDispatch(env) {
    async function enqueueWebhookInputs(inputs, { payloadHash }) {
        let batch = [], bytes = 2, offset = 0;
        async function flush() {
            if (!batch.length) return;
            const id = digest('webhook-batch:' + payloadHash + ':' + offset);
            await jobState(env, id).enqueue({ id, hash: payloadHash, type: 'meteor-batch', inputs: batch });
            offset += batch.length;
            batch = []; bytes = 2;
        }
        // 大量pushでもコミット数分の直列RPCを行わず、GitHubへのACKを遅らせない。
        for (const input of inputs) {
            if (!validMeteor(input)) throw new Error('Invalid webhook meteor');
            const size = Buffer.byteLength(JSON.stringify(input), 'utf8') + 1;
            if (batch.length >= 32 || bytes + size > 96 * 1024) await flush();
            batch.push(input); bytes += size;
        }
        await flush();
    }
    return {
        async enqueueWebhook(payload, metadata) {
            return enqueueWebhookInputs(buildWebhookMeteors(payload, EXTENSION_MAP), metadata);
        },
        enqueueWebhookInputs,
        async enqueueHistoryScan({ githubId }) {
            const id = digest('scan:' + githubId + ':' + Math.floor(Date.now() / 300_000));
            return jobState(env, id).enqueue({ id, hash: id, type: 'history', githubId: String(githubId) });
        }
    };
}

export async function consumeJobs(batch, env, context, createRuntime) {
    for (const message of batch.messages) {
        const job = message.body;
        if (!job || !/^[a-f0-9]{64}$/.test(job.id || '') || !validJob(job)) {
            // 不正メッセージを成功扱いにせず、規定回数の後でDLQへ送る。
            message.retry(); continue;
        }
        const state = jobState(env, job.id);
        let token;
        let runtime;
        let retryDelay = 60;
        try {
            const claim = await state.claim(job);
            if (claim.complete) { message.ack(); continue; }
            if (claim.busy) {
                // 強制終了後のleaseが残る間に、最大再試行回数を使い切らないようにする。
                message.retry({ delaySeconds: retryAfterLease(claim.retryAfterSeconds) });
                continue;
            }
            token = claim.token;
            runtime = createRuntime(env, context, job.id);
            if (job.type === 'meteor-batch') {
                for (let index = 0; index < job.inputs.length; index += 1) {
                    await runtime.meteorService.emitWebhookMeteor(job.inputs[index], {
                        idempotencyKey: job.id + ':' + index
                    });
                }
            } else if (job.type === 'meteor') {
                await runtime.meteorService.emitWebhookMeteor(job.input);
            } else {
                // HTTP/session処理を通らないQueueでは、遅延生成のPoolをここで初期化する。
                const pool = runtime.ensurePool();
                const identity = await readScanIdentity(pool, job.githubId);
                if (identity) {
                    await runtime.authoredLanguageHistoryService.startScan(identity);
                    const scan = await createAuthoredLanguageHistoryRepository(pool).getAuthoredLanguageHistoryScan(job.githubId);
                    if (scan?.scanStatus === 'failed') {
                        const retryAt = new Date(scan.retryAfter).getTime();
                        retryDelay = Number.isFinite(retryAt) ? Math.min(43_200, Math.max(60, Math.ceil((retryAt - Date.now()) / 1000))) : 300;
                        throw new Error('History scan needs retry');
                    }
                    if (scan && ['partial', 'running'].includes(scan.scanStatus)) {
                        const retryTime = new Date(scan.retryAfter).getTime();
                        const delay = scan.scanStatus === 'running' || !Number.isFinite(retryTime) ? 300 : Math.min(43_200, Math.max(1, Math.ceil((retryTime - Date.now()) / 1000)));
                        await state.reschedule(job, token, delay);
                        message.ack(); continue;
                    }
                }
            }
            await state.finish(token);
            message.ack();
        } catch (error) {
            console.error('[Cloudflare Job]', { type: job.type, name: error.name });
            if (token) await state.release(token).catch(() => undefined);
            message.retry({ delaySeconds: retryDelay });
        } finally {
            runtime?.flushCaches?.();
            if (runtime?.pool) context.waitUntil(runtime.pool.end());
        }
    }
}
