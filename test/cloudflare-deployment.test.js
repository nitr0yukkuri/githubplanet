import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { deploymentConfig, validateSecrets, validateSecretNames, REQUIRED_SECRETS } from '../cloudflare/deployment-config.js';
const base=JSON.parse(fs.readFileSync(new URL('../wrangler.json',import.meta.url),'utf8'));
const env={CF_ACCOUNT_ID:'a'.repeat(32),CF_HYPERDRIVE_ID:'b'.repeat(32),CF_PUBLIC_BASE_URL:'https://githubplanet-preview.example.workers.dev'};
test('deployment requires real bindings and a matching HTTPS callback, without switching DNS by default',()=>{
    assert.throws(()=>deploymentConfig(base,{...env,CF_HYPERDRIVE_ID:'0'.repeat(32)}));
    assert.throws(()=>deploymentConfig(base,{...env,CF_PUBLIC_BASE_URL:'http://localhost:3000'}));
    const preview=deploymentConfig(base,env);
    assert.equal(preview.vars.CALLBACK_URL,env.CF_PUBLIC_BASE_URL+'/callback'); assert.equal(preview.routes,undefined);
    assert.equal(preview.triggers, undefined);
    assert.equal(preview.preview_urls, false);
    assert.throws(()=>deploymentConfig(base,{...env,CF_ATTACH_DOMAIN:'true',CF_CUTOVER_VERIFIED:'true'}));
    const production=deploymentConfig(base,{...env,CF_TARGET:'production',CF_PUBLIC_BASE_URL:'https://githubplanet.dev',CF_ATTACH_DOMAIN:'true',CF_CUTOVER_VERIFIED:'true'});
    assert.equal(production.routes[0].pattern,'githubplanet.dev'); assert.notEqual(production.queues.producers[0].queue,preview.queues.producers[0].queue);
    assert.deepEqual(production.triggers.crons, ['0 * * * *']);
});
test('all required secret names must be provided without accepting development sessions',()=>{
    assert.throws(()=>validateSecrets({})); const secrets=Object.fromEntries(REQUIRED_SECRETS.map(name=>[name,'test-only']));
    validateSecrets(secrets); assert.throws(()=>validateSecrets({...secrets,SESSION_SECRET:'dev_secret'}));
});

test('updates reuse registered secret names and reject an incomplete existing Worker', () => {
    validateSecretNames(REQUIRED_SECRETS);
    assert.throws(() => validateSecretNames(REQUIRED_SECRETS.slice(1)), /SESSION_SECRET/);
});

test('the free CPU profile is explicit and cannot be used for production cutover', () => {
    const preview = deploymentConfig(base, { ...env, CF_FREE_PREVIEW: 'true' });
    assert.equal(preview.limits, undefined);
    assert.equal(preview.routes, undefined);
    assert.throws(() => deploymentConfig(base, { ...env, CF_TARGET: 'production', CF_FREE_PREVIEW: 'true' }));
    assert.equal(deploymentConfig(base, env).limits.cpu_ms, 30000);
});

test('verified production can use the Free plan without changing domain safeguards', () => {
    const production = deploymentConfig(base, { ...env, CF_TARGET: 'production', CF_FREE_PLAN: 'true', CF_PUBLIC_BASE_URL: 'https://githubplanet.dev' });
    assert.equal(production.limits, undefined);
    assert.equal(production.routes, undefined);
    assert.equal(production.triggers, undefined);
    assert.throws(() => deploymentConfig(base, { ...env, CF_TARGET: 'production', CF_FREE_PLAN: 'true', CF_ATTACH_DOMAIN: 'true', CF_PUBLIC_BASE_URL: 'https://githubplanet.dev' }));
});
