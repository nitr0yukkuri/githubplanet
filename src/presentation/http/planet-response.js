import { MAX_TOTAL_COMMITS, MAX_WEEKLY_COMMITS } from '../../domain/planet/constants.js';
import { clampCommitCount, generatePlanetName } from '../../domain/planet/planet.js';

export function toPlanetResponse(row) {
    const totalCommits = clampCommitCount(row.total_commits, MAX_TOTAL_COMMITS);
    const languageStats = row.language_stats || {};
    const hasStats = Object.keys(languageStats).length > 0;
    let mainLanguage = row.main_language;
    let planetColor = row.planet_color;

    if (!hasStats && mainLanguage !== 'Unknown') {
        mainLanguage = 'Unknown';
        planetColor = '#808080';
    }

    return {
        username: row.username,
        planetColor,
        planetSizeFactor: parseFloat(row.planet_size_factor),
        mainLanguage,
        languageStats,
        totalCommits,
        weeklyCommits: clampCommitCount(row.weekly_commits, MAX_WEEKLY_COMMITS),
        planetName: row.planet_name || generatePlanetName(mainLanguage, planetColor, totalCommits),
        achievements: row.achievements || {},
        activeTitle: row.active_title || { prefix: '名もなき', suffix: '旅人' }
    };
}
