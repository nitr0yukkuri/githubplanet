import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import anime from 'animejs';
import { io } from 'socket.io-client';
import { createCssPlanetFlowMaterial, isCssPlanet, updateCssPlanetFlow } from './css-planet-flow.js';
import { createCPlanetSteelMaterial, isCPlanet } from './c-planet-steel.js';
import { createCppPlanetLightningMaterial, isCppPlanet, updateCppPlanetLightning } from './cpp-planet-lightning.js';
import {
    createGoPlanetAtmosphere,
    createGoPlanetWindMaterial,
    calculateGoWindSpeedFactor,
    isGoPlanet,
    updateGoPlanetAtmosphere,
    updateGoPlanetWind
} from './go-planet-wind.js';
import {
    createTypeScriptPlanetMaterial,
    createTypeScriptPlanetShell,
    isTypeScriptPlanet,
    updateTypeScriptPlanetShell
} from './typescript-planet-shell.js';
import {
    createJavaScriptPlanetMaterial,
    isJavaScriptPlanet,
    updateJavaScriptPlanetReactivity
} from './javascript-planet-reactivity.js';
import { applyI18n, localizedPath, localizedPlanetName, localizedTitle, t } from './i18n.js';

const MAX_STAR_COUNT = 120;
const BASE_PLANET_ROTATION_SPEED = 0.001;

let scene, camera, renderer, controls, planetGroup;
let cssPlanetMaterial = null;
let cppPlanetMaterial = null;
let goPlanetWindMaterial = null;
let goPlanetAtmosphere = null;
let typeScriptPlanetMaterial = null;
let typeScriptPlanetShell = null;
let javaScriptPlanetMaterial = null;

let welcomeModal, okButton, mainUiWrapper;
let isFetchingRandomPlanet = false;
let lastRandomVisitTime = 0;
let planetRotationSpeed = BASE_PLANET_ROTATION_SPEED;
let loggedInUsername = null; // ★追加: ログインユーザー名を保持

// ローディングオーバーレイ
let loadingOverlay;

// テクスチャのキャッシュ
let cachedPlanetTexture = null;

const textureLoader = new THREE.TextureLoader();

const socket = io({
    transports: ['websocket']
});

function toggleLoading(show) {
    if (!loadingOverlay) return;
    if (show) {
        loadingOverlay.style.opacity = '1';
        loadingOverlay.style.pointerEvents = 'auto';
    } else {
        loadingOverlay.style.opacity = '0';
        loadingOverlay.style.pointerEvents = 'none';
    }
}

function showPlanetProgressToast(progressNotice = {}) {
    const achievementIds = Array.isArray(progressNotice.newlyUnlockedAchievementIds)
        ? progressNotice.newlyUnlockedAchievementIds
        : [];
    const contributionDelta = Math.max(0, Number(progressNotice.contributionDelta) || 0);
    if (achievementIds.length === 0 && contributionDelta === 0) return;

    document.querySelector('.achievement-unlock-toast')?.remove();

    const toast = document.createElement('aside');
    toast.className = 'achievement-unlock-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');

    const header = document.createElement('div');
    header.className = 'achievement-unlock-header';

    const title = document.createElement('strong');
    title.textContent = achievementIds.length > 0
        ? t('home.newAchievementsTitle', { count: achievementIds.length })
        : t('home.contributionGrowthTitle', {
            count: new Intl.NumberFormat(document.documentElement.lang || undefined).format(contributionDelta)
        });

    const closeButton = document.createElement('button');
    closeButton.className = 'achievement-unlock-close';
    closeButton.type = 'button';
    closeButton.textContent = '×';
    closeButton.setAttribute('aria-label', t('home.closeAchievementNotice'));
    closeButton.title = t('home.closeAchievementNotice');

    const dismiss = () => {
        toast.classList.remove('is-visible');
        window.setTimeout(() => toast.remove(), 220);
    };

    closeButton.addEventListener('click', dismiss);
    header.append(title, closeButton);
    toast.append(header);

    if (achievementIds.length > 0) {
        const names = document.createElement('p');
        names.className = 'achievement-unlock-names';
        const visibleIds = achievementIds.slice(0, 3);
        names.textContent = visibleIds
            .map((id) => t(`achievements.names.${id}`))
            .join(' / ');
        if (achievementIds.length > visibleIds.length) {
            names.textContent += ` ${t('home.newAchievementsMore', {
                count: achievementIds.length - visibleIds.length
            })}`;
        }

        const link = document.createElement('a');
        link.className = 'achievement-unlock-link';
        link.href = localizedPath('/achievements');
        link.textContent = t('home.viewAchievements');
        toast.append(names, link);
    }
    document.body.appendChild(toast);
    window.requestAnimationFrame(() => toast.classList.add('is-visible'));
    window.setTimeout(dismiss, 7000);
}

