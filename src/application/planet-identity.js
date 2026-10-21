import { calculatePlanetSizeFactor, generatePlanetName } from '../domain/planet/planet.js';

export async function resolvePlanetIdentity({
    mainLanguage,
    totalCommits,
    existingData,
    geminiClient,
    geminiApiKey
}) {
    let planetColor = '#808080';
    let planetName = generatePlanetName(mainLanguage, '#808080', totalCommits);
    let shouldAskGeminiColor = true;
    let shouldAskGeminiName = true;

    // 同じ主要言語で再生成するとログインごとに惑星の個性が揺れるため、確定済みの色と名前を優先する。
    if (existingData) {
        if (existingData.mainLanguage === mainLanguage && existingData.planetColor) {
            planetColor = existingData.planetColor;
            shouldAskGeminiColor = false;
        }
        if (existingData.mainLanguage === mainLanguage && existingData.planetName) {
            const oldName = existingData.planetName;
            if (!oldName.includes('未知の') && !oldName.includes('神秘')) {
                planetName = oldName;
                shouldAskGeminiName = false;
            }
        }
    }

    if (shouldAskGeminiColor) {
        planetColor = await geminiClient.resolveLanguageColor(mainLanguage);
    }

    if (geminiApiKey && shouldAskGeminiName) {
        planetName = generatePlanetName(mainLanguage, planetColor, totalCommits);
        if (planetName.includes('未知の') || planetName.includes('神秘')) {
            console.log(`[Gemini] 暫定名 "${planetName}" をかっこいい名前に修正します...`);
            const suffix = totalCommits > 1000 ? '帝星' : totalCommits > 500 ? '巨星' : '星';
            const prompt = `Programming language: ${mainLanguage}. Color: ${planetColor}.
            Generate a cool Japanese planet name in the format: "[Adjective][ColorName]の${suffix}".
            The adjective should describe the nature of "${mainLanguage}". The color name should describe the color "${planetColor}".
            Example: "JavaScript" -> "柔軟な黄金の${suffix}".
            Return ONLY the name string.`;
            const aiName = await geminiClient.ask(prompt);
            if (aiName) planetName = aiName.replace(/(\r\n|\n|\r)/gm, '');
        } else {
            console.log('[Gemini] 名前生成スキップ: キャッシュまたはデフォルト名を採用');
        }
    } else {
        console.log('[Gemini] 名前生成スキップ: 既存のかっこいい名前を再利用');
    }

    return {
        planetColor,
        planetName,
        planetSizeFactor: calculatePlanetSizeFactor(totalCommits)
    };
}

