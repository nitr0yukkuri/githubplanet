// front/js/home.js
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import anime from 'animejs';

let scene, camera, renderer, controls, planetGroup;

async function fetchMyPlanetData() {
    try {
        const res = await fetch('/api/me');
        if (!res.ok) return null;
        const data = await res.json(); // { user: {...}, planetData: {...} }

        // ★★★ 変更点 ★★★
        // /api/me のレスポンスを、他のAPI (random, user) と同じ形式に整形する
        if (data.planetData && data.user) {
            // planetData オブジェクトに username を追加 (他のAPIと形式を統一)
            data.planetData.username = data.user.login;
            return data.planetData;
        }
        return null;
        // ★★★ 変更ここまで ★★★

    } catch (e) { return null; }
}

// ★★★ パネル更新 ★★★
function updatePlanetDetails(data) {
    const stats = document.getElementById('lang-stats-container');
    const commits = document.getElementById('commit-count-val');
    const name = document.getElementById('planet-name-val');
    if (stats && data.languageStats) {
        stats.innerHTML = '';
        const total = Object.values(data.languageStats).reduce((a, b) => a + b, 0);
        Object.entries(data.languageStats).sort(([, a], [, b]) => b - a).slice(0, 3).forEach(([l, b]) => {
            const p = document.createElement('p');
            p.innerHTML = `${l}<span>${Math.round((b / total) * 100)}%</span>`;
            stats.appendChild(p);
        });
    }
    if (commits) commits.textContent = data.totalCommits || '-';
    if (name) name.textContent = data.planetName || '名もなき星';
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
    if (!data) return;
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
    // planetGroup.scale.set(s, s, s); // <- アニメで設定
    planetGroup.add(planet);

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
            void main() {
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                gl_Position = projectionMatrix * mvPosition;
                gl_PointSize = 800.0 / -mvPosition.z;
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
            uniforms: {},
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

    // --- ★ ここから変更: アニメーションのタイミングを調整 ★ ---

    // 1. 「爆発（ショックウェーブ）」用のオブジェクトを作成
    const shockwaveGeo = new THREE.SphereGeometry(1, 32, 32);
    const shockwaveMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(data.planetColor ? data.planetColor : 0xffffff),
        transparent: true,
        blending: THREE.AdditiveBlending,
        opacity: 0.0
    });
    const shockwave = new THREE.Mesh(shockwaveGeo, shockwaveMat);

    // 2. 惑星とショックウェーブの初期状態を設定
    planetGroup.scale.set(0, 0, 0); // 惑星は最初見えない

    // 待機中の白い点を消すため、初期状態を scale: 0, opacity: 0 に
    shockwave.scale.set(0, 0, 0);

    // 待機中に表示されないよう、メッシュ自体を非表示にする
    shockwave.visible = false;

    // 3. シーンに追加
    scene.add(planetGroup);
    scene.add(shockwave);

    // 4. anime.js の timeline でアニメーションを実行
    const tl = anime.timeline({
        easing: 'easeOutExpo',
        complete: () => {
            scene.remove(shockwave);
            shockwave.geometry.dispose();
            shockwave.material.dispose();
        }
    });

    const initialDelay = 500; // 0.5秒間、何も起こらない

    // ★★★ 修正箇所: 順番を入れ替え ★★★

    // アニメーション 1-A: 「ぶわー」 (Opacity)
    // 500msの時点で opacity を 1.0 に戻し、そこから 0.0 へアニメーションさせる
    tl.add({
        targets: shockwave.material,
        // アニメーション開始時(500ms後)に表示する
        begin: function () {
            shockwave.visible = true;
        },
        opacity: [
            // 500ms の時点で瞬時に 1.0 にする (duration: 0)
            { value: 1.0, duration: 0 },
            // 500ms -> 900ms (400ms) かけて 0.0 にする
            { value: 0.0, duration: 400, easing: 'easeInExpo' }
        ],
        update: () => { shockwave.material.needsUpdate = true; }
    }, initialDelay); // 500ms から開始

    // アニメーション 1-B: 「ぶわー」 (スケール)
    // 500ms後から 400ms かけて拡大 (Opacityの*後*に追加)
    tl.add({
        targets: shockwave.scale,
        x: 15,
        y: 15,
        z: 15,
        duration: 400
    }, initialDelay); // 500ms から開始

    // ★★★ 修正ここまで ★★★

    // アニメーション 2: 「惑星誕生」
    // 爆発が始まって 100ms 後 (全体で 600ms 後) から惑星が登場
    tl.add({
        targets: planetGroup.scale,
        x: s,
        y: s,
        z: s,
        duration: 1200,
        easing: 'easeOutElastic(1, .8)'
    }, initialDelay + 100); // 600ms から開始

    // --- 変更ここまで ---

    planetGroup.rotation.x = Math.PI * 0.4; planetGroup.rotation.y = Math.PI * 0.1;

    const msg = document.getElementById('not-logged-in-container');
    if (msg) msg.style.display = 'none';
    controls.enabled = true;
}

