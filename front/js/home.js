// front/js/home.js
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import anime from 'animejs';
// ▼▼▼ 追加: Socket.IO Client ▼▼▼
import { io } from 'socket.io-client';
// ▲▲▲ 追加終了 ▲▲▲

let scene, camera, renderer, controls, planetGroup;

let welcomeModal, okButton, mainUiWrapper;
let isFetchingRandomPlanet = false;

// ▼▼▼ 追加: Socket.IO インスタンス ▼▼▼
const socket = io();
// ▲▲▲ 追加終了 ▲▲▲

async function fetchMyPlanetData() {
    try {
        const res = await fetch(`/api/me?t=${Date.now()}`, { cache: 'no-store' });

        if (!res.ok) return null;
        const data = await res.json();

        if (data.planetData && data.user) {
            data.planetData.username = data.user.login;
            return data.planetData;
        }
        return null;

    } catch (e) { return null; }
}

function updatePlanetDetails(data) {
    const stats = document.getElementById('lang-stats-container');
    const commits = document.getElementById('commit-count-val');
    const name = document.getElementById('planet-name-val');

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
                            const percentage = Math.round((bytes / total) * 100);
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
        console.log('Commit count set to:', commitCount);
    }

    if (name) {
        name.textContent = data.planetName || '名もなき星';
        console.log('Planet name set to:', data.planetName);
    }
}

function calculateStarCount(totalCommits) {
    let starCount = 0;
    let commitsUsed = 0;
    let requiredCommitsPerStar = 10;
    const costIncreaseStep = 10;
    const levelUpThreshold = 5;

    while (true) {
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

function loadPlanet(data) {
    const ownerDisplay = document.getElementById('planet-owner-display');
    const profileLink = document.getElementById('github-profile-link');
    if (ownerDisplay) ownerDisplay.style.display = 'none';
    if (profileLink) profileLink.style.display = 'none';

    if (!data) return;

    console.log('loadPlanet called with data:', data);

    if (ownerDisplay && data.username) {
        ownerDisplay.textContent = `${data.username} の星`;
        ownerDisplay.style.display = 'inline-block';
    }
    if (profileLink && data.username) {
        profileLink.href = `https://github.com/${data.username}`;
        profileLink.style.display = 'flex';
    }

    updatePlanetDetails(data);

    if (planetGroup) { scene.remove(planetGroup); planetGroup = undefined; }
    planetGroup = new THREE.Group();
    const geo = new THREE.SphereGeometry(4, 32, 32);
    const mat = new THREE.MeshStandardMaterial({
        color: data.planetColor ? new THREE.Color(data.planetColor).getHex() : 0x808080,
        metalness: 0.2, roughness: 0.8, aoMapIntensity: 1.5
    });
    new THREE.TextureLoader().load('front/img/2k_mars.jpg', (tex) => { mat.aoMap = tex; mat.needsUpdate = true; });
    const planet = new THREE.Mesh(geo, mat);
    planet.geometry.setAttribute('uv2', new THREE.BufferAttribute(geo.attributes.uv.array, 2));
    const s = data.planetSizeFactor || 1.0;
    planetGroup.add(planet);

    const starCount = calculateStarCount(data.totalCommits || 0);
    console.log('Star count:', starCount);

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
                // pixelRatioを掛けて、スマホでも適切なサイズに見えるように補正
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
                pixelRatio: { value: window.devicePixelRatio }
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
            shockwave.geometry.dispose();
            shockwave.material.dispose();
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

// ▼▼▼ 修正: カメラ基準の座標系に変更 ▼▼▼
function spawnMeteor(data) {
    if (!scene || !camera) return;

    const baseColor = new THREE.Color(data.color || '#ffffff');
    const meteorGroup = new THREE.Group();
    meteorGroup.renderOrder = 9999;

    // --- 1. Head: 星型 ---
    const starShape = new THREE.Shape();
    const points = 5;
    const outerRadius = 0.5;
    const innerRadius = 0.25;

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
        depth: 0.1,
        bevelEnabled: false
    });
    headGeo.center();

    const headMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 1.0,
        blending: THREE.AdditiveBlending,
        depthTest: false
    });
    const head = new THREE.Mesh(headGeo, headMat);
    meteorGroup.add(head);


    // --- 2. Tail: Glow ---
    const tailLength = 35;

    const glowGeo = new THREE.CylinderGeometry(0.6, 0.0, tailLength * 0.9, 16, 1, true);
    glowGeo.translate(0, -tailLength / 2 + 0.5, 0);
    glowGeo.rotateX(Math.PI / 2);

    const glowMat = new THREE.MeshBasicMaterial({
        color: baseColor,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        depthTest: false
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    meteorGroup.add(glow);


    // --- 動きの制御: カメラ基準で計算 ---
    // これにより、カメラがどこを向いていても常に「画面の奥」から流れてくる

    // カメラ座標系でのスタート位置 (画面右寄り、上寄り、奥)
    const localStart = new THREE.Vector3(
        40 + Math.random() * 40,   // 右
        10 + Math.random() * 30,   // 上
        -100 - Math.random() * 50  // 奥 (カメラ座標系ではマイナスZが視線方向)
    );

    // カメラ座標系でのゴール位置 (画面左寄り、下寄り、手前)
    const localEnd = new THREE.Vector3(
        -40 - Math.random() * 40,  // 左
        -10 - Math.random() * 30,  // 下
        20 + Math.random() * 20    // 手前
    );

    // ワールド座標に変換
    // ベクトルをカメラの回転に合わせて回転させ、カメラの位置を足す
    const startPos = localStart.applyQuaternion(camera.quaternion).add(camera.position);
    const endPos = localEnd.applyQuaternion(camera.quaternion).add(camera.position);

    meteorGroup.position.copy(startPos);
    meteorGroup.lookAt(endPos);

    scene.add(meteorGroup);

    const duration = 3000 + Math.random() * 1500;

    anime({
        targets: meteorGroup.position,
        x: endPos.x,
        y: endPos.y,
        z: endPos.z,
        easing: 'easeInQuad',
        duration: duration,
        update: (anim) => {
            const progress = anim.progress;
            if (progress > 80) {
                const fade = 1.0 - ((progress - 80) / 20);
                head.material.opacity = fade;
                glow.material.opacity = 0.6 * fade;
            }
        },
        complete: () => {
            scene.remove(meteorGroup);
            headGeo.dispose(); headMat.dispose();
            glowGeo.dispose(); glowMat.dispose();
        }
    });

    anime({
        targets: head.rotation,
        z: Math.PI * 10,
        easing: 'linear',
        duration: duration
    });
}
// ▲▲▲ 修正終了 ▲▲▲


async function init() {

    welcomeModal = document.getElementById('welcome-modal');
    okButton = document.getElementById('welcome-ok-btn');
    mainUiWrapper = document.getElementById('main-ui-wrapper');

    scene = new THREE.Scene(); scene.fog = new THREE.Fog(0x000000, 10, 50);
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000); camera.position.z = 25;
    renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(window.innerWidth, window.innerHeight); renderer.setPixelRatio(window.devicePixelRatio);
    document.getElementById('canvas-container').appendChild(renderer.domElement);
    controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.autoRotate = false;
    scene.add(new THREE.AmbientLight(0x888888, 2));
    const pl = new THREE.PointLight(0xffffff, 25, 1000); pl.position.set(20, 10, 5); scene.add(pl);
    const dl = new THREE.DirectionalLight(0xffffff, 0.4); dl.position.set(50, 15, 10); scene.add(dl);
    new THREE.CubeTextureLoader().setPath('front/img/skybox/').load(['right.png', 'left.png', 'top.png', 'bottom.png', 'front.png', 'back.png'], (tex) => scene.background = tex);

    // ▼▼▼ 追加: Socketイベントリスナー ▼▼▼
    socket.on('meteor', (data) => {
        console.log('Meteor received:', data);
        spawnMeteor(data);
    });
    // ▲▲▲ 追加終了 ▲▲▲

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

    const data = await fetchMyPlanetData();
    const notLoggedInContainer = document.getElementById('not-logged-in-container');

    if (notLoggedInContainer) {
        if (data) {
            loadPlanet(data);
        } else {
            notLoggedInContainer.style.display = 'flex';
            controls.enabled = false;
        }
    }

    setupUI();
}

