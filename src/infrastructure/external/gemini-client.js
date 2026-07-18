export function createGeminiClient({ axios, apiKey, languageColors }) {
    const dynamicColorCache = {};

    async function ask(prompt) {
        if (!apiKey) return null;
        const cleanApiKey = apiKey.trim();

        try {
            const listModelsUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${cleanApiKey}`;
            const listResponse = await axios.get(listModelsUrl);
            const models = (listResponse.data.models || [])
                .filter((model) => model.supportedGenerationMethods?.includes('generateContent'))
                .sort((a, b) => {
                    if (a.name.includes('1.5-flash') && !b.name.includes('1.5-flash')) return -1;
                    if (!a.name.includes('1.5-flash') && b.name.includes('1.5-flash')) return 1;
                    return 0;
                });

            for (const model of models) {
                const modelId = model.name.split('/').pop();
                try {
                    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${cleanApiKey}`;
                    const response = await axios.post(url, { contents: [{ parts: [{ text: prompt }] }] }, {
                        headers: { 'Content-Type': 'application/json' }
                    });
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
        if (!language || language === 'Unknown') return '#808080';
        if (languageColors[language]) return languageColors[language];
        if (dynamicColorCache[language]) return dynamicColorCache[language];

        console.log(`[Color AI] 未知の言語 "${language}" の色を生成します...`);
        const text = await ask(`Programming language: ${language}. Provide a suitable hex color code (e.g., #ff0000) for this language. Return ONLY the hex code string.`);
        const match = text?.match(/#[0-9a-fA-F]{6}/);
        if (match) {
            dynamicColorCache[language] = match[0];
            console.log(`[Color AI] 生成完了: ${language} -> ${match[0]}`);
            return match[0];
        }
        return '#808080';
    }

    return { ask, resolveLanguageColor };
}
