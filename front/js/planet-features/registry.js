import * as c from '../c-planet-steel.js';
import * as cpp from '../cpp-planet-lightning.js';
import * as css from '../css-planet-flow.js';
import * as go from '../go-planet-wind.js';
import * as java from '../java-planet-soil.js';
import * as javascript from '../javascript-planet-reactivity.js';
import * as kotlin from '../kotlin-planet-crystal.js';
import * as perl from '../perl-planet-ocean.js';
import * as python from '../python-planet-structure.js';
import * as ruby from '../ruby-planet-solar.js';
import * as rust from '../rust-planet-desert.js';
import * as swift from '../swift-planet-feathers.js';
import * as typescript from '../typescript-planet-shell.js';
import * as vue from '../vue-planet-circulation.js';

const CARD_THEMES = Object.freeze({
    c: Object.freeze({ id: 'c-steel', accent: '#c3d0d7', atmosphere: '#728491', highlight: '#b6c3ca', atmospherePosition: '25% 50%', highlightPosition: '75% 32%' }),
    css: Object.freeze({ id: 'css-spectrum', accent: '#d7bcff', atmosphere: '#7040b3', highlight: '#f4d2ff', atmospherePosition: '72% 28%', highlightPosition: '34% 62%' }),
    cpp: Object.freeze({ id: 'cpp-plasma', accent: '#ff9bb9', atmosphere: '#b62f67', highlight: '#ffcae0', atmospherePosition: '48% 72%', highlightPosition: '65% 28%' }),
    go: Object.freeze({ id: 'go-wind', accent: '#79e1f6', atmosphere: '#008cae', highlight: '#c2fbff', atmospherePosition: '22% 42%', highlightPosition: '74% 66%' }),
    swift: Object.freeze({ id: 'swift-feathers', accent: '#ffc2c0', atmosphere: '#bd4b4b', highlight: '#ffe1d4', atmospherePosition: '32% 72%', highlightPosition: '76% 30%' }),
    vue: Object.freeze({ id: 'vue-leaves', accent: '#83e7b2', atmosphere: '#268a63', highlight: '#d2ffbb', atmospherePosition: '24% 64%', highlightPosition: '72% 34%' }),
    typescript: Object.freeze({ id: 'typescript-shell', accent: '#78c8ff', atmosphere: '#007acc', highlight: '#d1edff', atmospherePosition: '30% 46%', highlightPosition: '76% 58%' }),
    javascript: Object.freeze({ id: 'javascript-gold', accent: '#f3df75', atmosphere: '#9d8428', highlight: '#ffefb2', atmospherePosition: '62% 40%', highlightPosition: '26% 76%' }),
    java: Object.freeze({ id: 'java-soil', accent: '#e5ae71', atmosphere: '#88521d', highlight: '#f9d6a3', atmospherePosition: '30% 72%', highlightPosition: '72% 30%' }),
    kotlin: Object.freeze({ id: 'kotlin-crystal', accent: '#d1b9ff', atmosphere: '#754db4', highlight: '#eee1ff', atmospherePosition: '52% 44%', highlightPosition: '86% 52%' }),
    perl: Object.freeze({ id: 'perl-ocean', accent: '#7ee0ec', atmosphere: '#087d96', highlight: '#c9ffff', atmospherePosition: '20% 44%', highlightPosition: '78% 62%' }),
    rust: Object.freeze({ id: 'rust-desert', accent: '#dea584', atmosphere: '#a95433', highlight: '#ffcf9b', atmospherePosition: '30% 72%', highlightPosition: '75% 42%' }),
    ruby: Object.freeze({ id: 'ruby-hearth', accent: '#ff9386', atmosphere: '#9f3028', highlight: '#ffc0a7', atmospherePosition: '24% 38%', highlightPosition: '68% 62%' }),
    python: Object.freeze({ id: 'python-trails', accent: '#ffd43b', atmosphere: '#306998', highlight: '#ffe389', atmospherePosition: '30% 56%', highlightPosition: '74% 36%' })
});