function animate() { requestAnimationFrame(animate); if (planetGroup) planetGroup.rotation.z += 0.001; controls.update(); renderer.render(scene, camera); }

function setupUI() {
    const modal = document.getElementById('select-modal');
    document.getElementById('open-select-modal-btn')?.addEventListener('click', () => modal.classList.add('is-visible'));

    modal?.addEventListener('click', (e) => {
        if (e.target === modal || e.target.classList.contains('select-container')) {
            modal.classList.remove('is-visible');
        }
    });

    document.getElementById('visit-user-btn')?.addEventListener('click', async (e) => {
        e.preventDefault();
        const username = prompt('見に行きたいGitHubユーザー名を入力してください:');
        if (!username || username.trim() === '') return;

        try {
            const res = await fetch(`/api/planets/user/${username.trim()}?t=${Date.now()}`, { cache: 'no-store' });
            if (res.ok) {
                const planetData = await res.json();
                console.log('取得したユーザーデータ:', planetData);
                loadPlanet(planetData);

                if (typeof gtag === 'function' && planetData.username) {
                    const path = `/planet/${planetData.username}`;
                    gtag('event', 'page_view', {
                        page_path: path,
                        page_title: `${planetData.username} の星`,
                        page_location: window.location.origin + path
                    });
                }

                modal.classList.remove('is-visible');
            } else if (res.status === 404) {
                alert('そのユーザーの惑星は見つかりませんでした。\n(GitHub Planetにログインしたことがあるユーザーのみ表示できます)');
            } else {
                alert('惑星の検索中にエラーが発生しました');
            }
        } catch (e) {
            console.error('Error fetching user planet:', e);
            alert('通信エラーが発生しました');
        }
    });

    document.getElementById('random-visit-btn')?.addEventListener('click', async (e) => {
        e.preventDefault();

        if (isFetchingRandomPlanet) return;
        isFetchingRandomPlanet = true;

        try {
            const res = await fetch(`/api/planets/random?t=${Date.now()}`, { cache: 'no-store' });
            if (res.ok) {
                const planetData = await res.json();
                console.log('取得したランダムデータ:', planetData);
                loadPlanet(planetData);

                if (typeof gtag === 'function' && planetData.username) {
                    const path = `/planet/${planetData.username}`;
                    gtag('event', 'page_view', {
                        page_path: path,
                        page_title: `${planetData.username} の星 (Random)`,
                        page_location: window.location.origin + path
                    });
                }

                modal.classList.remove('is-visible');
            }
            else alert('他の惑星が見つかりませんでした');
        } catch (e) {
            console.error('Error fetching random planet:', e);
            alert('通信エラーが発生しました');
        } finally {
            isFetchingRandomPlanet = false;
        }
    });

    const btn = document.getElementById('toggle-details-btn');
    btn?.addEventListener('click', () => {
        document.getElementById('planet-details-panel').classList.toggle('is-open');
        btn.classList.toggle('is-open');
        const arrow = btn.querySelector('.arrow-icon');
        if (arrow) { arrow.classList.toggle('right'); arrow.classList.toggle('left'); }
    });
}

init();