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

const width = 800;
const height = 400;

// シーン
const scene = new THREE.Scene();

// カメラ設定
const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
camera.position.set(5.5, 0, 8);

const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
renderer.setSize(width, height);
renderer.setPixelRatio(window.devicePixelRatio);
// トーンマッピング: 光の表現を自然に
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
canvasContainer.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enableZoom = false;
controls.autoRotate = false;

// ターゲットを右にずらして惑星を左に配置
controls.target.set(3.5, 0, 0);

// テクスチャ
const textureLoader = new THREE.TextureLoader();
const planetTexture = textureLoader.load('/front/img/2k_mars.jpg');

// ライト設定
const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
scene.add(ambientLight);

// 主光源（白）
const dirLight = new THREE.DirectionalLight(0xffffff, 1.8);
dirLight.position.set(5, 3, 5);
scene.add(dirLight);

// バックライト（青系固定）
const backLight = new THREE.PointLight(0x4444ff, 1.5, 20);
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

    // ★修正: ここでUIの色（--accent）を変える処理を削除しました。
    // バーの色だけは言語ごとのデータに従います。
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

function createPlanet(data) {
    while (planetGroup.children.length > 0) {
        planetGroup.remove(planetGroup.children[0]);
    }

    const geometry = new THREE.SphereGeometry(1.0 * (data.planetSizeFactor || 1), 64, 64);

    // ★レベル計算: バックエンドのロジックに準拠して発光強度を決める
    const level = Math.floor((data.totalCommits || 0) / 30) + 1;
    const glowIntensity = Math.min(0.2 + (level * 0.05), 2.0);

    // ★マテリアル設定: 
    // バックエンドから来た色(data.planetColor)を素直に使用
    const material = new THREE.MeshStandardMaterial({
        map: planetTexture,
        color: data.planetColor || 0xffffff, // 言語の色
        roughness: 0.6,
        metalness: 0.1,
        // バックエンドを元にした発光
        emissive: data.planetColor || 0x000000,
        emissiveIntensity: glowIntensity
    });

    planetMesh = new THREE.Mesh(geometry, material);
    planetGroup.add(planetMesh);

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

    // 自転
    if (planetMesh) {
        planetMesh.rotation.y += 0.003;
    }

    renderer.render(scene, camera);
}

animate();
init();