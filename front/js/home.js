// front/js/home.js
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import anime from 'animejs';

let scene, camera, renderer, controls, planetGroup;

// ▼▼▼ 変更点 1/4: モーダル関連のDOM変数を準備 (取得は init() 内で行う) ▼▼▼
let welcomeModal, okButton, mainUiWrapper;
// ▲▲▲ 変更点 1/4 ▲▲▲

// ▼▼▼ ★★★ 最小限の変更点: ランダム訪問の連打防止フラグ ▼▼▼
let isFetchingRandomPlanet = false;
// ▲▲▲ ★★★ 最小限の変更点 ★★★ ▲▲▲

async function fetchMyPlanetData() {
    try {
        const res = await fetch('/api/me');
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

    console.log('updatePlanetDetails called with:', data); // デバッグ用

    // 言語統計の更新
    if (stats && data.languageStats) {
        stats.innerHTML = '';
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

    // コミット数の更新（0でも表示）
    if (commits) {
        const commitCount = (data.totalCommits !== null && data.totalCommits !== undefined) ? data.totalCommits : 0;
        commits.textContent = commitCount;
        console.log('Commit count set to:', commitCount); // デバッグ用
    }

    // 惑星名の更新
    if (name) {
        name.textContent = data.planetName || '名もなき星';
        console.log('Planet name set to:', data.planetName); // デバッグ用
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
    // ▼▼▼ 変更点 (ここから) ▼▼▼
    // 惑星をロードする前に、まずオーナー表示とGitHubリンクを非表示にする
    const ownerDisplay = document.getElementById('planet-owner-display');
    const profileLink = document.getElementById('github-profile-link');
    if (ownerDisplay) ownerDisplay.style.display = 'none';
    if (profileLink) profileLink.style.display = 'none';

    // データがなければここで処理を終了（UIは非表示のまま）
    if (!data) return;
    // ▲▲▲ 変更点 (ここまで) ▲▲▲

    console.log('loadPlanet called with data:', data); // デバッグ用

    // ▼▼▼ 変更点 (ここから) ▼▼▼
    // データがある場合のみ、テキストとリンクをセットして再表示する
    if (ownerDisplay && data.username) {
        ownerDisplay.textContent = `${data.username} の星`;
        ownerDisplay.style.display = 'inline-block';
    }
    if (profileLink && data.username) {
        profileLink.href = `https://github.com/${data.username}`;
        profileLink.style.display = 'flex'; // CSSに合わせて 'flex' で表示
    }
    // ▲▲▲ 変更点 (ここまで) ▲▲▲

    // パネルを更新
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
    console.log('Star count:', starCount); // デバッグ用

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

// ▼▼▼ 変更点 2/4: init() 関数を 'async' にし、DOM取得とlocalStorage対応に変更 ▼▼▼
async function init() { // ★ エラー修正: async を追加

    // ★ 変更点: DOMの準備が整ってから要素を取得する
    welcomeModal = document.getElementById('welcome-modal');
    okButton = document.getElementById('welcome-ok-btn');
    mainUiWrapper = document.getElementById('main-ui-wrapper');

    // 1. Three.jsの基本設定（星空の背景）
    scene = new THREE.Scene(); scene.fog = new THREE.Fog(0x000000, 10, 50);
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000); camera.position.z = 25;
    renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(window.innerWidth, window.innerHeight); renderer.setPixelRatio(window.devicePixelRatio);
    document.getElementById('canvas-container').appendChild(renderer.domElement);
    controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.autoRotate = false;
    scene.add(new THREE.AmbientLight(0x888888, 2));
    const pl = new THREE.PointLight(0xffffff, 25, 1000); pl.position.set(20, 10, 5); scene.add(pl);
    const dl = new THREE.DirectionalLight(0xffffff, 0.4); dl.position.set(50, 15, 10); scene.add(dl);
    new THREE.CubeTextureLoader().setPath('front/img/skybox/').load(['right.png', 'left.png', 'top.png', 'bottom.png', 'front.png', 'back.png'], (tex) => scene.background = tex);

    window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });

    // 2. アニメーションループ開始 (星空が表示される)
    animate();

    // 3. ★ localStorage で訪問済みかチェック
    const hasVisited = localStorage.getItem('githubPlanetVisited');

    if (!hasVisited) {
        // ★ 初回訪問時
        if (welcomeModal) welcomeModal.style.display = 'block'; // CSSで非表示にしたものを表示

        if (okButton) {
            okButton.addEventListener('click', async () => {
                localStorage.setItem('githubPlanetVisited', 'true'); // ★ フラグを立てる
                if (welcomeModal) welcomeModal.style.display = 'none';
                await loadMainContent();
            }, { once: true });
        } else {
            // OKボタンがない異常系 (await を追加)
            await loadMainContent();
        }
    } else {
        // ★ 再訪問時 (ログイン後もここ)
        if (welcomeModal) welcomeModal.style.display = 'none'; // 念のため非表示
        await loadMainContent(); // すぐにメインコンテンツをロード (await を追加)
    }
}
// ▲▲▲ 変更点 2/4 ▲▲▲


// ▼▼▼ 変更点 3/4: loadMainContent 関数を新設 ▼▼▼
// (initから分離したメイン処理)
async function loadMainContent() {
    // 1. メインUIを表示
    if (mainUiWrapper) mainUiWrapper.style.display = 'block';

    // 2. 惑星データを取得
    const data = await fetchMyPlanetData();
    const notLoggedInContainer = document.getElementById('not-logged-in-container');

    // 3. データに応じて表示を切り替え
    if (notLoggedInContainer) {
        if (data) {
            loadPlanet(data);
        } else {
            notLoggedInContainer.style.display = 'flex';
            controls.enabled = false;
        }
    }

    // 4. UIボタン（モーダル開閉など）のイベントリスナーを設定
    setupUI();
}
// ▲▲▲ 変更点 3/4 ▲▲▲


function animate() { requestAnimationFrame(animate); if (planetGroup) planetGroup.rotation.z += 0.001; controls.update(); renderer.render(scene, camera); }

function setupUI() {
    const modal = document.getElementById('select-modal');
    document.getElementById('open-select-modal-btn')?.addEventListener('click', () => modal.classList.add('is-visible'));

    // ▼▼▼ 変更点: 背景(modal)だけでなく、ボタン横の隙間(select-container)でも閉じるように修正 ▼▼▼
    modal?.addEventListener('click', (e) => {
        if (e.target === modal || e.target.classList.contains('select-container')) {
            modal.classList.remove('is-visible');
        }
    });
    // ▲▲▲ 変更点 ▲▲▲

    document.getElementById('visit-user-btn')?.addEventListener('click', async (e) => {
        e.preventDefault();
        const username = prompt('見に行きたいGitHubユーザー名を入力してください:');
        if (!username || username.trim() === '') return;

        try {
            const res = await fetch(`/api/planets/user/${username.trim()}`);
            if (res.ok) {
                const planetData = await res.json();
                console.log('取得したユーザーデータ:', planetData);
                loadPlanet(planetData);

                // ▼▼▼ 変更点 (GA 仮想ページビュー) ▼▼▼
                if (typeof gtag === 'function' && planetData.username) {
                    const path = `/planet/${planetData.username}`;
                    gtag('event', 'page_view', {
                        page_path: path,
                        page_title: `${planetData.username} の星`,
                        page_location: window.location.origin + path
                    });
                }
                // ▲▲▲ 変更点 ▲▲▲

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

        // ▼▼▼ ★★★ 最小限の変更点: 連打防止 ▼▼▼
        if (isFetchingRandomPlanet) return;
        isFetchingRandomPlanet = true;
        // ▲▲▲ ★★★ 最小限の変更点 ★★★ ▲▲▲

        try {
            const res = await fetch('/api/planets/random');
            if (res.ok) {
                const planetData = await res.json();
                console.log('取得したランダムデータ:', planetData);
                loadPlanet(planetData);

                // ▼▼▼ 変更点 (GA 仮想ページビュー) ▼▼▼
                if (typeof gtag === 'function' && planetData.username) {
                    const path = `/planet/${planetData.username}`;
                    gtag('event', 'page_view', {
                        page_path: path,
                        page_title: `${planetData.username} の星 (Random)`,
                        page_location: window.location.origin + path
                    });
                }
                // ▲▲▲ 変更点 ▲▲▲

                modal.classList.remove('is-visible');
            }
            else alert('他の惑星が見つかりませんでした');
        } catch (e) {
            console.error('Error fetching random planet:', e);
            alert('通信エラーが発生しました');
        } finally {
            // ▼▼▼ ★★★ 最小限の変更点: フラグ解除 ▼▼▼
            isFetchingRandomPlanet = false;
            // ▲▲▲ ★★★ 最小限の変更点 ★★★ ▲▲▲
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

// ▼▼▼ 変更点 4/4: init() を呼び出す ▼▼▼
// (defer 属性により、DOMの準備ができてから実行される)
init();
// ▲▲▲ 変更点 4/4 ▲▲▲aaadada