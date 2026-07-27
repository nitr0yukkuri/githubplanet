const CPP_FILAMENT_COUNT = 7;

export function isCppPlanet(data) {
    return data?.mainLanguage?.trim().toLowerCase() === 'c++';
}

export function createCppPlanetLightningMaterial(THREE, planetTexture, planetColor) {
    const material = new THREE.MeshStandardMaterial({
        color: '#07558f',
        aoMap: planetTexture,
        aoMapIntensity: 1.5,
        roughness: 0.8,
        metalness: 0.2
    });
    const uniforms = {
        cppLightningTime: { value: 0 }
    };

    material.onBeforeCompile = (shader) => {
        shader.uniforms.cppLightningTime = uniforms.cppLightningTime;

        shader.vertexShader = shader.vertexShader
            .replace(
                '#include <common>',
                '#include <common>\nvarying vec3 vCppLightningPosition;\nvarying vec3 vCppModelViewX;\nvarying vec3 vCppModelViewY;\nvarying vec3 vCppModelViewZ;'
            )
            .replace(
                '#include <defaultnormal_vertex>',
                '#include <defaultnormal_vertex>\nvCppLightningPosition = transformedNormal;\nvCppModelViewX = modelViewMatrix[0].xyz;\nvCppModelViewY = modelViewMatrix[1].xyz;\nvCppModelViewZ = modelViewMatrix[2].xyz;'
            );

        shader.fragmentShader = shader.fragmentShader
            .replace(
                '#include <common>',
                `#include <common>
uniform float cppLightningTime;
varying vec3 vCppLightningPosition;
varying vec3 vCppModelViewX;
varying vec3 vCppModelViewY;
varying vec3 vCppModelViewZ;

float cppLightningHash(float value) {
    return fract(sin(value * 127.1) * 43758.5453123);
}

float cppLightningSmoothNoise(float position, float seed) {
    float cell = floor(position);
    float offset = fract(position);
    float smoothOffset = offset * offset * (3.0 - 2.0 * offset);
    return mix(
        cppLightningHash(cell + seed * 97.3),
        cppLightningHash(cell + 1.0 + seed * 97.3),
        smoothOffset
    );
}

float cppLightningAngleDistance(float first, float second) {
    float difference = first - second;
    return abs(atan(sin(difference), cos(difference)));
}`
            )
            .replace(
                '#include <map_fragment>',
                `#include <map_fragment>
vec3 cppSurfacePosition = normalize(vCppLightningPosition);
vec2 cppPlasmaPosition = cppSurfacePosition.xy;
float cppPlasmaRadius = length(cppPlasmaPosition);
float cppPlasmaAngle = atan(cppPlasmaPosition.y, cppPlasmaPosition.x);
float cppFilamentCoreStrength = 0.0;
float cppFilamentGlowStrength = 0.0;
float cppContactStrength = 0.0;
mat3 cppModelViewRotation = mat3(vCppModelViewX, vCppModelViewY, vCppModelViewZ);

for (int cppIndex = 0; cppIndex < ${CPP_FILAMENT_COUNT}; cppIndex++) {
    float cppIndexValue = float(cppIndex);
    float cppSeed = cppLightningHash(cppIndexValue * 19.7 + 2.4);
    float cppBaseAngle = cppIndexValue * 2.39996322973 + cppSeed * 0.38;
    float cppObjectAngle = cppBaseAngle;
    vec3 cppObjectDirection = normalize(vec3(
        cos(cppObjectAngle),
        sin(cppObjectAngle),
        (cppSeed - 0.5) * 0.9
    ));
    vec3 cppViewDirection = normalize(cppModelViewRotation * cppObjectDirection);
    float cppPathDrift = 0.0;
    float cppDirectionJitter = (cppLightningSmoothNoise(cppIndexValue * 3.7, cppSeed) - 0.5) * 0.035;
    float cppTargetAngle = atan(cppViewDirection.y, cppViewDirection.x) + cppDirectionJitter;

    float cppNaturalBend = (cppLightningSmoothNoise(cppPlasmaRadius * 8.5 + cppPathDrift, cppSeed) - 0.5) * 0.14;
    float cppFineBend = (cppLightningSmoothNoise(cppPlasmaRadius * 23.0 - cppPathDrift * 0.6, cppSeed + 4.7) - 0.5) * 0.018;
    float cppOuterTurnStart = 0.67 + cppLightningHash(cppSeed * 31.7 + 8.4) * 0.07;
    float cppOuterTurnDirection = cppLightningHash(cppSeed * 47.3 + 2.9) < 0.5 ? -1.0 : 1.0;
    float cppOuterTurn = smoothstep(cppOuterTurnStart, cppOuterTurnStart + 0.05, cppPlasmaRadius)
        * cppOuterTurnDirection * (0.045 + cppLightningHash(cppSeed * 59.1) * 0.055);
    float cppFilamentAngle = cppTargetAngle
        + (cppNaturalBend + cppFineBend) * (0.3 + cppPlasmaRadius)
        + cppOuterTurn;
    float cppAngularDistance = cppLightningAngleDistance(cppPlasmaAngle, cppFilamentAngle)
        * max(cppPlasmaRadius, 0.12);

    float cppRadialMask = smoothstep(0.05, 0.105, cppPlasmaRadius)
        * (1.0 - smoothstep(0.965, 1.0, cppPlasmaRadius));
    float cppCore = 1.0 - smoothstep(0.0022, 0.0065, cppAngularDistance);
    float cppGlow = 1.0 - smoothstep(0.007, 0.034, cppAngularDistance);

    float cppBranchStart = 0.76 + cppLightningHash(cppSeed * 13.7 + 4.9) * 0.06;
    float cppBranchEnabled = step(0.48, cppLightningHash(cppIndexValue * 37.1 + 5.3));
    float cppBranchDirection = cppLightningHash(cppSeed * 21.3 + 9.6) < 0.5 ? -1.0 : 1.0;
    float cppBranchProgress = smoothstep(cppBranchStart, 0.965, cppPlasmaRadius);
    float cppBranchBendA = (cppLightningSmoothNoise(cppPlasmaRadius * 14.0 + cppPathDrift * 0.7, cppSeed + 11.0) - 0.5) * 0.014;
    float cppBranchBendB = (cppLightningSmoothNoise(cppPlasmaRadius * 16.0 - cppPathDrift * 0.5, cppSeed + 17.0) - 0.5) * 0.013;
    float cppBranchSpreadA = cppBranchProgress * cppBranchDirection
        * (0.08 + cppLightningHash(cppSeed * 37.1) * 0.06);
    float cppBranchSpreadB = cppBranchProgress * -cppBranchDirection
        * (0.07 + cppLightningHash(cppSeed * 43.9) * 0.05);
    float cppBranchAngleA = cppFilamentAngle + cppBranchSpreadA + cppBranchBendA * cppBranchProgress;
    float cppBranchAngleB = cppFilamentAngle + cppBranchSpreadB + cppBranchBendB * cppBranchProgress;
    float cppBranchDistanceA = cppLightningAngleDistance(cppPlasmaAngle, cppBranchAngleA)
        * max(cppPlasmaRadius, 0.12);
    float cppBranchDistanceB = cppLightningAngleDistance(cppPlasmaAngle, cppBranchAngleB)
        * max(cppPlasmaRadius, 0.12);
    float cppBranchMask = smoothstep(cppBranchStart, cppBranchStart + 0.035, cppPlasmaRadius)
        * (1.0 - smoothstep(0.965, 0.995, cppPlasmaRadius));
    float cppBranchCoreA = (1.0 - smoothstep(0.0017, 0.0046, cppBranchDistanceA)) * cppBranchMask * cppBranchEnabled;
    float cppBranchCoreB = (1.0 - smoothstep(0.0016, 0.0043, cppBranchDistanceB)) * cppBranchMask * cppBranchEnabled;
    float cppBranchGlowA = (1.0 - smoothstep(0.0045, 0.016, cppBranchDistanceA)) * cppBranchMask * cppBranchEnabled;
    float cppBranchGlowB = (1.0 - smoothstep(0.0042, 0.014, cppBranchDistanceB)) * cppBranchMask * cppBranchEnabled;

    float cppFineFlicker = 0.78 + 0.22 * sin(cppLightningTime * (48.0 + cppSeed * 13.0) + cppSeed * 41.0);
    float cppSlowBreath = 0.86 + 0.14 * sin(cppLightningTime * (1.4 + cppSeed * 0.45) + cppIndexValue * 1.7);
    float cppFilamentPresence = 0.48 + cppLightningHash(cppIndexValue * 53.7 + 11.4) * 0.52;
    float cppSingleStrength = cppFineFlicker * cppSlowBreath * cppFilamentPresence * cppRadialMask;
    float cppTravelPulse = 0.8 + 0.2 * sin(cppPlasmaRadius * 68.0 - cppLightningTime * 19.0 + cppSeed * 31.0);
    float cppTrunkMask = 1.0 - cppBranchEnabled
        * smoothstep(cppBranchStart + 0.02, cppBranchStart + 0.075, cppPlasmaRadius);
    cppFilamentCoreStrength += cppSingleStrength * (
        cppCore * cppTravelPulse * cppTrunkMask
        + cppBranchCoreA * 0.76
        + cppBranchCoreB * 0.7
    );
    cppFilamentGlowStrength += cppSingleStrength * (
        cppGlow * 0.48 * cppTrunkMask
        + cppBranchGlowA * 0.24
        + cppBranchGlowB * 0.22
    );

    float cppContactRadius = 1.0 - smoothstep(0.0, 0.035, abs(cppPlasmaRadius - 0.955));
    float cppContactAngle = 1.0 - smoothstep(0.006, 0.032, cppAngularDistance);
    float cppBranchContactA = 1.0 - smoothstep(0.005, 0.026, cppBranchDistanceA);
    float cppBranchContactB = 1.0 - smoothstep(0.005, 0.024, cppBranchDistanceB);
    cppContactStrength += cppSlowBreath * cppContactRadius * (
        (1.0 - cppBranchEnabled) * cppContactAngle
        + cppBranchEnabled * (cppBranchContactA * 0.62 + cppBranchContactB * 0.56)
    );
}

float cppRimFrame = floor(cppLightningTime * 16.0);
float cppRimSectorCount = 31.0;
float cppRimCoordinate = (cppPlasmaAngle + 3.14159265359) / 6.28318530718 * cppRimSectorCount;
float cppRimSector = floor(cppRimCoordinate);
float cppRimSeed = cppLightningHash(cppRimSector * 7.9 + cppRimFrame * 19.1);
float cppRimActive = step(0.65, cppRimSeed);
float cppRimOffset = (cppLightningHash(cppRimSector * 13.7 + 3.2) - 0.5) * 0.62;
float cppRimAngle = ((cppRimSector + 0.5 + cppRimOffset) / cppRimSectorCount) * 6.28318530718 - 3.14159265359;
float cppRimAngularDistance = cppLightningAngleDistance(cppPlasmaAngle, cppRimAngle)
    * max(cppPlasmaRadius, 0.9);
float cppRimLength = 0.025 + cppLightningHash(cppRimSector * 31.7 + cppRimFrame * 2.3) * 0.055;
float cppRimRadialMask = smoothstep(1.0 - cppRimLength, 0.988, cppPlasmaRadius)
    * (1.0 - smoothstep(0.985, 1.0, cppPlasmaRadius));
float cppRimNeedle = 1.0 - smoothstep(0.0015, 0.008, cppRimAngularDistance);
float cppRimFlicker = 0.72 + cppLightningHash(cppRimSector * 5.1 + cppRimFrame * 37.7) * 0.28;
float cppRimSparkStrength = cppRimActive * cppRimRadialMask * cppRimNeedle * cppRimFlicker;

float cppCoreBeat = 0.5 + 0.5 * sin(cppLightningTime * 5.2);
float cppElectrodePulse = 0.88 + 0.12 * cppCoreBeat;
float cppElectrodeHot = (1.0 - smoothstep(0.006, 0.022, cppPlasmaRadius)) * cppElectrodePulse;
float cppElectrodeCore = (1.0 - smoothstep(0.022, 0.082, cppPlasmaRadius)) * cppElectrodePulse;
float cppCoreSectorCount = 13.0;
float cppCoreCoordinate = (cppPlasmaAngle + 3.14159265359) / 6.28318530718 * cppCoreSectorCount;
float cppCoreSector = floor(cppCoreCoordinate);
float cppCoreNoise = cppLightningHash(cppCoreSector * 11.7 + 29.3);
float cppElectrodeHalo = (1.0 - smoothstep(0.055, 0.17, cppPlasmaRadius))
    * (0.11 + cppCoreNoise * 0.09) * cppElectrodePulse;
float cppCoreSparkActive = step(0.38, cppCoreNoise);
float cppCoreSparkOffset = (cppLightningHash(cppCoreSector * 17.9 + 6.1) - 0.5) * 0.54;
float cppCoreSparkSway = sin(cppLightningTime * 5.2 + cppCoreSector * 1.37) * 0.012;
float cppCoreSparkAngle = ((cppCoreSector + 0.5 + cppCoreSparkOffset) / cppCoreSectorCount)
    * 6.28318530718 - 3.14159265359 + cppCoreSparkSway;
float cppCoreSparkDistance = cppLightningAngleDistance(cppPlasmaAngle, cppCoreSparkAngle)
    * max(cppPlasmaRadius, 0.06);
float cppCoreSparkLength = (0.12 + cppLightningHash(cppCoreSector * 41.3 + 3.7) * 0.07)
    * (0.96 + 0.04 * cppCoreBeat);
float cppCoreSparkMask = smoothstep(0.045, 0.065, cppPlasmaRadius)
    * (1.0 - smoothstep(cppCoreSparkLength - 0.025, cppCoreSparkLength, cppPlasmaRadius));
float cppCoreSparkNeedle = 1.0 - smoothstep(0.0014, 0.006, cppCoreSparkDistance);
float cppCoreSparkStrength = cppCoreSparkActive * cppCoreSparkMask * cppCoreSparkNeedle
    * (0.68 + cppLightningHash(cppCoreSector * 7.1 + 43.7) * 0.32)
    * (0.72 + 0.28 * cppCoreBeat);
float cppOuterColorMix = smoothstep(0.72, 0.97, cppPlasmaRadius);
vec3 cppFilamentColor = vec3(0.76, 0.8, 1.0);
vec3 cppHaloColor = vec3(0.56, 0.2, 0.8);
vec3 cppContactColor = vec3(1.0, 0.28, 0.54);
vec3 cppElectrodeColor = vec3(0.96, 0.36, 0.68);
vec3 cppElectrodeHotColor = vec3(0.82, 0.9, 1.0);
vec3 cppCoreCoronaColor = vec3(0.56, 0.32, 1.0);
vec3 cppRimColor = vec3(0.78, 0.68, 1.0);
vec3 cppRadialColor = mix(cppFilamentColor, cppContactColor, cppOuterColorMix);
float cppPlasmaStrength = min(cppFilamentCoreStrength + cppFilamentGlowStrength + cppContactStrength * 0.28
    + cppRimSparkStrength * 0.72 + cppCoreSparkStrength * 0.58, 1.0);
vec3 cppPlasmaColor = mix(cppHaloColor, cppRadialColor, clamp(cppFilamentCoreStrength * 1.45 + cppContactStrength, 0.0, 1.0));
cppPlasmaColor = mix(cppPlasmaColor, cppRimColor, clamp(cppRimSparkStrength, 0.0, 1.0));
vec3 cppElectrodeLayerColor = mix(cppCoreCoronaColor, cppElectrodeColor, clamp(cppElectrodeCore * 1.3, 0.0, 1.0));
cppElectrodeLayerColor = mix(cppElectrodeLayerColor, cppElectrodeHotColor, clamp(cppElectrodeHot, 0.0, 1.0));
float cppElectrodeInfluence = clamp(cppElectrodeHot + cppElectrodeCore + cppElectrodeHalo + cppCoreSparkStrength * 0.75, 0.0, 1.0);
float cppPlasmaBlend = clamp(cppPlasmaStrength * 0.44 + cppElectrodeHot * 0.82
    + cppElectrodeCore * 0.68 + cppElectrodeHalo + cppCoreSparkStrength * 0.52, 0.0, 0.96);
cppPlasmaColor = mix(cppPlasmaColor, cppElectrodeLayerColor, cppElectrodeInfluence);
diffuseColor.rgb = mix(diffuseColor.rgb, cppPlasmaColor, cppPlasmaBlend);`
            )
            .replace(
                '#include <emissivemap_fragment>',
                '#include <emissivemap_fragment>\ntotalEmissiveRadiance += cppRadialColor * cppFilamentCoreStrength * 0.68;\ntotalEmissiveRadiance += cppHaloColor * cppFilamentGlowStrength * 0.3;\ntotalEmissiveRadiance += cppContactColor * cppContactStrength * 0.38;\ntotalEmissiveRadiance += cppRimColor * cppRimSparkStrength * 0.68;\ntotalEmissiveRadiance += cppElectrodeHotColor * cppElectrodeHot * 0.9;\ntotalEmissiveRadiance += cppElectrodeColor * cppElectrodeCore * 0.74;\ntotalEmissiveRadiance += cppCoreCoronaColor * (cppElectrodeHalo * 0.36 + cppCoreSparkStrength * 0.76);'
            );
    };

    material.customProgramCacheKey = () => 'cpp-planet-idle-plasma-globe-v12-stable-filament-path';
    material.userData.cppLightningUniforms = uniforms;
    material.userData.cppLightningStartMilliseconds = null;
    return material;
}

export function updateCppPlanetLightning(material, nowMilliseconds) {
    const uniforms = material?.userData?.cppLightningUniforms;
    if (!uniforms) return;
    if (material.userData.cppLightningStartMilliseconds === null) {
        material.userData.cppLightningStartMilliseconds = nowMilliseconds;
    }
    uniforms.cppLightningTime.value = (
        nowMilliseconds - material.userData.cppLightningStartMilliseconds
    ) / 1000;
}
