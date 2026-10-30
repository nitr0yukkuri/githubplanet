import express from 'express';
import fs from 'node:fs';
import path from 'node:path';

export function registerVendorRoutes(app, { rootDirectory }) {
    const directory = path.join(rootDirectory, 'node_modules/three');
    const { version } = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
    if (!/^\d+\.\d+\.\d+(?:-[\da-z.-]+)?$/i.test(version)) throw new Error('Invalid Three.js version');
    const threeAssetBasePath = `/vendor/three/${version}`;
    // core等の相対importも同じ版に閉じ込め、旧版の長期cacheと混ざる描画障害を防ぐ。
    app.use(threeAssetBasePath, express.static(directory, { maxAge: '1y', immutable: true }));
    app.use('/vendor/three', express.static(directory, { maxAge: 0 }));
    return { threeAssetBasePath };
}
