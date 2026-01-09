import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const params = new URLSearchParams(window.location.search);
const username = params.get('username') || 'NITROYUKKURI';

const containerElement = document.getElementById('card-container');
const canvasContainer = document.getElementById('planet-canvas');
const usernameDisplay = document.getElementById('username-display');
const planetNameSub = document.getElementById('planet-name-sub');
const mainLangStat = document.getElementById('main-lang-stat');
const commitsVal = document.getElementById('commits-val');
const langBar = document.getElementById('lang-bar');

// 変更点: 画面サイズではなく、コンテナのサイズを取得
const width = containerElement.clientWidth;
const height = containerElement.clientHeight;

// シーン
const scene = new THREE.Scene();

// カメラ設定
const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
camera.position.set(5.5, 0, 8);

const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
// 変更点: レンダラーサイズをコンテナのサイズに設定
renderer.setSize(width, height);
renderer.setPixelRatio(window.devicePixelRatio);
canvasContainer.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enableZoom = false;
controls.autoRotate = false;
controls.enabled = false;

// ターゲットを右にずらして惑星を左に配置
controls.target.set(3.5, 0, 0);

// 変更点: ウィンドウリサイズ時の追従処理を削除（固定サイズなので不要）
// window.addEventListener('resize', ... を削除

// テクスチャ
const textureLoader = new THREE.TextureLoader();
const planetTexture = textureLoader.load('/front/img/2k_mars.jpg');

// ライト設定
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

// 主光源（白）
const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
dirLight.position.set(5, 3, 5);
scene.add(dirLight);

// リムライト（背後光）
const backLight = new THREE.PointLight(0xffffff, 0.5, 50);
backLight.position.set(-5, 2, -10);
scene.add(backLight);

// 惑星グループ
const planetGroup = new THREE.Group();
scene.add(planetGroup);

let planetMesh;

async function init() {
    try {
        const res = await fetch(`/api/planets/user/${username}`);
        if (!res.ok) throw new Error('Data fetch failed');
        const data = await res.json();
        updateUI(data);
        createPlanet(data);
    } catch (e) {
        console.error(e);
        const dummyData = {
            username: username,
            planetName: 'Error Planet',
            totalCommits: 0,
            planetSizeFactor: 1,
            planetColor: '#808080',
            mainLanguage: 'Unknown'
        };
        updateUI(dummyData);
        createPlanet(dummyData);
    }
}

function updateUI(data) {
    usernameDisplay.textContent = data.username || username;
    planetNameSub.textContent = (data.planetName || 'UNKNOWN').toUpperCase();

    animateValue(commitsVal, 0, data.totalCommits || 0, 1500);

    mainLangStat.textContent = (data.mainLanguage || 'UNKNOWN').toUpperCase();

    if (data.planetColor) {
        langBar.style.background = data.planetColor;
        langBar.style.boxShadow = `0 0 10px ${data.planetColor}`;
    }
    setTimeout(() => { langBar.style.width = '100%'; }, 100);
}

function animateValue(obj, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.innerHTML = Math.floor(progress * (end - start) + start);
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

// 星の数を計算する関数
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

function createPlanet(data) {
    while (planetGroup.children.length > 0) {
        planetGroup.remove(planetGroup.children[0]);
    }

    // サイズ倍率 1.3
    const baseSize = 1.3 * (data.planetSizeFactor || 1);

    const geometry = new THREE.SphereGeometry(baseSize, 64, 64);
    geometry.setAttribute('uv2', new THREE.BufferAttribute(geometry.attributes.uv.array, 2));

    const level = Math.floor((data.totalCommits || 0) / 30) + 1;
    const auraIntensity = Math.min(3.0, (level / 5.0) * 0.5);

    const material = new THREE.MeshStandardMaterial({
        color: data.planetColor || 0xffffff,
        aoMap: planetTexture,
        aoMapIntensity: 1.5,
        roughness: 0.8,
        metalness: 0.2
    });

    planetMesh = new THREE.Mesh(geometry, material);
    planetGroup.add(planetMesh);

    const starCount = calculateStarCount(data.totalCommits || 0);

    if (starCount > 0) {
        const vertices = [];
        const starBaseRadius = baseSize * 1.75;

        for (let i = 0; i < starCount; i++) {
            const phi = Math.random() * Math.PI * 2;
            const theta = Math.random() * Math.PI;
            const radius = starBaseRadius + (Math.random() * (baseSize * 0.5));

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
                gl_PointSize = (200.0 * pixelRatio) / -mvPosition.z;
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

                gl_FragColor = vec4(1.0, 1.0, 1.0, alpha * 0.7);
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

    if (auraIntensity > 0) {
        const auraGeo = new THREE.SphereGeometry(baseSize * 1.02, 64, 64);

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
                fresnel = pow(fresnel, 5.0); 

                float alpha = fresnel * intensity;
                alpha = clamp(alpha, 0.0, 1.0); 

                gl_FragColor = vec4(glowColor, alpha);
            }
        `;

        const auraMat = new THREE.ShaderMaterial({
            uniforms: {
                glowColor: { value: new THREE.Color(data.planetColor || 0xffffff) },
                intensity: { value: auraIntensity + 1.0 }
            },
            vertexShader: auraVertexShader,
            fragmentShader: auraFragmentShader,
            transparent: true,
            blending: THREE.AdditiveBlending,
            side: THREE.FrontSide,
            depthWrite: false
        });

        const aura = new THREE.Mesh(auraGeo, auraMat);
        planetGroup.add(aura);
    }

    addParticles(data.planetColor);
}

function addParticles(color) {
    const particlesGeometry = new THREE.BufferGeometry();
    const particleCount = 200;
    const posArray = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount * 3; i++) {
        posArray[i] = (Math.random() - 0.5) * 8;
    }
    particlesGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    const material = new THREE.PointsMaterial({
        size: 0.02,
        color: color || 0xffffff,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending
    });
    const particlesMesh = new THREE.Points(particlesGeometry, material);
    planetGroup.add(particlesMesh);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();

    planetGroup.rotation.y += 0.003;

    renderer.render(scene, camera);
}

animate();
init();