// front/js/home.js
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

let scene, camera, renderer, controls, planetGroup;

async function fetchMyPlanetData() {
    try {
        const res = await fetch('/api/me');
        if (!res.ok) return null;
        const data = await res.json();
        return data.planetData;
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

function loadPlanet(data) {
    if (!data) return;
    updatePlanetDetails(data);
    if (planetGroup) { scene.remove(planetGroup); planetGroup = undefined; }
    planetGroup = new THREE.Group();
    const geo = new THREE.SphereGeometry(4, 32, 32); // 惑星本体 (半径 4)
    const mat = new THREE.MeshStandardMaterial({
        color: data.planetColor ? new THREE.Color(data.planetColor).getHex() : 0x808080,
        metalness: 0.2, roughness: 0.8, aoMapIntensity: 1.5
    });
    new THREE.TextureLoader().load('front/img/2k_mars.jpg', (tex) => { mat.aoMap = tex; mat.needsUpdate = true; });
    const planet = new THREE.Mesh(geo, mat);
    planet.geometry.setAttribute('uv2', new THREE.BufferAttribute(geo.attributes.uv.array, 2));
    const s = data.planetSizeFactor || 1.0;
    planetGroup.scale.set(s, s, s);
    planetGroup.add(planet);

    // ★ 星 (Points) の追加
    const starCount = Math.floor((data.totalCommits || 0) / 75);

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

        // 星用の頂点シェーダー
        const vertexShader = `
            void main() {
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                gl_Position = projectionMatrix * mvPosition;
                gl_PointSize = 800.0 / -mvPosition.z;
            }
        `;

        // 星用のフラグメントシェーダー (光条4本)
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
    
    // ★ ここから変更: 星の数に応じて惑星にオーラ（疑似ブルーム）を追加
    if (starCount > 0) {
        // 惑星（半径4）より少し大きい球 (半径 4.05)
        const auraGeo = new THREE.SphereGeometry(4.05, 32, 32);

        // オーラ用の頂点シェーダー
        // 役割: 法線と視線ベクトルをフラグメントシェーダーに渡す
        const auraVertexShader = `
            varying vec3 vNormal;
            varying vec3 vViewPosition;
            void main() {
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                vViewPosition = -mvPosition.xyz; // 視点へのベクトル
                vNormal = normalize(normalMatrix * normal); // 法線ベクトル
                gl_Position = projectionMatrix * mvPosition;
            }
        `;

        // オーラ用のフラグメントシェーダー
        // 役割: 縁（ふち）に近いほど光るように（フレネル効果）
        const auraFragmentShader = `
            uniform vec3 glowColor;
            uniform float intensity; // 星の数に応じた強度
            varying vec3 vNormal;
            varying vec3 vViewPosition;
            void main() {
                // 視線ベクトルと法線の内積
                float fresnel = dot(normalize(vViewPosition), vNormal);
                
                // 縁に近いほど 1.0 に、中心に近いほど 0.0 になるように計算
                fresnel = 1.0 - fresnel; 
                fresnel = pow(fresnel, 3.0); // 縁の光り方をシャープに (値 1.0〜5.0 で調整)

                // 縁(fresnel) * 全体の強度(intensity)
                float alpha = fresnel * intensity;
                alpha = clamp(alpha, 0.0, 1.0); // 1.0 を超えないように

                gl_FragColor = vec4(glowColor, alpha);
            }
        `;

        // 星の数に応じて強度を計算 (星5個ごとに0.3ずつ強度が増加、最大3.0)
        const auraIntensity = Math.min(3.0, (starCount / 5.0) * 0.3); 

        const auraMat = new THREE.ShaderMaterial({
            uniforms: {
                // 惑星の色（or デフォルト色）
                glowColor: { value: new THREE.Color(data.planetColor ? data.planetColor : 0x808080) },
                // 計算した強度
                intensity: { value: auraIntensity } 
            },
            vertexShader: auraVertexShader,
            fragmentShader: auraFragmentShader,
            transparent: true,
            blending: THREE.AdditiveBlending, // 加算合成で光らせる
            side: THREE.FrontSide // 表面（こちら側）を描画
        });

        const aura = new THREE.Mesh(auraGeo, auraMat);
        planetGroup.add(aura); // 惑星グループに追加
    }
    // ★ 変更ここまで
    
    planetGroup.rotation.x = Math.PI * 0.4; planetGroup.rotation.y = Math.PI * 0.1;
    scene.add(planetGroup);
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
    document.getElementById('random-visit-btn')?.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
            const res = await fetch('/api/planets/random');
            if (res.ok) { loadPlanet(await res.json()); modal.classList.remove('is-visible'); }
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