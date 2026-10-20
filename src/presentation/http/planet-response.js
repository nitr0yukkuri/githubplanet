import { MAX_TOTAL_COMMITS, MAX_WEEKLY_COMMITS } from '../../domain/planet/constants.js';
import { clampCommitCount, generatePlanetName } from '../../domain/planet/planet.js';

export function toPlanetResponse(planet) {
    const totalCommits = clampCommitCount(planet.totalCommits, MAX_TOTAL_COMMITS);
    const languageStats = planet.languageStats || {};
    const hasStats = Object.keys(languageStats).length > 0;
    let mainLanguage = planet.mainLanguage;
    let planetColor = planet.planetColor;

    if (!hasStats && mainLanguage !== 'Unknown') {
        mainLanguage = 'Unknown';
        planetColor = '#808080';
    }

    return {
        username: planet.username,
        planetColor,
        planetSizeFactor: parseFloat(planet.planetSizeFactor),
        mainLanguage,
        languageStats,
        totalCommits,
        weeklyCommits: clampCommitCount(planet.weeklyCommits, MAX_WEEKLY_COMMITS),
        planetName: planet.planetName || generatePlanetName(mainLanguage, planetColor, totalCommits),
        achievements: planet.achievements || {},
        activeTitle: planet.activeTitle || { prefix: '名もなき', suffix: '旅人' }
    };
}