function showLocalAchievementPreview() {
    const isLocal = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
    const isPreview = new URLSearchParams(window.location.search).has('preview-achievement');
    if (!isLocal || !isPreview) return;

    showPlanetProgressToast({
        contributionDelta: 128,
        newlyUnlockedAchievementIds: [
            'FIRST_PLANET',
            'FIRST_COMMIT',
            'COMMIT_100',
            'POLYGLOT_PIONEER'
        ]
    });
}

async function fetchMyPlanetData() {
    try {
        const res = await fetch(`/api/me?t=${Date.now()}`, { cache: 'no-store' });

        if (!res.ok) return null;
        const data = await res.json();
        showPlanetProgressToast(data.progressNotice);

        if (data.planetData && data.user) {
            loggedInUsername = data.user.login; // ★追加: ログインユーザー名を保存
            data.planetData.username = data.user.login;

            // ★修正: どの惑星を見ていても、カード作成は常に自分のユーザー名で行うように固定
            const cardLink = document.getElementById('card-link');
            if (cardLink) {
                cardLink.href = `${localizedPath('/card.html')}?username=${loggedInUsername}`;
            }

            return data.planetData;
        }
        return null;

    } catch (e) { return null; }
}

function updatePlanetDetails(data) {
    const stats = document.getElementById('lang-stats-container');
    const commits = document.getElementById('commit-count-val');
    const name = document.getElementById('planet-name-val');
    const title = document.getElementById('planet-title-val');

    console.log('updatePlanetDetails called with:', data);

    if (stats) {
        stats.innerHTML = '';

        if (data.languageStats) {
            const entries = Object.entries(data.languageStats);

            if (entries.length > 0) {
                const total = entries.reduce((sum, [, bytes]) => sum + bytes, 0);

                if (total > 0) {
                    entries
                        .sort(([, a], [, b]) => b - a)
                        .slice(0, 3)
                        .forEach(([lang, bytes]) => {
                            const p = document.createElement('p');
                            const rawPercentage = (bytes / total) * 100;
                            const percentage = rawPercentage <= 1
                                ? rawPercentage.toFixed(1)
                                : Math.round(rawPercentage);
                            p.innerHTML = `${lang}<span>${percentage}%</span>`;
                            stats.appendChild(p);
                        });
                }
            }
        }
    }

    if (commits) {
        const commitCount = (data.totalCommits !== null && data.totalCommits !== undefined) ? data.totalCommits : 0;
        commits.textContent = commitCount;
    }

    if (title) {
        if (data.activeTitle) {
            title.textContent = localizedTitle(data.activeTitle);
        } else {
            title.textContent = '';
        }
    }

    if (name) {
        name.textContent = localizedPlanetName(data);
    }
}

