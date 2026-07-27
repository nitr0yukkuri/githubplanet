import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('sends the administrator key from the sender screen without storing it', () => {
    const html = fs.readFileSync('sender.html', 'utf8');
    const script = fs.readFileSync('front/js/sender.js', 'utf8');

    assert.match(html, /id="api-key-input" type="password"/);
    assert.match(script, /'x-api-key': apiKey/);
    assert.match(script, /API KEY REQUIRED/);
    assert.doesNotMatch(script, /localStorage|sessionStorage/);
});
