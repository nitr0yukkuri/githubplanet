import { loadDatabaseMigrations } from '../src/infrastructure/database/migrations.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '.cloudflare/assets');
if (output !== path.resolve(root, '.cloudflare/assets')) throw new Error('Unexpected assets directory');
await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(output, { recursive: true });
// 配信対象を列挙し、ソース・設定・認証情報がAssetsへ混入するのを防ぐ。
await fs.cp(path.join(root, 'front'), path.join(output, 'front'), { recursive: true });
for (const directory of ['build', 'examples/jsm']) await fs.cp(path.join(root, 'node_modules/three', directory), path.join(output, 'vendor/three', directory), { recursive: true });
const templates = {};
for (const name of ['index.html', 'card.html', 'achievements.html', 'settings.html', '404.html', 'sender.html', 'manifest.json', 'manifest-en.json', 'sw.js']) {
    templates[name] = await fs.readFile(path.join(root, name), 'utf8');
    if (!name.endsWith('.html')) await fs.copyFile(path.join(root, name), path.join(output, name));
}
templates['front/img/favicon-96.png'] = (await fs.readFile(path.join(root, 'front/img/favicon-96.png'))).toString('base64');
await fs.writeFile(path.join(root, 'cloudflare/generated-pages.js'), 'export const pages = ' + JSON.stringify(templates) + ';\n');
await fs.writeFile(path.join(output, '_headers'), '/*\n  X-Content-Type-Options: nosniff\n');
console.log('Cloudflare assets and page templates prepared.');

// iconv-liteのbrowser置換はNode互換環境でもstream実装を空にするため、Worker専用コピーではNode入口を使う。
const iconvDirectory = path.join(root, '.cloudflare/vendor/iconv-lite');
await fs.cp(path.join(root, 'node_modules/iconv-lite'), iconvDirectory, { recursive: true });
const iconvPackage = JSON.parse(await fs.readFile(path.join(iconvDirectory, 'package.json'), 'utf8'));
delete iconvPackage.browser;
await fs.writeFile(path.join(iconvDirectory, 'package.json'), JSON.stringify(iconvPackage));

await fs.writeFile(path.join(root, 'cloudflare/generated-schema.js'), 'export const schemaMigrations = ' + JSON.stringify(loadDatabaseMigrations().map(({version, checksum}) => ({version, checksum}))) + ';\n');
