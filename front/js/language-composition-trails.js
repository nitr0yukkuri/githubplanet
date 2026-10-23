const LANGUAGE_COLORS = Object.freeze({
    javascript: '#f0db4f',
    typescript: '#007acc',
    python: '#306998',
    html: '#e34c26',
    css: '#563d7c',
    ruby: '#cc342d',
    java: '#b07219',
    c: '#555555',
    'c++': '#f34b7d',
    'c#': '#178600',
    go: '#00add8',
    rust: '#dea584',
    php: '#4f5d95',
    swift: '#f05138',
    kotlin: '#a97bff',
    shell: '#89e051',
    dart: '#00b4ab',
    scala: '#c22d40',
    perl: '#0298c3',
    lua: '#000080',
    haskell: '#5e5086',
    r: '#198ce7',
    julia: '#a270ba',
    vue: '#41b883',
    dockerfile: '#384d54',
    svelte: '#ff3e00',
    elixir: '#6e4a7e',
    'objective-c': '#438eff',
    vimscript: '#199f4b',
    batchfile: '#c1f12e',
    powershell: '#012456',
    markdown: '#083fa1',
    json: '#292929',
    yaml: '#cb171e',
    sql: '#e38c00',
    graphql: '#e10098',
    terraform: '#623ce4',
    xml: '#0060ac'
});

const TRAIL_CYCLE_SECONDS = 9;
const TRAIL_MAX_FRAME_SECONDS = 0.08;
const TRAIL_ORBIT_SCALE = 1.34;
const TRAIL_MIN_WIDTH_SCALE = 0.016;
const TRAIL_SHARE_WIDTH_SCALE = 0.06;
const TRAIL_PATHS = Object.freeze([
    Object.freeze([
        [-2.9, -0.22], [-2.05, 0.28], [-1.15, 0.48], [-0.25, 0.16],
        [0.65, -0.36], [1.5, -0.48], [2.35, -0.04], [3, 0.32]
    ]),
    Object.freeze([
        [-2.8, 0.46], [-1.95, 0.05], [-1.05, -0.4], [-0.15, -0.2],
        [0.75, 0.32], [1.6, 0.44], [2.45, 0.06], [3.05, -0.3]
    ])
]);

function normalizedName(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function rankPlanetLanguages(languageStats, mainLanguage = '') {
    const entries = Object.entries(languageStats || {})
        .map(([language, rawBytes]) => ({
            language: typeof language === 'string' ? language.trim() : '',
            bytes: Number(rawBytes)
        }))
        .filter(({ language, bytes }) => language && Number.isFinite(bytes) && bytes > 0)
        .sort((left, right) => right.bytes - left.bytes
            || left.language.toLowerCase().localeCompare(right.language.toLowerCase(), 'en'));

    // 保存済みの主言語を先頭に固定し、過去時点の順位を現在の主言語で上書きしない。
    const mainIndex = entries.findIndex(({ language }) => (
        normalizedName(language) === normalizedName(mainLanguage)
    ));
    if (mainIndex > 0) entries.unshift(entries.splice(mainIndex, 1)[0]);

    const totalBytes = entries.reduce((sum, { bytes }) => sum + bytes, 0);
    return entries.map((entry) => ({
        ...entry,
        share: totalBytes > 0 ? entry.bytes / totalBytes : 0
    }));
}

export function resolveLanguageTrailColor(THREE, language) {
    const normalized = normalizedName(language);
    const knownColor = LANGUAGE_COLORS[normalized];
    if (knownColor) return knownColor;

    // 未登録言語も決定的な色にし、再読込のたびに演出色が変わるのを防ぐ。
    let hash = 2166136261;
    for (const character of normalized) {
        hash = Math.imul(hash ^ character.codePointAt(0), 16777619);
    }
    const hue = ((hash >>> 0) % 360) / 360;
    return `#${new THREE.Color().setHSL(hue, 0.72, 0.64).getHexString()}`;
}

function createTrailCurve(THREE, radius, path) {
    const points = path.map(([longitude, latitude]) => {
        const cosLatitude = Math.cos(latitude);
        return new THREE.Vector3(
            Math.cos(longitude) * cosLatitude,
            Math.sin(latitude),
            Math.sin(longitude) * cosLatitude
        ).multiplyScalar(radius * TRAIL_ORBIT_SCALE);
    });
    return new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.35);
}

function calculateTubeRadius(radius, entry) {
    const share = Math.sqrt(Math.max(0, Math.min(1, entry.share)));
    const minimumRadius = radius * TRAIL_MIN_WIDTH_SCALE;
    const maximumRadius = radius * TRAIL_SHARE_WIDTH_SCALE;
    return minimumRadius + (maximumRadius - minimumRadius) * share;
}

