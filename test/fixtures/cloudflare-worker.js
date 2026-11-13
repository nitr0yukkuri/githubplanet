import { createWorker, createRuntime, ApplicationGateway as WorkerApplicationGateway } from '../../cloudflare/worker.js';
export { MeteorHub, BackgroundJobState, RequestBudget, WebhookIngress } from '../../cloudflare/durable-objects.js';
const user = { id: 90000001001, login: 'cloudflaretester', created_at: '2026-01-01T00:00:00Z' };
const fixtureHttp = {
    async post(url) {
        if (url.endsWith('/login/oauth/access_token')) return { data: { access_token: 'fixture-github-access-token' } };
        if (url.endsWith('/graphql')) return { data: { data: { user: { contributionsCollection: { commitContributionsByRepository: [] } } } }, headers: {} };
        throw new Error('Unexpected fixture POST');
    },
    async get(url) {
        if (url.includes('/repos')) return { data: [], headers: {}, status: 200 };
        if (url.endsWith('/user') || url.includes('/users/cloudflaretester') || url.includes('/user/90000001001')) return { data: user, headers: {}, status: 200 };
        throw new Error('Unexpected fixture GET');
    }
};
const fixtureRuntime = (env, context, eventId) => createRuntime(env, context, eventId, { httpClient: fixtureHttp });
export class ApplicationGateway extends WorkerApplicationGateway {
    createRuntime(...args) { return fixtureRuntime(...args); }
}
const worker = createWorker({ runtimeFactory: fixtureRuntime });
export default { ...worker, async fetch(request, env, context) {
    if (new URL(request.url).pathname === '/_test/prune-sessions') {
        await worker.scheduled({}, env, context); return new Response('OK');
    }
    return worker.fetch(request, env, context);
} };