function calculateStarCount(totalCommits) {
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

function loadPlanetTexture() {
    if (cachedPlanetTexture) return Promise.resolve(cachedPlanetTexture);
    return new Promise((resolve) => {
        textureLoader.load('/front/img/2k_mars.jpg', (tex) => {
            cachedPlanetTexture = tex;
            resolve(tex);
        });
    });
}

function disposeObject(obj) {
    if (!obj) return;

    if (obj.children) {
        for (let i = obj.children.length - 1; i >= 0; i--) {
            disposeObject(obj.children[i]);
            obj.remove(obj.children[i]);
        }
    }

    if (obj.geometry) {
        obj.geometry.dispose();
    }

    if (obj.material) {
        if (Array.isArray(obj.material)) {
            obj.material.forEach(m => {
                if (m.map) m.map.dispose();
                if (m.aoMap && m.aoMap !== cachedPlanetTexture) m.aoMap.dispose();
                m.dispose();
            });
        } else {
            if (obj.material.map) obj.material.map.dispose();
            if (obj.material.aoMap && obj.material.aoMap !== cachedPlanetTexture) obj.material.aoMap.dispose();
            obj.material.dispose();
        }
    }
}

async function loadPlanet(data) {
    const ownerDisplay = document.getElementById('planet-owner-display');
    const profileLink = document.getElementById('github-profile-link');
    if (ownerDisplay) ownerDisplay.style.display = 'none';
    if (profileLink) profileLink.style.display = 'none';

    if (!data) return;

    console.log('loadPlanet called with data:', data);

    const returnBtn = document.getElementById('return-my-planet-btn');
    const nextRandomBtn = document.getElementById('next-random-planet-btn');
    const isViewingOtherPlanet = Boolean(
        data.username && (!loggedInUsername || loggedInUsername !== data.username)
    );

    if (returnBtn) {
        returnBtn.style.display = loggedInUsername && isViewingOtherPlanet ? 'block' : 'none';
    }
    if (nextRandomBtn) {
        nextRandomBtn.style.display = isViewingOtherPlanet ? 'block' : 'none';
    }

    let wCommits = data.weeklyCommits;
    if ((!wCommits || wCommits === 0) && data.totalCommits > 0) {
        wCommits = Math.ceil(data.totalCommits * 0.02);
    }

    const rotationCommits = Math.min(Math.max(Number(wCommits) || 0, 0), 100);
    planetRotationSpeed = BASE_PLANET_ROTATION_SPEED + (rotationCommits * 0.0001);

    if (ownerDisplay && data.username) {
        ownerDisplay.textContent = t('home.ownerPlanet', { username: data.username });
        ownerDisplay.style.display = 'inline-block';
    }
    if (profileLink && data.username) {
        profileLink.href = `https://github.com/${data.username}`;
        profileLink.style.display = 'flex';
    }

    // ★修正: 他人の惑星を見ているときでも自分のカードを作れるよう、ここではカードリンクを書き換えない
    // (fetchMyPlanetDataで設定した自分のリンクを維持する)

    updatePlanetDetails(data);

    if (planetGroup) {
        disposeObject(planetGroup);
        scene.remove(planetGroup);
        planetGroup = undefined;
    }
    cssPlanetMaterial = null;
    cppPlanetMaterial = null;
    goPlanetWindMaterial = null;
    goPlanetAtmosphere = null;
    typeScriptPlanetMaterial = null;
    typeScriptPlanetShell = null;
    javaScriptPlanetMaterial = null;

    planetGroup = new THREE.Group();

    const tex = await loadPlanetTexture();

    const geo = new THREE.SphereGeometry(4, 32, 32);
    let mat;
    if (isCPlanet(data)) {
        mat = createCPlanetSteelMaterial(THREE, tex);
    } else if (isCssPlanet(data)) {
        mat = createCssPlanetFlowMaterial(THREE, tex);
        cssPlanetMaterial = mat;
    } else if (isCppPlanet(data)) {
        mat = createCppPlanetLightningMaterial(THREE, tex, data.planetColor);
        cppPlanetMaterial = mat;
    } else if (isGoPlanet(data)) {
        mat = createGoPlanetWindMaterial(THREE, tex, 1);
        goPlanetWindMaterial = mat;
    } else if (isTypeScriptPlanet(data)) {
        mat = createTypeScriptPlanetMaterial(THREE, tex);
        typeScriptPlanetMaterial = mat;
    } else if (isJavaScriptPlanet(data)) {
        mat = createJavaScriptPlanetMaterial(THREE, tex, data.planetColor);
        javaScriptPlanetMaterial = mat;
    } else {
        mat = new THREE.MeshStandardMaterial({
            color: data.planetColor ? new THREE.Color(data.planetColor).getHex() : 0x808080,
            metalness: 0.2, roughness: 0.8, aoMapIntensity: 1.5,
            aoMap: tex
        });
    }

    const planet = new THREE.Mesh(geo, mat);
    planet.geometry.setAttribute('uv2', new THREE.BufferAttribute(geo.attributes.uv.array, 2));
    const s = data.planetSizeFactor || 1.0;
    planetGroup.add(planet);
    if (isGoPlanet(data)) {
        goPlanetAtmosphere = createGoPlanetAtmosphere(THREE, 4, 1);
        planetGroup.add(goPlanetAtmosphere);
    }
    if (isTypeScriptPlanet(data)) {
        typeScriptPlanetShell = createTypeScriptPlanetShell(THREE, 4);
        planetGroup.add(typeScriptPlanetShell);
    }

    const starCount = calculateStarCount(data.totalCommits || 0);

    if (starCount > 0) {
        const vertices = [];
        const starBaseRadius = 7;

        for (let i = 0; i < starCount; i++) {
            const phi = Math.random() * Math.PI * 2;
            const theta = Math.random() * Math.PI;
            const radius = starBaseRadius + (Math.random() * 2);

            const x = radius * Math.sin(theta) * Math.cos(phi);
            const y = radius * Math.sin(theta) * Math.sin(phi);
            const z = radius * Math.cos(theta);
            vertices.push(x, y, z);
        }

        const starGeometry = new THREE.BufferGeometry();
        starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));

        const vertexShader = `
            uniform float pixelRatio;
            void main() {
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                gl_Position = projectionMatrix * mvPosition;
                gl_PointSize = (800.0 * pixelRatio) / -mvPosition.z;
            }
        `;

        const fragmentShader = `
            void main() {
                vec2 p = gl_PointCoord * 2.0 - 1.0; 
                float r = length(p); 
                if (r > 1.0) discard; 

                float core = 1.0 - smoothstep(0.0, 0.05, r);
                float a = atan(p.y, p.x); 
                float numRays = 4.0; 
                float rayIntensity = pow(abs(cos(a * numRays / 2.0)), 30.0);
                float rayFalloff = 1.0 - smoothstep(0.0, 1.0, r);
                rayFalloff = pow(rayFalloff, 2.0); 
                float rays = rayIntensity * rayFalloff * 2.5; 
                float glow = 1.0 - smoothstep(0.0, 1.0, r);
                glow = pow(glow, 4.0); 
                float alpha = core * 2.0 + rays + glow * 1.0;
                alpha = clamp(alpha, 0.0, 1.0); 

                gl_FragColor = vec4(1.0, 1.0, 1.0, alpha);
            }
        `;

        const starMaterial = new THREE.ShaderMaterial({
            uniforms: {
                pixelRatio: { value: renderer.getPixelRatio() }
            },
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            blending: THREE.AdditiveBlending,
            transparent: true,
            depthWrite: false
        });

        const stars = new THREE.Points(starGeometry, starMaterial);
        planetGroup.add(stars);
    }

    if (starCount > 0) {
        const auraGeo = new THREE.SphereGeometry(4.05, 32, 32);
        const auraVertexShader = `
            varying vec3 vNormal;
            varying vec3 vViewPosition;
            void main() {
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                vViewPosition = -mvPosition.xyz; 
                vNormal = normalize(normalMatrix * normal); 
                gl_Position = projectionMatrix * mvPosition;
            }
        `;
        const auraFragmentShader = `
            uniform vec3 glowColor;
            uniform float intensity; 
            varying vec3 vNormal;
            varying vec3 vViewPosition;
            void main() {
                float fresnel = dot(normalize(vViewPosition), vNormal);
                fresnel = 1.0 - fresnel; 
                fresnel = pow(fresnel, 3.0); 

                float alpha = fresnel * intensity;
                alpha = clamp(alpha, 0.0, 1.0); 

                gl_FragColor = vec4(glowColor, alpha);
            }
        `;
        const auraIntensity = Math.min(3.0, (starCount / 5.0) * 0.3);

        const auraMat = new THREE.ShaderMaterial({
            uniforms: {
                glowColor: { value: new THREE.Color(data.planetColor ? data.planetColor : 0x808080) },
                intensity: { value: auraIntensity }
            },
            vertexShader: auraVertexShader,
            fragmentShader: auraFragmentShader,
            transparent: true,
            blending: THREE.AdditiveBlending,
            side: THREE.FrontSide
        });

        const aura = new THREE.Mesh(auraGeo, auraMat);
        planetGroup.add(aura);
    }

    const shockwaveGeo = new THREE.SphereGeometry(1, 32, 32);
    const shockwaveMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(data.planetColor ? data.planetColor : 0xffffff),
        transparent: true,
        blending: THREE.AdditiveBlending,
        opacity: 0.0
    });
    const shockwave = new THREE.Mesh(shockwaveGeo, shockwaveMat);

    planetGroup.scale.set(0, 0, 0);
    shockwave.scale.set(0, 0, 0);
    shockwave.visible = false;

    scene.add(planetGroup);
    scene.add(shockwave);

    const tl = anime.timeline({
        easing: 'easeOutExpo',
        complete: () => {
            scene.remove(shockwave);
            shockwaveGeo.dispose();
            shockwaveMat.dispose();
        }
    });

    const initialDelay = 500;

    tl.add({
        targets: shockwave.material,
        begin: function () {
            shockwave.visible = true;
        },
        opacity: [
            { value: 1.0, duration: 0 },
            { value: 0.0, duration: 400, easing: 'easeInExpo' }
        ],
        update: () => { shockwave.material.needsUpdate = true; }
    }, initialDelay);

    tl.add({
        targets: shockwave.scale,
        x: 15,
        y: 15,
        z: 15,
        duration: 400
    }, initialDelay);

    tl.add({
        targets: planetGroup.scale,
        x: s,
        y: s,
        z: s,
        duration: 1200,
        easing: 'easeOutElastic(1, .8)'
    }, initialDelay + 100);

    planetGroup.rotation.x = Math.PI * 0.4; planetGroup.rotation.y = Math.PI * 0.1;

    const msg = document.getElementById('not-logged-in-container');
    if (msg) msg.style.display = 'none';
    controls.enabled = true;
}