function createTrail(THREE, entry, path, radius, index, direction, timeUniform) {
    const tubeRadius = calculateTubeRadius(radius, entry);
    const geometry = new THREE.TubeGeometry(
        createTrailCurve(THREE, radius, path), 160, tubeRadius, 5, true
    );
    const material = new THREE.ShaderMaterial({
        uniforms: {
            trailColor: { value: new THREE.Color(resolveLanguageTrailColor(THREE, entry.language)) },
            trailOpacity: { value: 0.4 + 0.6 * Math.sqrt(entry.share) },
            trailWidthDelta: { value: 0 },
            trailTime: timeUniform,
            trailOffset: { value: index === 0 ? 0 : 0.5 },
            trailSpeed: { value: direction }
        },
        vertexShader: `
            uniform float trailWidthDelta;
            varying vec2 vTrailUv;
            varying float vTrailFrontness;
            void main() {
                vTrailUv = uv;
                vec3 adjustedPosition = position + normal * trailWidthDelta;
                vec4 worldPosition = modelMatrix * vec4(adjustedPosition, 1.0);
                vTrailFrontness = dot(normalize(worldPosition.xyz), normalize(cameraPosition));
                gl_Position = projectionMatrix * modelViewMatrix * vec4(adjustedPosition, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 trailColor;
            uniform float trailOpacity;
            uniform float trailTime;
            uniform float trailOffset;
            uniform float trailSpeed;
            varying vec2 vTrailUv;
            varying float vTrailFrontness;
            void main() {
                float frontnessFade = smoothstep(-0.16, 0.24, vTrailFrontness);
                float head = fract(trailTime * trailSpeed + trailOffset);
                float behindHead = fract(head - vTrailUv.x);
                float tail = 1.0 - smoothstep(0.0, 0.22, behindHead);
                float headGlow = 1.0 - smoothstep(0.0, 0.028, behindHead);
                float tubeCenter = 1.0 - smoothstep(0.12, 0.5, abs(vTrailUv.y - 0.5));
                float motion = tail * 0.42 + headGlow * 0.58;
                float alpha = motion * tubeCenter * trailOpacity * frontnessFade;
                if (alpha < 0.008) discard;
                gl_FragColor = vec4(trailColor, alpha);
            }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthTest: true,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    material.customProgramCacheKey = () => 'shared-language-composition-motion-v1';
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 1;
    mesh.userData.language = entry.language;
    mesh.userData.languageRank = index + 2;
    mesh.userData.baseTubeRadius = tubeRadius;
    return { mesh, material };
}

export function createLanguageCompositionTrails({ THREE, data, radius, direction = 1 }) {
    const rankedLanguages = rankPlanetLanguages(data?.languageStats, data?.mainLanguage);
    if (!Number.isFinite(radius) || radius <= 0 || rankedLanguages.length === 0) return null;

    const group = new THREE.Group();
    group.name = 'secondary-language-trails';
    const trailTime = { value: 0 };
    const trailDirection = direction < 0 ? -1 : 1;
    const tracks = TRAIL_PATHS.map((path, index) => {
        const entry = rankedLanguages[index + 1] || { language: '', share: 0 };
        const track = createTrail(THREE, entry, path, radius, index, trailDirection, trailTime);
        track.mesh.visible = Boolean(entry.language);
        group.add(track.mesh);
        return track;
    });
    let currentLanguages = rankedLanguages.slice(1, 3);
    let lastMilliseconds = null;

    return {
        group,
        get languages() { return currentLanguages; },
        setLanguageComposition(nextData) {
            const nextLanguages = rankPlanetLanguages(
                nextData?.languageStats,
                nextData?.mainLanguage
            ).slice(1, 3);
            tracks.forEach(({ mesh, material }, index) => {
                const entry = nextLanguages[index];
                mesh.visible = Boolean(entry);
                mesh.userData.language = entry?.language || null;
                mesh.userData.languageRank = index + 2;
                if (!entry) {
                    material.uniforms.trailOpacity.value = 0;
                    material.uniforms.trailWidthDelta.value = 0;
                    return;
                }
                material.uniforms.trailColor.value.set(
                    resolveLanguageTrailColor(THREE, entry.language)
                );
                material.uniforms.trailOpacity.value = 0.4 + 0.6 * Math.sqrt(entry.share);
                material.uniforms.trailWidthDelta.value = calculateTubeRadius(radius, entry)
                    - mesh.userData.baseTubeRadius;
            });
            currentLanguages = nextLanguages;
        },
        dispose() {
            for (const { mesh, material } of tracks) {
                mesh.geometry?.dispose?.();
                material.dispose?.();
            }
        },
        update(now) {
            if (!Number.isFinite(now)) return;
            if (lastMilliseconds === null) {
                lastMilliseconds = now;
                return;
            }
            const elapsedSeconds = Math.min(
                TRAIL_MAX_FRAME_SECONDS,
                Math.max(0, now - lastMilliseconds) / 1000
            );
            lastMilliseconds = now;
            // シェーダーの位相は1周期で繰り返すため、長時間表示でfloat精度が落ちないよう折り返す。
            trailTime.value = (trailTime.value + elapsedSeconds / TRAIL_CYCLE_SECONDS) % 1;
        }
    };
}
