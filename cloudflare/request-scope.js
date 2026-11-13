import { AsyncLocalStorage } from 'node:async_hooks';

export function createRequestScope() {
    const storage = new AsyncLocalStorage();
    const current = () => {
        const value = storage.getStore();
        if (!value) throw new Error('Request scope is unavailable');
        return value;
    };
    const service = (name) => new Proxy({}, {
        get(_target, method) {
            return (...args) => current().services[name][method](...args);
        }
    });
    // HTTPのルートだけ再利用し、DB・処理中Promise・認証データは要求の文脈から解決する。
    const pool = {
        query(...args) { return current().ensurePool().query(...args); },
        connect(...args) { return current().ensurePool().connect(...args); }
    };
    return { current, service, pool, run: (value, operation) => storage.run(value, operation) };
}