function spawnMeteor(data) {
    if (!scene || !camera) return;

    // ★追加: サーバーから scale を受け取る（なければ 1.0）
    const scale = data.scale || 1.0;

    const baseColor = new THREE.Color(data.color || '#ffffff');
    const meteorGroup = new THREE.Group();
    meteorGroup.renderOrder = 9999;

    const starShape = new THREE.Shape();
    const points = 5;
    const outerRadius = 0.7;
    const innerRadius = 0.35;

    for (let i = 0; i < points * 2; i++) {
        const angle = (i * Math.PI) / points;
        const radius = i % 2 === 0 ? outerRadius : innerRadius;
        const x = Math.sin(angle) * radius;
        const y = Math.cos(angle) * radius;
        if (i === 0) starShape.moveTo(x, y);
        else starShape.lineTo(x, y);
    }
    starShape.closePath();

    const headGeo = new THREE.ExtrudeGeometry(starShape, {
        depth: 0.15,
        bevelEnabled: false
    });
    headGeo.center();

    const headMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.0,
        blending: THREE.AdditiveBlending,
        depthTest: true,
        depthWrite: true,
        fog: false
    });
    const head = new THREE.Mesh(headGeo, headMat);
    meteorGroup.add(head);

    const tailLength = 60;
    const glowGeo = new THREE.CylinderGeometry(1.0, 0.0, tailLength * 0.9, 16, 1, true);
    glowGeo.translate(0, -tailLength / 2 + 0.5, 0);
    glowGeo.rotateX(Math.PI / 2);

    const glowMat = new THREE.MeshBasicMaterial({
        color: baseColor,
        transparent: true,
        opacity: 0.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        depthTest: true,
        fog: false
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    meteorGroup.add(glow);

    const startZ = -60 - Math.random() * 40;
    const startY = 30 + Math.random() * 20;

    const localStart = new THREE.Vector3(120, startY, startZ);
    const localEnd = new THREE.Vector3(-120, startY - 10, startZ);

    const startPos = localStart.applyQuaternion(camera.quaternion).add(camera.position);
    const endPos = localEnd.applyQuaternion(camera.quaternion).add(camera.position);

    meteorGroup.position.copy(startPos);
    meteorGroup.lookAt(endPos);
    meteorGroup.scale.set(0, 0, 0);

    scene.add(meteorGroup);

    // ★修正: 重厚感の演出 (scale > 3.0 なら遅くする)
    let baseDuration = 1000 + Math.random() * 500;
    if (scale > 3.0) {
        baseDuration = baseDuration * 2.5; // 巨大な場合は2.5倍の時間をかけてゆっくり飛ぶ
    }
    const duration = baseDuration;

    // ★修正: scale を適用
    anime({
        targets: meteorGroup.scale,
        x: scale,
        y: scale,
        z: scale,
        easing: 'easeOutElastic(1, .6)',
        duration: 400
    });

    anime({
        targets: head.material,
        opacity: 1.0,
        easing: 'easeOutQuad',
        duration: 200
    });
    anime({
        targets: glow.material,
        opacity: 0.8,
        easing: 'easeOutQuad',
        duration: 200
    });

    anime({
        targets: meteorGroup.position,
        x: endPos.x,
        y: endPos.y,
        z: endPos.z,
        easing: 'linear',
        duration: duration,
        update: (anim) => {
            const progress = anim.progress;
            if (progress > 85) {
                const fade = 1.0 - ((progress - 85) / 15);
                head.material.opacity = fade;
                glow.material.opacity = 0.8 * fade;
            }
        },
        complete: () => {
            scene.remove(meteorGroup);
            headGeo.dispose(); headMat.dispose();
            glowGeo.dispose(); glowMat.dispose();
        }
    });

    // 回転アニメーションの時間も合わせる
    anime({
        targets: head.rotation,
        z: Math.PI * 10,
        easing: 'linear',
        duration: duration
    });
}

async function init() {
    applyI18n();

    welcomeModal = document.getElementById('welcome-modal');
    okButton = document.getElementById('welcome-ok-btn');
    mainUiWrapper = document.getElementById('main-ui-wrapper');
    showLocalAchievementPreview();

    const loadingStyle = document.createElement('style');
    loadingStyle.innerHTML = `
        .loading-text::after {
            content: '';
            animation: dots 1.5s steps(4, end) infinite;
        }
        @keyframes dots {
            0%, 20% { content: ''; }
            40% { content: '.'; }
            60% { content: '..'; }
            80%, 100% { content: '...'; }
        }
    `;
    document.head.appendChild(loadingStyle);

    loadingOverlay = document.createElement('div');
    loadingOverlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:9999;display:flex;justify-content:center;align-items:center;color:white;font-size:24px;font-weight:bold;opacity:0;transition:opacity 0.3s;pointer-events:none;backdrop-filter:blur(4px);';

    const loadingText = document.createElement('div');
    loadingText.className = 'loading-text';
    loadingText.textContent = 'Loading';
    loadingOverlay.appendChild(loadingText);

    document.body.appendChild(loadingOverlay);

    scene = new THREE.Scene(); scene.fog = new THREE.Fog(0x000000, 10, 50);
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000); camera.position.z = 25;
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    document.getElementById('canvas-container').appendChild(renderer.domElement);
    controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.autoRotate = false;

    controls.minDistance = 10;
    controls.maxDistance = 70;

    scene.add(new THREE.AmbientLight(0x888888, 2));
    const pl = new THREE.PointLight(0xffffff, 25, 1000); pl.position.set(20, 10, 5); scene.add(pl);
    const dl = new THREE.DirectionalLight(0xffffff, 0.4); dl.position.set(50, 15, 10); scene.add(dl);
    new THREE.CubeTextureLoader().setPath('/front/img/skybox/').load(['right.png', 'left.png', 'top.png', 'bottom.png', 'front.png', 'back.png'], (tex) => scene.background = tex);

    socket.on('meteor', (data) => {
        if (document.hidden) return;

        console.log('Meteor received:', data);
        spawnMeteor(data);
    });

    window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });

    animate();

    const hasVisited = localStorage.getItem('githubPlanetVisited');

    if (!hasVisited) {
        if (welcomeModal) welcomeModal.style.display = 'block';

        if (okButton) {
            okButton.addEventListener('click', async () => {
                localStorage.setItem('githubPlanetVisited', 'true');
                if (welcomeModal) welcomeModal.style.display = 'none';
                await loadMainContent();
            }, { once: true });
        } else {
            await loadMainContent();
        }
    } else {
        if (welcomeModal) welcomeModal.style.display = 'none';
        await loadMainContent();
    }
}

