import { DurableObject } from 'cloudflare:workers';
import { JOB_LEASE_SECONDS } from './job-policy.js';
import { checkRequestBudget } from './request-budget.js';
import { pruneMeteorEvents } from './meteor-retention.js';
import { receiveWebhook } from './webhook.js';
import { createJobDispatch } from './jobs.js';

const DAY = 86_400_000;
export class MeteorHub extends DurableObject {
    async fetch(request) {
        if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('WebSocket required', { status: 426 });
        if (this.ctx.getWebSockets().length >= 1000) return new Response('Connection limit reached', { status: 503 });
        const pair = new WebSocketPair();
        this.ctx.acceptWebSocket(pair[1]);
        // ブラウザーの生存確認でObjectを起こさず、待機中の課金を抑える。
        this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
        return new Response(null, { status: 101, webSocket: pair[0] });
    }
    async publish(id, payload) {
        return this.ctx.blockConcurrencyWhile(async () => {
            const key = 'event:' + id;
            const previous = await this.ctx.storage.get(key);
            if (previous?.complete) return false;
            const event = { type: 'meteor', id, payload };
            await this.ctx.storage.put(key, { at: Date.now(), complete: false });
            for (const socket of this.ctx.getWebSockets()) {
                try { socket.send(JSON.stringify(event)); } catch { try { socket.close(1011, 'Delivery failed'); } catch {} }
            }
            // 再試行の重複は配信IDでブラウザー側でも除外する。
            await this.ctx.storage.put(key, { at: Date.now(), complete: true });
            if (await this.ctx.storage.getAlarm() === null) await this.ctx.storage.setAlarm(Date.now() + DAY);
            return true;
        });
    }
    webSocketMessage(socket, message) { if (message !== 'ping') socket.close(1008, 'Unsupported message'); }
    webSocketClose(socket, code) { socket.close(1000, 'Peer closed'); }
    webSocketError(socket) { socket.close(1011, 'Connection failed'); }
    async alarm() {
        return this.ctx.blockConcurrencyWhile(() => pruneMeteorEvents(this.ctx.storage));
    }
}

export class BackgroundJobState extends DurableObject {
    async enqueue(job) {
        const publicationToken = await this.ctx.blockConcurrencyWhile(async () => {
            const current = await this.ctx.storage.get('job');
            if (current && current.hash !== job.hash) throw new Error('Delivery payload changed');
            if (current && ['enqueued', 'running', 'complete'].includes(current.status)) return null;
            const token = crypto.randomUUID();
            await this.ctx.storage.put('job', { hash: job.hash, status: 'pending', publicationToken: token });
            return token;
        });
        if (!publicationToken) return false;
        await this.#publish(job, publicationToken);
        return true;
    }
    async #publish(job, publicationToken, options) {
        // 外部I/Oを30秒の排他区間に含めると、Queue遅延だけでObject全体がresetされる。
        await this.env.BACKGROUND_JOBS.send(job, options);
        await this.ctx.blockConcurrencyWhile(async () => {
            const current = await this.ctx.storage.get('job');
            // 先に実行されたconsumerのrunning/completeを、遅いpublisherで上書きしない。
            if (current?.status === 'pending' && current.publicationToken === publicationToken) {
                await this.ctx.storage.put('job', { hash: job.hash, status: 'enqueued' });
            }
        });
    }
    async claim(job) {
        return this.ctx.blockConcurrencyWhile(async () => {
            const current = await this.ctx.storage.get('job');
            if (current && current.hash !== job.hash) throw new Error('Delivery payload changed');
            if (current?.status === 'complete') return { complete: true };
            if (current?.leaseUntil > Date.now()) {
                return { busy: true, retryAfterSeconds: Math.ceil((current.leaseUntil - Date.now()) / 1000) };
            }
            const token = crypto.randomUUID();
            await this.ctx.storage.put('job', { hash: job.hash, status: 'running', token, leaseUntil: Date.now() + JOB_LEASE_SECONDS * 1000 });
            return { token };
        });
    }
    async finish(token) {
        return this.ctx.blockConcurrencyWhile(async () => {
            const current = await this.ctx.storage.get('job');
            if (current?.token !== token) throw new Error('Job lease changed');
            await this.ctx.storage.put('job', { hash: current.hash, status: 'complete' });
            await this.ctx.storage.setAlarm(Date.now() + 30 * DAY);
        });
    }
    async release(token) {
        return this.ctx.blockConcurrencyWhile(async () => {
            const current = await this.ctx.storage.get('job');
            if (current?.token === token) await this.ctx.storage.put('job', { hash: current.hash, status: 'enqueued' });
        });
    }
    async reschedule(job, token, delaySeconds) {
        const publicationToken = await this.ctx.blockConcurrencyWhile(async () => {
            const current = await this.ctx.storage.get('job');
            if (current?.token !== token) throw new Error('Job lease changed');
            const nextToken = crypto.randomUUID();
            await this.ctx.storage.put('job', { hash: job.hash, status: 'pending', publicationToken: nextToken });
            return nextToken;
        });
        await this.#publish(job, publicationToken, { delaySeconds });
    }
    async alarm() { if ((await this.ctx.storage.get('job'))?.status === 'complete') await this.ctx.storage.deleteAll(); }
}

export class RequestBudget extends DurableObject {
    async check(windowMs, limit) {
        return this.ctx.blockConcurrencyWhile(() => checkRequestBudget(this.ctx.storage, windowMs, limit));
    }
    async alarm() {
        const value = await this.ctx.storage.get('budget');
        if (value?.reset > Date.now()) await this.ctx.storage.setAlarm(value.reset);
        else await this.ctx.storage.deleteAll();
    }
}

export class WebhookIngress extends DurableObject {
    fetch(request) {
        // 大きい本文の署名計算・JSON解析を、HTTP Workerの無料CPU 10ms枠へ載せない。
        return receiveWebhook(request, this.env, createJobDispatch(this.env));
    }
}
