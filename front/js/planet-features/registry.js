import * as c from '../c-planet-steel.js';
import * as cpp from '../cpp-planet-lightning.js';
import * as css from '../css-planet-flow.js';
import * as go from '../go-planet-wind.js';
import * as java from '../java-planet-soil.js';
import * as javascript from '../javascript-planet-reactivity.js';
import * as kotlin from '../kotlin-planet-crystal.js';
import * as ruby from '../ruby-planet-solar.js';
import * as rust from '../rust-planet-desert.js';
import * as swift from '../swift-planet-feathers.js';
import * as typescript from '../typescript-planet-shell.js';
import * as vue from '../vue-planet-circulation.js';

const FEATURE_DEFINITIONS = [
    {
        id: 'c',
        language: 'C',
        module: c,
        matches: c.isCPlanet,
        createMaterial: ({ THREE, planetTexture }) => (
            c.createCPlanetSteelMaterial(THREE, planetTexture)
        )
    },
    {
        id: 'css',
        language: 'CSS',
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
        id: 'rust',
        language: 'Rust',
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
export * from '../ruby-planet-solar.js';
export * from '../rust-planet-desert.js';
export * from '../swift-planet-feathers.js';
export * from '../typescript-planet-shell.js';
export * from '../vue-planet-circulation.js';
