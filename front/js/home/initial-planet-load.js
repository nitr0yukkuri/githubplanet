import { createHomeApi } from './api-client.js';

// Cloud Runの応答後に更新を放置せず、従来の/api/meリクエストの中で保存と実績記録まで完了させる。
export function startInitialPlanetLoad({ api = createHomeApi(), now = Date.now } = {}) {
    async function read(path, optional = false) {
        const response = await api.fetchApi(`${path}?t=${now()}`, { cache: 'no-store' });
        if (response.status === 401 || (optional && response.status === 404)) return null;
        if (!response.ok) throw new Error(`Planet data request failed (${response.status})`);
        const data = await response.json();
        if (!data.user || !data.planetData) throw new Error('Authenticated planet data is incomplete');
        return data;
    }

    // すぐに失敗しても3Dモジュール読込中の未処理rejectionにしない。
    const current = read('/api/me').then(
        data => ({ data, fromSaved: false }),
        error => ({ error, fromSaved: false })
    );
    const saved = read('/api/me/planet-preview', true).then(
        data => data ? { data, fromSaved: true } : current,
        () => current
    );
    const first = Promise.race([
        saved,
        current.then(result => result.error ? saved : result)
    ]);
    return { first, current };
}
