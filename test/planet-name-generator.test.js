import assert from 'node:assert/strict';
import test from 'node:test';
import { requestPlanetName } from '../src/application/planet-name-generator.js';

test('shares the planet naming thresholds and forwards the generation result', async () => {
    for (const [totalCommits, suffix] of [[500, '星'], [501, '巨星'], [1000, '巨星'], [1001, '帝星']]) {
        let prompt;
        const result = await requestPlanetName(async (input) => { prompt = input; return '名前\n'; }, {
            mainLanguage: 'NewLanguage', planetColor: '#abcdef', totalCommits
        });
        assert.match(prompt, /Programming language: NewLanguage\. Color: #abcdef/);
        assert.ok(prompt.includes(`の${suffix}`));
        assert.equal(result, '名前\n');
    }
});
