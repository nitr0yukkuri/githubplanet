import { LANGUAGE_COLORS } from '../domain/planet/constants.js';
import { safeErrorMetadata } from '../shared/error-metadata.js';

const DEFAULT_LANGUAGE_COLOR = '#808080';

// 色の選択と保存順序はプロダクトの判断なので、生成APIとDBを狭いportで組み合わせる。
export function createLanguageColorService({
    ask,
    languageColors = LANGUAGE_COLORS,
    languageColorCache = {},
    languageColorStore
}) {
    const dynamicColorCache = {};
    const dynamicColorPromises = new Map();

    async function resolveLanguageColor(language) {
        if (!language || language === 'Unknown') return DEFAULT_LANGUAGE_COLOR;
        if (languageColors[language]) return languageColors[language];
        if (/^#[0-9a-fA-F]{6}$/.test(languageColorCache[language] || '')) {
            dynamicColorCache[language] = languageColorCache[language];
            return languageColorCache[language];
        }
        if (dynamicColorCache[language]) return dynamicColorCache[language];

        if (dynamicColorPromises.has(language)) {
            return dynamicColorPromises.get(language);
        }

        const colorPromise = (async () => {
            if (languageColorStore?.findLanguageColor) {
                try {
                    const persistedColor = await languageColorStore.findLanguageColor(language);
                    if (/^#[0-9a-fA-F]{6}$/.test(persistedColor || '')) {
                        dynamicColorCache[language] = persistedColor;
                        return persistedColor;
                    }
                } catch (error) {
                    // キャッシュ表の障害で惑星生成全体を止めず、従来どおりGeminiへ進む。
                    console.warn('[DB] 言語色キャッシュの読取をスキップ:', safeErrorMetadata(error));
                }
            }

            console.log(`[Color AI] 未知の言語 "${language}" の色を生成します...`);
            const text = await ask(`Programming language: ${language}. Provide a suitable hex color code (e.g., #ff0000) for this language. Return ONLY the hex code string.`);
            const match = text?.match(/#[0-9a-fA-F]{6}/);
            if (!match) return DEFAULT_LANGUAGE_COLOR;

            let resolvedColor = match[0];
            if (languageColorStore?.saveLanguageColor) {
                try {
                    const persistedColor = await languageColorStore.saveLanguageColor(language, resolvedColor);
                    if (/^#[0-9a-fA-F]{6}$/.test(persistedColor || '')) {
                        resolvedColor = persistedColor;
                    }
                } catch (error) {
                    // 保存だけ失敗しても今回の生成結果はそのまま利用する。
                    console.warn('[DB] 言語色キャッシュの保存をスキップ:', safeErrorMetadata(error));
                }
            }

            dynamicColorCache[language] = resolvedColor;
            console.log(`[Color AI] 生成完了: ${language} -> ${resolvedColor}`);
            return resolvedColor;
        })();

        dynamicColorPromises.set(language, colorPromise);
        try {
            return await colorPromise;
        } finally {
            dynamicColorPromises.delete(language);
        }
    }

    return { resolveLanguageColor };
}