const FEATURE_DEFINITIONS = [
    {
        id: 'c',
        language: 'C',
        cardTheme: CARD_THEMES.c,
        module: c,
        matches: c.isCPlanet,
        createMaterial: ({ THREE, planetTexture }) => (
            c.createCPlanetSteelMaterial(THREE, planetTexture)
        )
    },
    {
        id: 'css',
        language: 'CSS',
        cardTheme: CARD_THEMES.css,
        module: css,
        matches: css.isCssPlanet,
        createMaterial: ({ THREE, planetTexture }) => (
            css.createCssPlanetFlowMaterial(THREE, planetTexture)
        ),
        update: ({ material, now }) => css.updateCssPlanetFlow(material, now)
    },
    {
        id: 'cpp',
        language: 'C++',
        cardTheme: CARD_THEMES.cpp,
        module: cpp,
        matches: cpp.isCppPlanet,
        createMaterial: ({ THREE, planetTexture, data }) => (
            cpp.createCppPlanetLightningMaterial(
                THREE,
                planetTexture,
                data.planetColor
            )
        ),
        update: ({ material, now }) => cpp.updateCppPlanetLightning(material, now)
    },
    {
        id: 'go',
        language: 'Go',
        cardTheme: CARD_THEMES.go,
        module: go,
        matches: go.isGoPlanet,
        usesWindSpeed: true,
        createMaterial: ({ THREE, planetTexture, direction }) => (
            go.createGoPlanetWindMaterial(
                THREE,
                planetTexture,
                direction,
                'go'
            )
        ),
        createObjects: ({ THREE, radius, direction }) => ({
            atmosphere: go.createGoPlanetAtmosphere(
                THREE,
                radius,
                direction,
                'go'
            )
        }),
        update: ({ material, objects, now, windSpeed }) => {
            go.updateGoPlanetWind(material, now, windSpeed);
            go.updateGoPlanetAtmosphere(objects.atmosphere, now, windSpeed);
        }
    },
    {
        id: 'swift',
        language: 'Swift',
        cardTheme: CARD_THEMES.swift,
        module: swift,
        matches: swift.isSwiftPlanet,
        usesWindSpeed: true,
        createMaterial: ({ THREE, planetTexture, direction }) => (
            go.createGoPlanetWindMaterial(
                THREE,
                planetTexture,
                direction,
                'swift'
            )
        ),
        createObjects: ({ THREE, radius, direction }) => ({
            atmosphere: go.createGoPlanetAtmosphere(
                THREE,
                radius,
                direction,
                'swift'
            ),
            feathers: swift.createSwiftPlanetFeathers(THREE, radius, direction)
        }),
        update: ({ material, objects, now, windSpeed }) => {
            go.updateGoPlanetWind(material, now, windSpeed);
            go.updateGoPlanetAtmosphere(objects.atmosphere, now, windSpeed);
            swift.updateSwiftPlanetFeathers(objects.feathers, now, windSpeed);
        }
    },
    {
        id: 'vue',
        language: 'Vue',
        cardTheme: CARD_THEMES.vue,
        module: vue,
        matches: vue.isVuePlanet,
        rotationMultiplier: 0.7,
        windAnimationMultiplier: 0.5,
        usesWindSpeed: true,
        createMaterial: ({ THREE, planetTexture, direction }) => (
            go.createGoPlanetWindMaterial(
                THREE,
                planetTexture,
                direction,
                'vue'
            )
        ),
        createObjects: ({ THREE, radius, direction }) => ({
            atmosphere: go.createGoPlanetAtmosphere(
                THREE,
                radius,
                direction,
                'vue'
            ),
            leaves: vue.createVueLeafWind(THREE, radius)
        }),
        update: ({ material, objects, now, windSpeed }) => {
            go.updateGoPlanetWind(material, now, windSpeed);
            go.updateGoPlanetAtmosphere(objects.atmosphere, now, windSpeed);
            vue.updateVueLeafWind(objects.leaves, now, windSpeed);
        }
    },
    {
        id: 'typescript',
        language: 'TypeScript',
        cardTheme: CARD_THEMES.typescript,
        module: typescript,
        matches: typescript.isTypeScriptPlanet,
        createMaterial: ({ THREE, planetTexture }) => (
            typescript.createTypeScriptPlanetMaterial(THREE, planetTexture)
        ),
        createObjects: ({ THREE, radius }) => ({
            shell: typescript.createTypeScriptPlanetShell(THREE, radius)
        }),
        update: ({ material, objects, now }) => {
            typescript.updateTypeScriptPlanetShell(material, now);
            typescript.updateTypeScriptPlanetShell(objects.shell, now);
        }
    },
    {
        id: 'javascript',
        language: 'JavaScript',
        cardTheme: CARD_THEMES.javascript,
        module: javascript,
        matches: javascript.isJavaScriptPlanet,
        createMaterial: ({ THREE, planetTexture, data }) => (
            javascript.createJavaScriptPlanetMaterial(
                THREE,
                planetTexture,
                data.planetColor
            )
        ),
        update: ({ material, now }) => (
            javascript.updateJavaScriptPlanetReactivity(material, now)
        )
    },
    {
        id: 'java',
        language: 'Java',
        cardTheme: CARD_THEMES.java,
        module: java,
        matches: java.isJavaPlanet,
        createMaterial: ({ THREE, planetTexture }) => (
            java.createJavaPlanetMaterial(THREE, planetTexture)
        ),
        createObjects: ({ THREE, radius }) => ({
            dust: java.createJavaPlanetDust(THREE, radius)
        }),
        update: ({ objects, now }) => java.updateJavaPlanetSoil(objects.dust, now)
    },
    {
        id: 'kotlin',
        language: 'Kotlin',
        cardTheme: CARD_THEMES.kotlin,
        module: kotlin,
        matches: kotlin.isKotlinPlanet,
        createMaterial: ({ THREE, planetTexture }) => (
            kotlin.createKotlinPlanetMaterial(THREE, planetTexture)
        ),
        createObjects: ({ THREE, radius }) => ({
            electricity: kotlin.createKotlinElectricity(THREE, radius)
        }),
        update: ({ material, objects, now }) => {
            kotlin.updateKotlinPlanetCrystal(material, now);
            kotlin.updateKotlinElectricity(objects.electricity, now);
        }
    },

    {
        id: 'perl',
        language: 'Perl',
        cardTheme: CARD_THEMES.perl,
        module: perl,
        matches: perl.isPerlPlanet,
        createMaterial: ({ THREE, planetTexture }) => (
            perl.createPerlPlanetOceanMaterial(THREE, planetTexture)
        ),
        update: ({ material, now }) => (
            perl.updatePerlPlanetOcean(material, now)
        )
    },
    {
        id: 'rust',
        language: 'Rust',
        cardTheme: CARD_THEMES.rust,
        module: rust,
        matches: rust.isRustPlanet,
        createMaterial: ({ THREE, planetTexture }) => (
            rust.createRustPlanetMaterial(THREE, planetTexture)
        ),
        createObjects: ({ THREE, radius }) => ({
            dust: rust.createRustPlanetDust(THREE, radius)
        }),
        update: ({ material, objects, now }) => {
            rust.updateRustPlanetDesert(material, now);
            rust.updateRustPlanetDesert(objects.dust, now);
        }
    },
    {
        id: 'ruby',
        language: 'Ruby',
        cardTheme: CARD_THEMES.ruby,
        module: ruby,
        matches: ruby.isRubyPlanet,
        createMaterial: ({ THREE, planetTexture }) => (
            ruby.createRubyPlanetMaterial(THREE, planetTexture)
        ),
        createObjects: ({ THREE, radius, material }) => ({
            corona: ruby.createRubyPlanetCorona(
                THREE,
                radius,
                material?.userData?.rubySolarUniforms
            )
        }),
        update: ({ material, objects, now, camera }) => {
            ruby.updateRubyPlanetSolar(material, now);
            ruby.updateRubyPlanetSolar(objects.corona, now, camera);
        }
    },
    {
        id: 'python',
        language: 'Python',
        cardTheme: CARD_THEMES.python,
        module: python,
        matches: python.isPythonPlanet,
        rotationMultiplier: 0.4,
        createMaterial: ({ THREE, planetTexture }) => (
            python.createPythonPlanetMaterial(THREE, planetTexture)
        ),
        createObjects: ({ THREE, radius, direction }) => ({
            trails: python.createPythonPlanetTrails(
                THREE,
                radius,
                1,
                'y',
                direction
            )
        }),
        update: ({ objects, now }) => (
            python.updatePythonPlanetTrails(objects.trails, now)
        )
    }
];

