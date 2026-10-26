import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('runs the application image as the built-in non-root node user', () => {
    const dockerfile = fs.readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');
    const copyApplication = dockerfile.indexOf('COPY . .');
    const nonRootUser = dockerfile.indexOf('USER node');
    const startCommand = dockerfile.indexOf('CMD ["node", "server.js"]');

    assert.notEqual(copyApplication, -1);
    assert.ok(nonRootUser > copyApplication);
    assert.ok(startCommand > nonRootUser);
    assert.doesNotMatch(dockerfile.slice(nonRootUser), /^USER root\s*$/m);
});
