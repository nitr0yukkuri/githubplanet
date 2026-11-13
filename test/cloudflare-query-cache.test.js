import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkerQueryCache } from '../cloudflare/query-cache.js';
test('retains completed public values while excluding in-flight work and stale concurrent flushes',()=>{
    const cache=createWorkerQueryCache(), first=cache.begin(), second=cache.begin();
    first.caches.githubIdentityCache.set('id',{value:{login:'old'},expiresAt:Date.now()+1000,promise:null});
    first.caches.publicPreviewCache.set('pending',{promise:Promise.resolve('private I/O'),expiresAt:Date.now()+5000});
    second.caches.githubIdentityCache.set('id',{value:{login:'new'},expiresAt:Date.now()+5000,promise:null});
    second.flush();first.flush();
    const next=cache.begin();assert.equal(next.caches.githubIdentityCache.get('id').value.login,'new');assert.equal(next.caches.publicPreviewCache.size,0);
    for(let index=0;index<300;index++)next.caches.publicPreviewCache.set(index,{value:index,expiresAt:Date.now()+5000,promise:null});
    next.flush();assert.equal(cache.begin().caches.publicPreviewCache.size,200);
});