export const planetFeatures = Object.freeze(FEATURE_DEFINITIONS);

export function resolvePlanetFeature(data) {
    return planetFeatures.find((feature) => feature.matches(data)) || null;
}

export function createPlanetFeatureRuntime({
    THREE,
    planetTexture,
    data,
    radius,
    direction = 1
}) {
    const feature = resolvePlanetFeature(data);
    if (!feature) return null;

    const material = feature.createMaterial({
        THREE,
        planetTexture,
        data,
        radius,
        direction
    });
    const objects = feature.createObjects?.({
        THREE,
        planetTexture,
        data,
        radius,
        direction,
        material
    }) || {};
    const runtime = {
        id: feature.id,
        language: feature.language,
        material,
        objects,
        sceneObjects: Object.values(objects).filter(Boolean),
        rotationMultiplier: feature.rotationMultiplier || 1,
        windAnimationMultiplier: feature.windAnimationMultiplier || 1,
        update(now, context = {}) {
            const updateContext = {
                material,
                objects,
                now,
                camera: context.camera
            };
            if (feature.usesWindSpeed) {
                const rotationSpeed = context.rotationSpeed || 0;
                const baseRotationSpeed = context.baseRotationSpeed || 0.001;
                updateContext.windSpeed = go.calculateGoWindSpeedFactor(
                    rotationSpeed,
                    baseRotationSpeed
                ) * runtime.windAnimationMultiplier;
            }
            feature.update?.(updateContext);
        },
        dispose() {
            feature.dispose?.({ material, objects });
        }
    };
    return runtime;
}

export * from '../c-planet-steel.js';
export * from '../cpp-planet-lightning.js';
export * from '../css-planet-flow.js';
export * from '../go-planet-wind.js';
export * from '../java-planet-soil.js';
export * from '../javascript-planet-reactivity.js';
export * from '../kotlin-planet-crystal.js';
export * from '../perl-planet-ocean.js';
export * from '../python-planet-structure.js';
export * from '../ruby-planet-solar.js';
export * from '../rust-planet-desert.js';
export * from '../swift-planet-feathers.js';
export * from '../typescript-planet-shell.js';
export * from '../vue-planet-circulation.js';
