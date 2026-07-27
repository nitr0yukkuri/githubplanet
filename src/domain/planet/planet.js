import {
    ACHIEVEMENTS,
    MAX_TOTAL_COMMITS,
    MAX_WEEKLY_COMMITS
} from './constants.js';

export function clampCommitCount(value, max) {
    const count = Number(value);
    if (!Number.isFinite(count)) return 0;
    return Math.min(Math.max(Math.trunc(count), 0), max);
}

export function normalizePlanetCommitCounts(data) {
    if (!data) return data;
    return {
        ...data,
        totalCommits: clampCommitCount(data.totalCommits, MAX_TOTAL_COMMITS),
        weeklyCommits: clampCommitCount(data.weeklyCommits, MAX_WEEKLY_COMMITS)
    };
}

export function checkAchievements(existingAchievements, stats, now = new Date()) {
    const newAchievements = { ...existingAchievements };
    const unlockedAt = now.toISOString();
    const { totalCommits, weeklyCommits, languagesCount, hasContributedToOthers, totalStars, createdAt } = stats;

    const unlock = (achievement) => {
        if (!newAchievements[achievement.id]) {
            newAchievements[achievement.id] = { ...achievement, unlockedAt };
        }
    };

    unlock(ACHIEVEMENTS.FIRST_PLANET);
    if (totalCommits >= 1) unlock(ACHIEVEMENTS.FIRST_COMMIT);
    if (weeklyCommits >= 50) unlock(ACHIEVEMENTS.VELOCITY_STAR);
    if (hasContributedToOthers) unlock(ACHIEVEMENTS.OS_CONTRIBUTOR);
    if (totalStars >= 10) unlock(ACHIEVEMENTS.STARGAZER);
    if (languagesCount >= 5) unlock(ACHIEVEMENTS.POLYGLOT_PIONEER);

    if (createdAt) {
        const diffTime = Math.abs(now - new Date(createdAt));
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays >= 365) unlock(ACHIEVEMENTS.OCTOCAT_FRIEND);
    }

    if (totalCommits >= 100) unlock(ACHIEVEMENTS.COMMIT_100);
    if (totalCommits >= 500) unlock(ACHIEVEMENTS.COMMIT_500);
    if (totalCommits >= 1000) unlock(ACHIEVEMENTS.COMMIT_1000);
    if (totalCommits >= 10000) unlock(ACHIEVEMENTS.CONTRIBUTION_10000);
    return newAchievements;
}

export function generatePlanetName(mainLanguage, planetColor, totalCommits) {
    const adjectives = {
        JavaScript: '柔軟な', TypeScript: '堅牢な', Python: '賢明な', HTML: '構造的', CSS: '美麗な',
        Ruby: '情熱の', Java: '不変の', C: '原始の', 'C++': '高速の', 'C#': '鋭利な',
        Go: '疾風の', Rust: '安全な', PHP: '象の', Swift: '迅速な', Kotlin: '静寂の',
        Shell: '自動の', Dart: '急襲の', Scala: '螺旋の', Perl: '真珠の', Lua: '月光の',
        Haskell: '純粋な', R: '統計の', Julia: '科学の', Vue: '反応の', Dockerfile: '箱舟の',
        Svelte: '構築の', Elixir: '錬金の', 'Objective-C': '客観の', VimScript: '操作の', Unknown: '未知の'
    };
    const colorNames = {
        '#f0db4f': '黄金', '#007acc': '蒼穹', '#306998': '深海', '#e34c26': '灼熱', '#563d7c': '紫水晶',
        '#CC342D': '紅蓮', '#b07219': '大地', '#555555': '鋼鉄', '#f34b7d': '桜花', '#178600': '翡翠',
        '#00ADD8': '氷河', '#dea584': '砂塵', '#4F5D95': '藍染', '#F05138': '朱色', '#A97BFF': '雷光',
        '#808080': '神秘', '#89e051': '若葉', '#00B4AB': '清流', '#c22d40': '薔薇', '#0298c3': '天青',
        '#000080': '深淵', '#5e5086': '夜空', '#198CE7': '蒼天', '#a270ba': '藤色', '#41b883': '若草',
        '#384d54': '玄武', '#ff3e00': '橙', '#6e4a7e': '葡萄', '#438eff': '青空', '#199f4b': '常盤'
    };
    const adjective = adjectives[mainLanguage] || '未知の';
    const colorName = colorNames[planetColor] || '神秘';
    const suffix = totalCommits > 1000 ? '帝星' : totalCommits > 500 ? '巨星' : '星';
    return `${adjective}${colorName}の${suffix}`;
}

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
