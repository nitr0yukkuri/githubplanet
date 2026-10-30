import assert from 'node:assert/strict';
import test from 'node:test';
import { createLanguageColorRepository } from '../src/infrastructure/database/language-color-repository.js';

test('loads persisted language colors in one startup query', async () => {
    const calls = [];
    const repository = createLanguageColorRepository({
        async query(sql) {
            calls.push(sql);
            if (sql.includes('language_color_cache')) {
                return { rows: [
                    { language: 'NewLanguage', color: '#123456' },
                    { language: 'OtherLanguage', color: '#abcdef' }
                ] };
            }
            return { rows: [] };
        }
    });

    assert.deepEqual(await repository.loadLanguageColorCache(), {
        NewLanguage: '#123456',
        OtherLanguage: '#abcdef'
    });
    assert.equal(calls.length, 1);
    assert.match(calls[0], /SELECT language, color FROM language_color_cache/i);
});
