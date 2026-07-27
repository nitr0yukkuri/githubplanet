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
