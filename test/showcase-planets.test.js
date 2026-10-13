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
    javascript: 'JavaScript',
    java: 'Java',
    kotlin: 'Kotlin',
    rust: 'Rust',
    vue: 'Vue',
    ruby: 'Ruby',
    python: 'Python'
};

const EXPECTED_CARD_CAPTIONS = {
    css: {
        ja: '地形に沿って色の帯がゆるやかに流れる。',
        en: 'A band of color flows gently along the terrain.'
    },
    cpp: {
        ja: '球体の周囲でプラズマ状の光が脈打つ。',
        en: 'Plasma-like light pulses around the globe.'
    },
    go: {
        ja: '風に沿う大気の層が惑星を包み込む。',
        en: 'Wind-shaped atmospheric layers wrap around the planet.'
    },
    typescript: {
        ja: '重なった外殻が惑星を守るように囲う。',
        en: 'Layered shells enclose the planet like a quiet defense system.'
    },
    javascript: {
        ja: '金色の地表で局所的な模様が反応し、変化する。',
        en: 'Local reactive patterns ripple over a golden surface.'
    },
    java: {
        ja: '熱を帯びた土壌に、乾いた砂塵が流れる。',
        en: 'Warm soil tones meet dry, drifting surface dust.'
    },
    kotlin: {
        ja: '結晶の核を縁の電気的な光が彩る。',
        en: 'A crystal-like core glows as electric filaments crackle along the rim.'
    },
    rust: {
        ja: '赤褐色の砂漠地形に細かな砂塵が漂う。',
        en: 'Rust-red desert relief carries fine, drifting dust.'
    },
    vue: {
        ja: '葉の粒子がやわらかな風に乗って巡る。',
        en: 'Light leaf particles travel in a gentle circulating breeze.'
    },
    ruby: {
        ja: '熱いコロナの中で、火の粉が上昇する。',
        en: 'A hot corona glows above the surface as ember-like sparks rise.'
    },
    python: {
        ja: '青と黄の二本が別軌道を巡り、裏側では惑星に隠れる。',
        en: 'Blue and yellow trails follow separate paths and disappear behind the planet.'
    }
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
    assert.equal(getShowcasePlanet('python').planetName, 'Paired Orbital Trails');
});

test('documents every production showcase card in the card gallery', async () => {
    const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
    const englishReadme = await readFile(
        new URL('../README.en.md', import.meta.url),
        'utf8'
    );
    const cardReadme = await readFile(
        new URL('../docs/cards/README.md', import.meta.url),
        'utf8'
    );
    const englishCardReadme = await readFile(
        new URL('../docs/cards/README.en.md', import.meta.url),
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

        assert.match(cardReadme, cardLink);
        assert.match(cardReadme, animatedImage);
        assert.match(englishCardReadme, cardLink);
        assert.match(englishCardReadme, animatedImage);
        assert.match(updateWorkflow, new RegExp(`showcase_${slug}\\.gif`));
    }

    for (const [slug, captions] of Object.entries(EXPECTED_CARD_CAPTIONS)) {
        assert.ok(cardReadme.includes(captions.ja), `Missing Japanese caption for ${slug}`);
        assert.ok(englishCardReadme.includes(captions.en), `Missing English caption for ${slug}`);
    }

    assert.match(cardReadme, /Python — 対をなす軌道光/);
    assert.match(englishCardReadme, /Python — Paired Orbital Trails/);
    assert.match(readme, /docs\/cards\/README\.md/);
    assert.match(englishReadme, /docs\/cards\/README\.en\.md/);
    assert.match(readme, /raw\.githubusercontent\.com\/GitHubユーザー名/);
    assert.match(englishReadme, /raw\.githubusercontent\.com\/YOUR_USERNAME/);
    assert.doesNotMatch(readme, /\\`\\`\\`markdown/);
});