async function init() {
    scene = new THREE.Scene(); scene.fog = new THREE.Fog(0x000000, 10, 50);
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000); camera.position.z = 15;
    renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(window.innerWidth, window.innerHeight); renderer.setPixelRatio(window.devicePixelRatio);
    document.getElementById('canvas-container').appendChild(renderer.domElement);
    controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.autoRotate = false;
    scene.add(new THREE.AmbientLight(0x888888, 2));
    const pl = new THREE.PointLight(0xffffff, 25, 1000); pl.position.set(20, 10, 5); scene.add(pl);
    const dl = new THREE.DirectionalLight(0xffffff, 0.4); dl.position.set(50, 15, 10); scene.add(dl);
    new THREE.CubeTextureLoader().setPath('front/img/skybox/').load(['right.png', 'left.png', 'top.png', 'bottom.png', 'front.png', 'back.png'], (tex) => scene.background = tex);
    const data = await fetchMyPlanetData();
    const notLoggedInContainer = document.getElementById('not-logged-in-container');

    if (notLoggedInContainer) {
        if (data) {
            // ★ loadPlanet がアニメーションを制御する
            loadPlanet(data);
        } else {
            notLoggedInContainer.style.display = 'flex';
            controls.enabled = false;
        }
    }
    window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });
    setupUI(); animate();
}

function animate() { requestAnimationFrame(animate); if (planetGroup) planetGroup.rotation.z += 0.001; controls.update(); renderer.render(scene, camera); }

function setupUI() {
    const modal = document.getElementById('select-modal');
    document.getElementById('open-select-modal-btn')?.addEventListener('click', () => modal.classList.add('is-visible'));
    modal?.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('is-visible'); });

    // ★★★ 修正点: 「誰かの星」ボタンの処理を追加 ★★★
    document.getElementById('visit-user-btn')?.addEventListener('click', async (e) => {
        e.preventDefault();
        const username = prompt('見に行きたいGitHubユーザー名を入力してください:');
        if (!username || username.trim() === '') return; // キャンセルまたは空の場合は何もしない

        try {
            // 入力されたユーザー名をAPIに渡す
            const res = await fetch(`/api/planets/user/${username.trim()}`);
            if (res.ok) {
                const planetData = await res.json(); // 戻り値は { username, planetColor, ... }
                loadPlanet(planetData); // 取得したデータで惑星をロード
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
    // ★★★ 修正ここまで ★★★

    document.getElementById('random-visit-btn')?.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
            const res = await fetch('/api/planets/random');
            if (res.ok) {
                const planetData = await res.json(); // 戻り値は { username, planetColor, ... }
                loadPlanet(planetData); // 取得したデータで惑星をロード
                modal.classList.remove('is-visible');
            }
            else alert('他の惑星が見つかりませんでした');
        } catch (e) { console.error(e); }
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