async function loadMainContent() {
    if (mainUiWrapper) mainUiWrapper.style.display = 'block';

    // ★変更: 初期ロード時のローディング表示を停止
    // toggleLoading(true);

    try {
        const data = await fetchMyPlanetData();
        const notLoggedInContainer = document.getElementById('not-logged-in-container');

        if (notLoggedInContainer) {
            if (data) {
                // 既にログイン済みなら惑星を表示
                await loadPlanet(data);
            } else {
                // 未ログインなら「星を誕生させる」画面を表示
                notLoggedInContainer.style.display = 'flex';
                controls.enabled = false;
            }
        }

        setupUI();
    } catch (e) {
        console.error('Initial load failed:', e);
    } finally {
        // ★追加: 処理が終わったら（成功・失敗にかかわらず）ローディングを消す
        toggleLoading(false);
    }
}

function animate() {
    requestAnimationFrame(animate);
    if (planetGroup) planetGroup.rotation.z += planetRotationSpeed;
    const goWindSpeedFactor = calculateGoWindSpeedFactor(
        planetRotationSpeed,
        BASE_PLANET_ROTATION_SPEED
    );
    updateCssPlanetFlow(cssPlanetMaterial, performance.now());
    updateCppPlanetLightning(cppPlanetMaterial, performance.now());
    updateGoPlanetWind(goPlanetWindMaterial, performance.now(), goWindSpeedFactor);
    updateGoPlanetAtmosphere(goPlanetAtmosphere, performance.now(), goWindSpeedFactor);
    updateTypeScriptPlanetShell(typeScriptPlanetMaterial, performance.now());
    updateTypeScriptPlanetShell(typeScriptPlanetShell, performance.now());
    updateJavaScriptPlanetReactivity(javaScriptPlanetMaterial, performance.now());
    controls.update();
    renderer.render(scene, camera);
}

