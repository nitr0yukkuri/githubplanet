import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function listJavaScriptFiles(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) return listJavaScriptFiles(entryPath);
        return entry.name.endsWith('.js') ? [entryPath] : [];
    });
}

function resolveLocalImports(filePath) {
    const source = fs.readFileSync(filePath, 'utf8');
    return [...source.matchAll(/(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g)]
        .map((match) => path.resolve(path.dirname(filePath), match[1]));
}

function collectLayerImports(layer) {
    const layerDirectory = path.join(projectRoot, 'src', layer);
    return listJavaScriptFiles(layerDirectory).flatMap((filePath) => (
        resolveLocalImports(filePath).map((importPath) => ({ filePath, importPath }))
    ));
}

function isInLayer(filePath, layer) {
    const layerDirectory = path.join(projectRoot, 'src', layer) + path.sep;
    return filePath.startsWith(layerDirectory);
}

test('keeps inward application and domain dependencies', () => {
    const forbiddenForApplication = ['infrastructure', 'presentation'];
    const forbiddenForDomain = ['application', 'infrastructure', 'presentation'];

    for (const { filePath, importPath } of collectLayerImports('application')) {
        for (const layer of forbiddenForApplication) {
            assert.equal(
                isInLayer(importPath, layer),
                false,
                `${path.relative(projectRoot, filePath)} must not import src/${layer}`
            );
        }
    }

    for (const { filePath, importPath } of collectLayerImports('domain')) {
        for (const layer of forbiddenForDomain) {
            assert.equal(
                isInLayer(importPath, layer),
                false,
                `${path.relative(projectRoot, filePath)} must not import src/${layer}`
            );
        }
    }
});

test('keeps infrastructure adapters independent from outer application and HTTP layers', () => {
    for (const { filePath, importPath } of collectLayerImports('infrastructure')) {
        assert.equal(
            isInLayer(importPath, 'application'),
            false,
            `${path.relative(projectRoot, filePath)} must not import src/application`
        );
        assert.equal(
            isInLayer(importPath, 'presentation'),
            false,
            `${path.relative(projectRoot, filePath)} must not import src/presentation`
        );
    }
});
