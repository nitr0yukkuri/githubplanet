import { createPlanetLanguageHistory } from '../planet-language-history.js';

// ページの惑星切替より遅い応答が、別の惑星へ履歴を表示しないよう世代を管理する。
export function createLanguageHistoryController({
    fetchApi,
    getCurrentPlanet,
    getLoggedInUsername,
    isPublicPlanetRoute,
    onSelect,
    translate,
    getElement = () => document.getElementById('planet-language-history'),
    createView = createPlanetLanguageHistory
}) {
    let view = null;
    let requestGeneration = 0;

    async function update(data) {
        const requestId = ++requestGeneration;
        const element = getElement();
        if (!element) return;
        if (!view) {
            view = createView({
                element,
                translate,
                onSelect
            });
        }

        const loggedInUsername = getLoggedInUsername();
        const isOwnPlanet = Boolean(
            loggedInUsername
            && data?.username
            && loggedInUsername.toLowerCase() === data.username.toLowerCase()
        );
        if (!isOwnPlanet || isPublicPlanetRoute()) {
            view.hide();
            return;
        }

        try {
            const response = await fetchApi('/api/me/language-history', { cache: 'no-store' });
            if (requestId !== requestGeneration) return;
            if (!response.ok) {
                view.hide();
                return;
            }
            const payload = await response.json();
            if (requestId !== requestGeneration || getCurrentPlanet() !== data) return;
            view.show(payload.history, data);
        } catch {
            // 履歴が取得できない時も現在の惑星表示を維持する。
            if (requestId === requestGeneration) view.hide();
        }
    }

    return { update };
}
