const limits = { publicPreviewCache:200, githubIdentityCache:500 };
export function createWorkerQueryCache() {
    const shared = Object.fromEntries(Object.keys(limits).map(name=>[name,new Map()]));
    return {
        begin() {
            const now=Date.now();
            // Workersは別リクエストのI/Oを再利用できないため、完了済みの値だけ引き継ぐ。
            const caches=Object.fromEntries(Object.entries(shared).map(([name,entries])=>[name,new Map([...entries].filter(([,entry])=>entry.expiresAt>now).map(([key,entry])=>[key,{...entry}]))]));
            return { caches, flush() {
                for (const [name,entries] of Object.entries(caches)) {
                    const target=shared[name];
                    for (const [key,entry] of entries) if (!entry.promise && entry.expiresAt>Date.now() && (!target.has(key) || target.get(key).expiresAt<=entry.expiresAt)) target.set(key,{value:entry.value,expiresAt:entry.expiresAt,promise:null});
                    for (const [key,entry] of target) if(entry.expiresAt<=Date.now()) target.delete(key);
                    while(target.size>limits[name]) target.delete(target.keys().next().value);
                }
            } };
        }
    };
}
