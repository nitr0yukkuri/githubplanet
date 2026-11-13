import worker from '../../cloudflare/worker.js';
export { ApplicationGateway } from '../../cloudflare/worker.js';
import { BackgroundJobState } from '../../cloudflare/durable-objects.js';
export { MeteorHub, BackgroundJobState, RequestBudget, WebhookIngress } from '../../cloudflare/durable-objects.js';

export class ControlledJobState extends BackgroundJobState {
    constructor(context, env) {
        const control = { started: false };
        const pending = new Promise((resolve) => { control.release = resolve; });
        super(context, { ...env, BACKGROUND_JOBS: { send() { control.started = true; return pending; } } });
        this.control = control;
    }
    isPublishing() { return this.control.started; }
    releasePublication() { this.control.release(); }
}

export default {
    ...worker,
    async fetch(request, env, context) {
        if (new URL(request.url).pathname !== '/__test/publication-race') return worker.fetch(request, env, context);
        const job = { id: 'a'.repeat(64), hash: 'b'.repeat(64), type: 'meteor', input: { commitId: 'fixture', language: 'Ruby', scale: 1 } };
        const state = env.CONTROLLED_JOBS.getByName(crypto.randomUUID());
        const publication = state.enqueue(job);
        context.waitUntil(publication);
        while (!await state.isPublishing()) await new Promise(resolve => setTimeout(resolve, 5));
        const claim = await state.claim(job);
        await state.finish(claim.token);
        await state.releasePublication();
        await publication;
        const completed = await state.claim(job);
        return Response.json({ completed: completed.complete === true });
    }
};
