import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { registerVendorRoutes } from '../src/presentation/http/vendor-routes.js';
import { registerPageRoutes } from '../src/presentation/http/page-routes.js';

test('home and card use the same versioned Three.js graph including relative core imports', async () => {
    const app = express();
    app.use((req, _res, next) => { req.session = {}; next(); });
    const assets = registerVendorRoutes(app, { rootDirectory: process.cwd() });
    registerPageRoutes(app, { rootDirectory: process.cwd(), isProduction: false, sessionSecret: 'fixture', ...assets });
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
        for (const route of ['/', '/card.html']) {
            const html = await (await fetch(base + route)).text();
            assert.ok(html.includes(`"three": "${assets.threeAssetBasePath}/build/three.module.js"`));
            assert.equal(html.includes('three@0.160.0'), false);
        }
        const module = await fetch(base + assets.threeAssetBasePath + '/build/three.module.js');
        assert.equal(module.status, 200);
        assert.match(module.headers.get('cache-control'), /immutable/);
        assert.match(await module.text(), /from '\.\/three\.core\.js'/);
        const core = await fetch(base + assets.threeAssetBasePath + '/build/three.core.js');
        assert.equal(core.status, 200);
        assert.match(await core.text(), /REVISION/);
        const legacy = await fetch(base + '/vendor/three/build/three.module.js');
        assert.equal(legacy.status, 200);
        assert.match(legacy.headers.get('cache-control'), /max-age=0/);
        await legacy.arrayBuffer();
    } finally {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
    }
});
