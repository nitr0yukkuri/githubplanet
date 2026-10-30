export const PLANET_COLUMNS = `
    github_id, username, planet_color, planet_size_factor, main_language, language_stats,
    total_commits, weekly_commits, last_updated, planet_name, achievements, unlocked_titles,
    active_title
`;

export const PLANET_LOOKUP_COLUMNS = `
    github_id, username, planet_color, planet_size_factor, main_language, language_stats,
    total_commits, weekly_commits, last_updated, planet_name, achievements, active_title
`;

export const RANDOM_PLANET_COLUMNS = `
    github_id, username, planet_color, planet_size_factor, main_language, language_stats,
    total_commits, weekly_commits, planet_name, achievements, active_title
`;

export function mapPlanetRow(row) {
    if (!row) return null;

    // DB列名はこのアダプターで吸収し、利用側にはアプリ用の名前だけを渡す。
    return {
        githubId: row.github_id,
        username: row.username,
        planetColor: row.planet_color,
        planetSizeFactor: row.planet_size_factor,
        mainLanguage: row.main_language,
        languageStats: row.language_stats,
        totalCommits: row.total_commits,
        weeklyCommits: row.weekly_commits,
        lastUpdated: row.last_updated,
        planetName: row.planet_name,
        achievements: row.achievements,
        unlockedTitles: row.unlocked_titles,
        activeTitle: row.active_title
    };
}
