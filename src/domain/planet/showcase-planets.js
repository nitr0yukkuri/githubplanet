const SHOWCASE_PLANET_SIZE = 2;
const SHOWCASE_TOTAL_COMMITS = 2000;
const SHOWCASE_WEEKLY_COMMITS = 24;

const SHOWCASE_PLANETS = Object.freeze({
    css: createShowcasePlanet('CSS', '#563d7c', 'Directional Color Flow'),
    cpp: createShowcasePlanet('C++', '#f34b7d', 'Idle Plasma Globe'),
    go: createShowcasePlanet('Go', '#00ADD8', 'Atmospheric Wind'),
    typescript: createShowcasePlanet('TypeScript', '#007acc', 'Defensive Typed Shell'),
    javascript: createShowcasePlanet('JavaScript', '#f0db4f', 'Reactive Golden Surface'),
    java: createShowcasePlanet('Java', '#b07219', 'Java Roast'),
    kotlin: createShowcasePlanet('Kotlin', '#A97BFF', 'Electric Spark'),
    rust: createShowcasePlanet('Rust', '#dea584', 'Desert Dust World'),
    vue: createShowcasePlanet('Vue', '#41b883', 'Gentle Reactive Wind'),
    ruby: createShowcasePlanet('Ruby', '#CC342D', 'Burning Ruby'),
    python: createShowcasePlanet('Python', '#306998', 'Paired Orbital Trails', { Python: 70, Rust: 20, TypeScript: 10 })
});

function createShowcasePlanet(mainLanguage, planetColor, planetName, languageStats = { [mainLanguage]: 100 }) {
    return Object.freeze({
        username: `SHOWCASE_${mainLanguage.replaceAll('+', 'P').toUpperCase()}`,
        planetColor,
        planetSizeFactor: SHOWCASE_PLANET_SIZE,
        mainLanguage,
        languageStats: Object.freeze(languageStats),
        totalCommits: SHOWCASE_TOTAL_COMMITS,
        weeklyCommits: SHOWCASE_WEEKLY_COMMITS,
        planetName,
        achievements: Object.freeze({}),
        activeTitle: Object.freeze({
            prefix: 'LANGUAGE SHOWCASE',
            suffix: 'FEATURE PLANET'
        })
    });
}

export function getShowcasePlanet(slug) {
    const normalizedSlug = slug?.trim().toLowerCase();
    return SHOWCASE_PLANETS[normalizedSlug];
}

export function listShowcasePlanets() {
    return Object.entries(SHOWCASE_PLANETS).map(([slug, planet]) => ({
        slug,
        ...planet
    }));
}
