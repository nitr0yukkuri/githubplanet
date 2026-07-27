import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
    getShowcasePlanet,
    listShowcasePlanets
} from '../src/domain/planet/showcase-planets.js';

const EXPECTED_SHOWCASES = {
    css: 'CSS',
    cpp: 'C++',
    go: 'Go',
    typescript: 'TypeScript',
    javascript: 'JavaScript'
};

test('provides deterministic feature planets without database records', () => {
    const planets = listShowcasePlanets();

    assert.equal(planets.length, Object.keys(EXPECTED_SHOWCASES).length);
    for (const [slug, language] of Object.entries(EXPECTED_SHOWCASES)) {
        const planet = getShowcasePlanet(slug);
        assert.equal(planet.mainLanguage, language);
        assert.equal(planet.planetSizeFactor, 2);
        assert.equal(planet.totalCommits, 2000);
        assert.equal(planet.languageStats[language], 100);
        assert.match(planet.username, /^SHOWCASE_/);
    }
    assert.equal(getShowcasePlanet('unknown'), undefined);
});

test('documents every production showcase card in the README', async () => {
    const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
    const englishReadme = await readFile(
        new URL('../README.en.md', import.meta.url),
        'utf8'
    );
    const updateWorkflow = await readFile(
        new URL('../.github/workflows/update-card.yml', import.meta.url),
        'utf8'
    );

    for (const slug of Object.keys(EXPECTED_SHOWCASES)) {
        const cardLink = new RegExp(
            `card\\.html\\?showcase=${slug}&(?:amp;)?fix=true`
        );
        const animatedImage = new RegExp(
            `card-assets/showcase_${slug}\\.gif`
        );

        assert.match(readme, cardLink);
        assert.match(readme, animatedImage);
        assert.match(englishReadme, cardLink);
        assert.match(englishReadme, animatedImage);
        assert.match(updateWorkflow, new RegExp(`showcase_${slug}\\.gif`));
    }

    assert.match(readme, /raw\.githubusercontent\.com\/GitHubユーザー名/);
    assert.match(englishReadme, /raw\.githubusercontent\.com\/YOUR_USERNAME/);
    assert.doesNotMatch(readme, /\\`\\`\\`markdown/);
});
