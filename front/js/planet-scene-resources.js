const MAX_STAR_COUNT = 120;

export function canReusePlanetScene(previous, next) {
    if (!previous || !next) return false;
    const languages = data => Object.entries(data.languageStats || {}).sort(([a], [b]) => a.localeCompare(b));
    return previous.mainLanguage === next.mainLanguage
        && previous.planetColor === next.planetColor
        && previous.planetSizeFactor === next.planetSizeFactor
        && calculateStarCount(previous.totalCommits || 0) === calculateStarCount(next.totalCommits || 0)
        && JSON.stringify(languages(previous)) === JSON.stringify(languages(next));
}

export function calculateStarCount(totalCommits) {
    let starCount = 0;
    let commitsUsed = 0;
    let requiredCommitsPerStar = 10;
    const costIncreaseStep = 10;
    const levelUpThreshold = 5;

    while (starCount < MAX_STAR_COUNT) {
        const currentLevelCost = requiredCommitsPerStar + (Math.floor(starCount / levelUpThreshold) * costIncreaseStep);
        if (totalCommits >= commitsUsed + currentLevelCost) {
            starCount++;
            commitsUsed += currentLevelCost;
        } else {
            break;
        }
    }
    return starCount;
}

// 共有テクスチャはページの所有物として保持し、シーン切替で二重破棄しない。
export function createPlanetDisposalResources(preservedTextures = []) {
    return { geometries: new Set(), materials: new Set(), textures: new Set(), preservedTextures: new Set(preservedTextures) };
}

export function disposePlanetObject(object, resources = createPlanetDisposalResources()) {
    if (!object) return;
    for (let index = object.children?.length - 1; index >= 0; index--) {
        const child = object.children[index];
        disposePlanetObject(child, resources);
        object.remove(child);
    }

    if (object.geometry && !resources.geometries.has(object.geometry)) {
        resources.geometries.add(object.geometry);
        object.geometry.dispose();
    }

    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
        if (!material || resources.materials.has(material)) return;
        resources.materials.add(material);

        [material.map, material.aoMap].forEach((texture) => {
            if (
                texture
                && !resources.preservedTextures.has(texture)
                && !resources.textures.has(texture)
            ) {
                resources.textures.add(texture);
                texture.dispose();
            }
        });
        material.dispose();
    });
}
