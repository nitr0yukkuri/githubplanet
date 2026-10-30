import { measureExternalOperation } from '../observability/external-performance.js';
import { safeErrorMetadata } from '../../shared/error-metadata.js';

const GEMINI_API_TIMEOUT_MS = 5_000;
const MODEL_LIST_CACHE_TTL_MS = 5 * 60 * 1_000;

export function createGeminiClient({
    axios,
    apiKey,
    onRequestTiming,
    modelListCacheTtlMs = MODEL_LIST_CACHE_TTL_MS
}) {
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
                    console.warn('[Gemini] モデル候補の生成失敗:', safeErrorMetadata(error));
                }
            }
        } catch (error) {
            console.error('[Gemini] 生成失敗:', safeErrorMetadata(error));
        }
        return null;
    }

    return { ask };
}
