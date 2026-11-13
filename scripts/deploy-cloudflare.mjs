import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { cloudflareToken, cloudflareRequest } from './cloudflare-api.mjs';
import { deploymentConfig, validateSecrets, validateSecretNames } from '../cloudflare/deployment-config.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = JSON.parse(await fs.readFile(path.join(root,'wrangler.json'),'utf8'));
const config = deploymentConfig(base,process.env);
let secretFile;
if (process.env.CF_SECRETS_FILE) {
    secretFile = path.resolve(process.env.CF_SECRETS_FILE);
    let secrets;
    try { secrets = JSON.parse(await fs.readFile(secretFile,'utf8')); } catch { throw new Error('Unable to parse the private JSON secrets file'); }
    validateSecrets(secrets);
}
const token = cloudflareToken();
const apiBase = '/accounts/'+config.account_id;
if (!secretFile) {
    // 再配備では既存の暗号化secretを維持し、本番キーの再読取りや平文ファイルを不要にする。
    const registered = await cloudflareRequest(token, apiBase + '/workers/scripts/' + config.name + '/secrets');
    validateSecretNames(registered.map(secret => secret.name));
}
const drive = await cloudflareRequest(token,apiBase+'/hyperdrive/configs/'+config.hyperdrive[0].id);
if (drive.caching?.disabled !== true) throw new Error('Disable Hyperdrive query caching before deployment: sessions and job locks require fresh reads');
const queues = await cloudflareRequest(token,apiBase+'/queues?per_page=100');
for (const name of [config.queues.producers[0].queue,config.queues.consumers[0].dead_letter_queue]) if (!queues.some(item=>item.queue_name===name)) throw new Error('Create queue first: '+name);
if (config.routes?.length) {
    const zones = await cloudflareRequest(token,'/zones?name=githubplanet.dev&account.id='+config.account_id);
    if (!zones.some(zone=>zone.status==='active')) throw new Error('githubplanet.dev must be active in this Cloudflare account before cutover');
}
await fs.mkdir(path.join(root,'.cloudflare'),{recursive:true});
const configFile = path.join(root,'.cloudflare/deploy-wrangler.json');
await fs.writeFile(configFile,JSON.stringify(config,null,2));
console.log('PASS Cloudflare binding, queue, cache, secret-name and public URL preflight');
if (process.argv.includes('--preflight-only')) process.exit(0);
const child = spawn(process.execPath,[path.join(root,'node_modules/wrangler/bin/wrangler.js'),'deploy','--config',configFile,
    ...(secretFile ? ['--secrets-file',secretFile] : [])],{cwd:root,stdio:'inherit',windowsHide:true});
const code = await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
if (code !== 0) process.exit(code || 1);
console.log('Deployment completed. Keep Cloud Run available until OAuth, sender, webhook, history and cards are verified on the deployed origin.');
