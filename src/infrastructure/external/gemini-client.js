import { measureExternalOperation } from '../observability/external-performance.js';

const GEMINI_API_TIMEOUT_MS = 5_000;
const DEFAULT_LANGUAGE_COLOR = '#808080';
const MODEL_LIST_CACHE_TTL_MS = 5 * 60 * 1_000;

export function createGeminiClient({
    axios,
    apiKey,
    languageColors,
    languageColorCache = {},
    repository,
    onRequestTiming,
    modelListCacheTtlMs = MODEL_LIST_CACHE_TTL_MS
}) {
    const dynamicColorCache = {};
    const dynamicColorPromises = new Map();
    let generationModels = null;
    let generationModelsExpiresAt = 0;
    let modelListPromise = null;

    async function getGenerationModels(cleanApiKey) {
        if (generationModels && Date.now() < generationModelsExpiresAt) {
            return generationModels;
        }
        if (modelListPromise) return modelListPromise;

        // モデル一覧はリクエストごとに変わらないため、毎回の外部API往復を避ける。
        modelListPromise = measureExternalOperation(onRequestTiming, 'list_models', () => {
            const listModelsUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${cleanApiKey}`;
            return axios.get(listModelsUrl, {
                timeout: GEMINI_API_TIMEOUT_MS
            });
        }, { provider: 'gemini' })
            .then((listResponse) => (listResponse.data.models || [])
                .filter((model) => model.supportedGenerationMethods?.includes('generateContent'))
                .sort((a, b) => {
                    if (a.name.includes('1.5-flash') && !b.name.includes('1.5-flash')) return -1;
                    if (!a.name.includes('1.5-flash') && b.name.includes('1.5-flash')) return 1;
                    return 0;
                }))
            .then((models) => {
                generationModels = models;
                generationModelsExpiresAt = Date.now() + modelListCacheTtlMs;
                return models;
            })
            .finally(() => {
                modelListPromise = null;
            });

        return modelListPromise;
    }

    async function ask(prompt) {
        if (!apiKey) return null;
        const cleanApiKey = apiKey.trim();

        try {
            const models = await getGenerationModels(cleanApiKey);

            for (const model of models) {
                const modelId = model.name.split('/').pop();
                try {
                    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${cleanApiKey}`;
                    const response = await measureExternalOperation(onRequestTiming, 'generate_content', () => axios.post(url, {
                        contents: [{ parts: [{ text: prompt }] }]
                    }, {
                        headers: { 'Content-Type': 'application/json' },
                        timeout: GEMINI_API_TIMEOUT_MS
                    }), { provider: 'gemini', modelId });
                    const text = response.data.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (text) return text.trim();
                } catch (error) {
                    console.warn(`[Gemini] スキップ (${modelId}): ${error.message}`);
                }
            }
        } catch (error) {
            console.error('[Gemini] 生成失敗:', error.message);
        }
        return null;
    }

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
            if (repository?.findLanguageColor) {
                try {
                    const persistedColor = await repository.findLanguageColor(language);
                    if (/^#[0-9a-fA-F]{6}$/.test(persistedColor || '')) {
                        dynamicColorCache[language] = persistedColor;
                        return persistedColor;
                    }
                } catch (error) {
                    // キャッシュ表の障害で惑星生成全体を止めず、従来どおりGeminiへ進む。
                    console.warn(`[DB] 言語色キャッシュの読取をスキップ: ${error.message}`);
                }
            }

            console.log(`[Color AI] 未知の言語 "${language}" の色を生成します...`);
            const text = await ask(`Programming language: ${language}. Provide a suitable hex color code (e.g., #ff0000) for this language. Return ONLY the hex code string.`);
            const match = text?.match(/#[0-9a-fA-F]{6}/);
            if (!match) return DEFAULT_LANGUAGE_COLOR;

            let resolvedColor = match[0];
            if (repository?.saveLanguageColor) {
                try {
                    const persistedColor = await repository.saveLanguageColor(language, resolvedColor);
                    if (/^#[0-9a-fA-F]{6}$/.test(persistedColor || '')) {
                        resolvedColor = persistedColor;
                    }
                } catch (error) {
                    // 保存だけ失敗しても今回の生成結果はそのまま利用する。
                    console.warn(`[DB] 言語色キャッシュの保存をスキップ: ${error.message}`);
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

    return { ask, resolveLanguageColor };
}
