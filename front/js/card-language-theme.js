import { resolvePlanetFeature } from './planet-features/registry.js';

// Featureの静的テーマをカード要素に反映し、通常表示と画像出力で同じ配色を保つ。
export function applyCardLanguageTheme(containerElement, data) {
    if (!containerElement) return;
    const feature = resolvePlanetFeature(data);
    const theme = feature?.cardTheme;
    if (!theme) {
        containerElement.removeAttribute('data-card-theme');
        [
            '--planet-card-atmosphere',
            '--planet-card-highlight',
            '--planet-card-border',
            '--planet-card-glow',
            '--planet-card-atmosphere-position',
            '--planet-card-highlight-position'
        ].forEach((property) => containerElement.style.removeProperty(property));
        return;
    }

    containerElement.dataset.cardTheme = theme.id;
    const planetColor = /^#[\da-f]{6}$/i.test(data.planetColor || '') ? data.planetColor : theme.atmosphere;
    const atmosphereColor = theme.usePlanetColor === false ? theme.atmosphere : planetColor;
    containerElement.style.setProperty('--planet-card-atmosphere', colorWithAlpha(atmosphereColor, 0.24));
    containerElement.style.setProperty('--planet-card-highlight', colorWithAlpha(theme.highlight, 0.12));
    containerElement.style.setProperty('--planet-card-border', colorWithAlpha(theme.accent, 0.32));
    containerElement.style.setProperty('--planet-card-glow', colorWithAlpha(theme.atmosphere, 0.18));
    containerElement.style.setProperty('--planet-card-atmosphere-position', theme.atmospherePosition);
    containerElement.style.setProperty('--planet-card-highlight-position', theme.highlightPosition);
}

function colorWithAlpha(hexColor, alpha) {
    const match = /^#([\da-f]{6})$/i.exec(hexColor);
    if (!match) return 'transparent';

    const value = Number.parseInt(match[1], 16);
    const red = (value >> 16) & 255;
    const green = (value >> 8) & 255;
    const blue = value & 255;
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function getCardAccentColor(data) {
    const feature = resolvePlanetFeature(data);
    const featureAccent = feature?.cardTheme?.usePlanetColor === false ? feature.cardTheme?.accent : null;

    // 色相が巡るFeatureは固定テーマ色を宣言し、カードUIの色揺れを防ぐ。
    return /^#[\da-f]{6}$/i.test(featureAccent || '') ? featureAccent : data.planetColor;
}
