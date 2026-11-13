export const REQUIRED_SECRETS = ['SESSION_SECRET','SYSTEM_API_KEY','GITHUB_WEBHOOK_SECRET','GITHUB_CLIENT_ID','GITHUB_CLIENT_SECRET','GEMINI_API_KEY'];
export function deploymentConfig(base, env) {
    const target = env.CF_TARGET || 'preview';
    if (!['preview','production'].includes(target)) throw new Error('CF_TARGET must be preview or production');
    for (const key of ['CF_ACCOUNT_ID','CF_HYPERDRIVE_ID']) if (!/^[a-f0-9]{32}$/.test(env[key] || '') || /^0+$/.test(env[key])) throw new Error(key+' must identify an existing resource');
    const url = new URL(env.CF_PUBLIC_BASE_URL);
    if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash || url.username || url.password) throw new Error('CF_PUBLIC_BASE_URL must be a public HTTPS origin');
    const config = structuredClone(base);
    if (env.CF_FREE_PREVIEW === 'true') {
        if (target !== 'preview') throw new Error('Free-profile testing is limited to the preview Worker');
        // 無料枠はCPU上限の指定自体を拒否する。公開切替とは分けて実際の制約を測る。
        delete config.limits;
    }
    // 本番もFreeのまま運用できるよう、対応外のCPU上限指定を明示的に外す。料金プランは変更しない。
    if (env.CF_FREE_PLAN === 'true') delete config.limits;
    config.name = target === 'production' ? 'githubplanet' : 'githubplanet-preview';
    // プレビューと切替前の本番ステージが、既存環境と定期保守を二重実行しないようにする。
    if (target === 'preview' || env.CF_CUTOVER_VERIFIED !== 'true') delete config.triggers;
    config.preview_urls = false;
    config.account_id = env.CF_ACCOUNT_ID;
    config.main = '../cloudflare/worker.js';
    config.assets.directory = './assets';
    config.alias['iconv-lite'] = './vendor/iconv-lite/lib/index.js';
    config.hyperdrive = [{binding:'POSTGRES',id:env.CF_HYPERDRIVE_ID}];
    config.vars = { ...config.vars, PUBLIC_BASE_URL:url.origin, CALLBACK_URL:url.origin+'/callback', PLANET_HISTORY_DISABLED_USERNAMES:env.PLANET_HISTORY_DISABLED_USERNAMES || '' };
    const queue = 'githubplanet-background-'+(target === 'production' ? 'production' : 'preview');
    config.queues.producers[0].queue = queue;
    config.queues.consumers[0].queue = queue;
    config.queues.consumers[0].dead_letter_queue = queue+'-dlq';
    // 最初の配備ではDNSを動かさず、動作確認済みの同じWorkerへ最後にドメインを付ける。
    if (env.CF_ATTACH_DOMAIN === 'true') {
        if (target !== 'production' || env.CF_CUTOVER_VERIFIED !== 'true' || url.hostname !== 'githubplanet.dev') throw new Error('Domain attachment requires verified production cutover');
        config.routes = [{ pattern:url.hostname, custom_domain:true }];
    }
    return config;
}
export function validateSecrets(secrets) {
    for (const name of REQUIRED_SECRETS) if (typeof secrets[name] !== 'string' || !secrets[name]) throw new Error('Missing secret: '+name);
    if (secrets.SESSION_SECRET === 'dev_secret') throw new Error('Development session secret is not allowed');
}
export function validateSecretNames(names) {
    for (const name of REQUIRED_SECRETS) if (!names.includes(name)) throw new Error('Missing registered secret: ' + name);
}
