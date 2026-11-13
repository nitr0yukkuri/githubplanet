import test from 'node:test';
import assert from 'node:assert/strict';
import { createJobDispatch, consumeJobs } from '../cloudflare/jobs.js';
const id = 'a'.repeat(64), hash = 'b'.repeat(64);
test('queue publication failures are returned to the webhook caller, with stable retry identifiers', async () => {
    const jobs = []; let fail = true;
    const env = { JOB_STATE: { getByName(key) { return { async enqueue(job) { assert.equal(key,job.id); jobs.push(job); if(fail) throw new Error('Queue unavailable'); } }; } } };
    const enqueue = createJobDispatch(env).enqueueWebhook;
    const input = { repository: { language: 'Ruby' }, commits: [{ id:'commit', added:['a.rb'] }] };
    await assert.rejects(enqueue(input,{deliveryId:'delivery',payloadHash:hash}));
    fail=false; await enqueue(input,{deliveryId:'different-delivery',payloadHash:hash});
    assert.equal(jobs[0].id,jobs[1].id); assert.deepEqual(Object.keys(jobs[1].inputs[0]).sort(), ['commitId','language','scale']);
});
test('consumer releases its lease and retries a failed broadcast, then acknowledges a completed retry', async () => {
    let released=0, finished=0, ack=0, retry=0, ended=0;
    const state={async claim(){return {token:'lease'};},async release(token){assert.equal(token,'lease');released++;},async finish(){finished++;}};
    const env={JOB_STATE:{getByName(){return state;}}};
    const message={body:{id,hash,type:'meteor',input:{commitId:'commit',language:'Ruby',scale:1}},ack(){ack++;},retry(){retry++;}};
    const pending=[]; const context={waitUntil(p){pending.push(p);}};
    const runtime=(fail)=>()=>({pool:{async end(){ended++;}},meteorService:{async emitWebhookMeteor(){if(fail)throw new Error('Hub unavailable');}}});
    await consumeJobs({messages:[message]},env,context,runtime(true));
    assert.equal(released,1); assert.equal(retry,1); assert.equal(ack,0);
    await consumeJobs({messages:[message]},env,context,runtime(false)); await Promise.all(pending);
    assert.equal(finished,1); assert.equal(ack,1); assert.equal(ended,2);
});
test('malformed queue data never invokes the application', async () => {
    let retried=0; await consumeJobs({messages:[{body:{id,hash,type:'meteor',input:{commitId:'x',language:'Ruby',scale:100}},retry(){retried++;}}]}, {}, {}, () => {throw new Error('must not run');});
    assert.equal(retried,1);
});

test('a failed history scan observes the GitHub cooldown before consuming another retry', async()=>{
    let retryDelay, released=0;
    const state={async claim(){return {token:'lease'};},async release(){released++;}};
    const env={JOB_STATE:{getByName(){return state;}}};
    const pool={async query(sql){
        if(sql.includes('SELECT sess'))return {rows:[{sess:{planetData:{user:{id:123,login:'tester',created_at:'2020-01-01'}},github_token:'local-fixture-token'}}]};
        return {rows:[{scan_status:'failed',retry_after:new Date(Date.now()+3600_000)}]};
    },async end(){}};
    const message={body:{id,hash,type:'history',githubId:'123'},ack(){throw new Error('must retry');},retry({delaySeconds}){retryDelay=delaySeconds;}};
    await consumeJobs({messages:[message]},env,{waitUntil(){}},()=>({pool,authoredLanguageHistoryService:{async startScan(){}}}));
    assert.equal(released,1);assert.ok(retryDelay>=3598&&retryDelay<=3600);
});
