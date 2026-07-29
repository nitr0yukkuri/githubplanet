import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('keeps caller write access out of the reusable GIF generator', async () => {
    const [workflow, readme] = await Promise.all([
        readFile(
            new URL('../.github/workflows/generate-profile-card-gif.yml', import.meta.url),
            'utf8'
        ),
        readFile(new URL('../README.md', import.meta.url), 'utf8')
    ]);

    assert.match(workflow, /contents: read/);
    assert.match(workflow, /ref: [0-9a-f]{40}/);
    assert.match(workflow, /actions\/upload-artifact@v4/);
    assert.doesNotMatch(workflow, /contents: write/);
    assert.doesNotMatch(workflow, /git push/);
    assert.match(readme, /needs: generate/);
    assert.match(readme, /file planet-card\.gif \| grep -q "GIF image data"/);
});

test('copies animated public card URLs instead of local screenshot URLs', async () => {
    const cardScript = await readFile(
        new URL('../front/js/card.js', import.meta.url),
        'utf8'
    );

    assert.match(cardScript, /raw\.githubusercontent\.com/);
    assert.match(cardScript, /card-assets\/showcase_/);
    assert.match(cardScript, /main\/planet-card\.gif/);
    assert.match(cardScript, /PUBLIC_DEPLOY_URL/);
    assert.doesNotMatch(cardScript, /image\.thum\.io/);
    assert.doesNotMatch(cardScript, /window\.location\.origin/);
});

test('shows the animated owner card in both READMEs', async () => {
    const [readme, englishReadme] = await Promise.all([
        readFile(new URL('../README.md', import.meta.url), 'utf8'),
        readFile(new URL('../README.en.md', import.meta.url), 'utf8')
    ]);
    const animatedOwnerCard = /githubplanet\/card-assets\/profile_card\.gif/;

    assert.match(readme, animatedOwnerCard);
    assert.match(englishReadme, animatedOwnerCard);
});

test('documents static cards as the default and animated cards as optional', async () => {
    const [readme, englishReadme] = await Promise.all([
        readFile(new URL('../README.md', import.meta.url), 'utf8'),
        readFile(new URL('../README.en.md', import.meta.url), 'utf8')
    ]);

    assert.match(readme, /静止カード（標準）/);
    assert.match(readme, /任意（GitHub Actions使用）：動くGIFカード/);
    assert.match(readme, /Actions.+Update Planet Card.+手動実行/s);
    assert.match(englishReadme, /Static card \(default\)/);
    assert.match(englishReadme, /Optional \(uses GitHub Actions\): Animated GIF card/);
    assert.match(englishReadme, /Actions.+manually run.+Update Planet Card/s);
});