function setupUI() {
    const modal = document.getElementById('select-modal');
    const topRightUI = document.querySelector('.ui-top-right');

    document.getElementById('open-select-modal-btn')?.addEventListener('click', () => {
        modal.classList.add('is-visible');
        if (topRightUI) topRightUI.style.display = 'none';
    });

    modal?.addEventListener('click', (e) => {
        if (e.target === modal || e.target.classList.contains('select-container')) {
            modal.classList.remove('is-visible');
            if (topRightUI) topRightUI.style.display = '';
        }
    });

    document.getElementById('visit-user-btn')?.addEventListener('click', async (e) => {
        e.preventDefault();
        const username = prompt(t('home.promptUsername'));
        if (!username || username.trim() === '') return;

        toggleLoading(true);

        try {
            const res = await fetch(`/api/planets/user/${username.trim()}?t=${Date.now()}`, { cache: 'no-store' });
            if (res.ok) {
                const planetData = await res.json();
                console.log('取得したユーザーデータ:', planetData);
                await loadPlanet(planetData);

                if (typeof gtag === 'function' && planetData.username) {
                    const path = `/planet/${planetData.username}`;
                    gtag('event', 'page_view', {
                        page_path: path,
                        page_title: t('home.ownerPlanet', { username: planetData.username }),
                        page_location: window.location.origin + path
                    });
                }

                modal.classList.remove('is-visible');
                if (topRightUI) topRightUI.style.display = '';
            } else if (res.status === 404) {
                alert(t('home.userPlanetNotFound'));
            } else {
                alert(t('home.searchError'));
            }
        } catch (e) {
            console.error('Error fetching user planet:', e);
            alert(t('home.networkError'));
        } finally {
            toggleLoading(false);
        }
    });

    const visitRandomPlanet = async (e) => {
        e.preventDefault();

        const now = Date.now();
        if (now - lastRandomVisitTime < 1500) return;
        lastRandomVisitTime = now;

        if (isFetchingRandomPlanet) return;
        isFetchingRandomPlanet = true;

        toggleLoading(true);

        try {
            const res = await fetch(`/api/planets/random?t=${Date.now()}`, { cache: 'no-store' });
            if (res.ok) {
                const planetData = await res.json();
                console.log('取得したランダムデータ:', planetData);
                await loadPlanet(planetData);

                if (typeof gtag === 'function' && planetData.username) {
                    const path = `/planet/${planetData.username}`;
                    gtag('event', 'page_view', {
                        page_path: path,
                        page_title: t('home.pageTitleRandom', { username: planetData.username }),
                        page_location: window.location.origin + path
                    });
                }

                modal.classList.remove('is-visible');
                if (topRightUI) topRightUI.style.display = '';
            }
            else alert(t('home.randomNotFound'));
        } catch (e) {
            console.error('Error fetching random planet:', e);
            alert(t('home.networkError'));
        } finally {
            isFetchingRandomPlanet = false;
            toggleLoading(false);
        }
    };

    document.getElementById('random-visit-btn')?.addEventListener('click', visitRandomPlanet);
    document.getElementById('next-random-planet-btn')?.addEventListener('click', visitRandomPlanet);

    // ★追加: 「自分の星に戻る」ボタンの処理
    document.getElementById('return-my-planet-btn')?.addEventListener('click', async (e) => {
        e.preventDefault();
        toggleLoading(true);

        try {
            const data = await fetchMyPlanetData();
            if (data) {
                await loadPlanet(data);
                // モーダルを閉じる
                modal.classList.remove('is-visible');
                if (topRightUI) topRightUI.style.display = '';
            } else {
                alert(t('home.myPlanetNotFound'));
            }
        } catch (error) {
            console.error(error);
            alert(t('home.genericError'));
        } finally {
            toggleLoading(false);
        }
    });

    const btn = document.getElementById('toggle-details-btn');
    btn?.addEventListener('click', () => {
        document.getElementById('planet-details-panel').classList.toggle('is-open');
        btn.classList.toggle('is-open');
        const arrow = btn.querySelector('.arrow-icon');
        if (arrow) { arrow.classList.toggle('right'); arrow.classList.toggle('left'); }
    });

    const menuBtn = document.getElementById('menu-btn');
    const menuDropdown = document.getElementById('menu-dropdown');

    if (menuBtn && menuDropdown) {
        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // イベントの伝播を止める
            menuDropdown.classList.toggle('is-visible');
        });

        // メニュー外クリックで閉じる
        document.addEventListener('click', (e) => {
            if (!menuBtn.contains(e.target) && !menuDropdown.contains(e.target)) {
                menuDropdown.classList.remove('is-visible');
            }
        });
    }
}

init();
