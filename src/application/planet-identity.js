import { requestPlanetName } from './planet-name-generator.js';
import { calculatePlanetSizeFactor, generatePlanetName } from '../domain/planet/planet.js';

export async function resolvePlanetIdentity({
    mainLanguage,
    totalCommits,
    existingData,
    geminiClient,
    languageColorService,
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
        planetColor = await languageColorService.resolveLanguageColor(mainLanguage);
    }

    if (geminiApiKey && shouldAskGeminiName) {
        planetName = generatePlanetName(mainLanguage, planetColor, totalCommits);
        if (planetName.includes('未知の') || planetName.includes('神秘')) {
            console.log(`[Gemini] 暫定名 "${planetName}" をかっこいい名前に修正します...`);
            const aiName = await requestPlanetName(geminiClient.ask, { mainLanguage, planetColor, totalCommits });
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

