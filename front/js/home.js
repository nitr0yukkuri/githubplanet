// front/js/home.js
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

let scene, camera, renderer, controls;
let planetGroup;

// ★ 惑星データ取得
async function fetchMyPlanetData() {
    try {
        const res = await fetch('/api/me');
        if (!res.ok) return null;
        const data = await res.json();
        return data.planetData;
    } catch (e) { return null; }
}

// ★★★ 新規追加: 惑星を作成・更新する関数 ★★★
function loadPlanet(data) {
    if (!data) return;

    // 既に惑星があれば削除して作り直す
    if (planetGroup) {
        scene.remove(planetGroup);
        planetGroup = undefined;
    }

    planetGroup = new THREE.Group();
    const planetGeo = new THREE.SphereGeometry(4, 32, 32);

    // 色の決定
    let colorHex = 0x808080;
    if (data.planetColor) {
        colorHex = new THREE.Color(data.planetColor).getHex();
    }

    const planetMat = new THREE.MeshStandardMaterial({
        color: colorHex,
        metalness: 0.2,
        roughness: 0.8,
        aoMapIntensity: 1.5,
    });

    const textureLoader = new THREE.TextureLoader();
    planetMat.aoMap = textureLoader.load('front/img/2k_mars.jpg');

    const planet = new THREE.Mesh(planetGeo, planetMat);
    planet.geometry.setAttribute('uv2', new THREE.BufferAttribute(planet.geometry.attributes.uv.array, 2));

    // サイズの適用 (デフォルト1.0)
    const scale = data.planetSizeFactor || 1.0;
    planetGroup.scale.set(scale, scale, scale);

    planetGroup.add(planet);
    planetGroup.rotation.x = Math.PI * 0.4;
    planetGroup.rotation.y = Math.PI * 0.1;
    scene.add(planetGroup);

    // 惑星がロードされたらログインメッセージは隠す
    const msgContainer = document.getElementById('not-logged-in-container');
    if (msgContainer) msgContainer.style.display = 'none';
    controls.enabled = true;
}

async function init() {
    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x000000, 10, 50);
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 15;

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = false;
    controls.autoRotateSpeed = 0.5;

    const ambientLight = new THREE.AmbientLight(0x888888, 2);
    scene.add(ambientLight);
    const pointLight = new THREE.PointLight(0xffffff, 25, 1000);
    pointLight.position.set(20, 10, 5);
    scene.add(pointLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.4);
    directionalLight.position.set(50, 15, 10);
    scene.add(directionalLight);

    const cubeLoader = new THREE.CubeTextureLoader();
    cubeLoader.setPath('front/img/skybox/');
    scene.background = cubeLoader.load(['right.png', 'left.png', 'top.png', 'bottom.png', 'front.png', 'back.png']);

    // 初回ロード: 自分の惑星があれば表示
    const myData = await fetchMyPlanetData();
    if (myData) {
        loadPlanet(myData);
    } else {
        const msgContainer = document.getElementById('not-logged-in-container');
        if (msgContainer) msgContainer.style.display = 'flex';
        controls.enabled = false;
    }

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    setupUIEventListeners();
    animate();
}

function animate() {
    requestAnimationFrame(animate);
    if (planetGroup) {
        planetGroup.rotation.z += 0.001;
    }
    controls.update();
    renderer.render(scene, camera);
}

function setupUIEventListeners() {
    const modal = document.getElementById('select-modal');
    const openBtn = document.getElementById('open-select-modal-btn');
    if (openBtn && modal) {
        openBtn.addEventListener('click', () => modal.classList.add('is-visible'));
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('is-visible');
        });
    }

    // ★★★ ランダム訪問ボタンの処理 ★★★
    const randomBtn = document.getElementById('random-visit-btn');
    if (randomBtn) {
        randomBtn.addEventListener('click', async (e) => {
            e.preventDefault(); // リンク遷移を無効化
            try {
                const res = await fetch('/api/planets/random');
                if (res.ok) {
                    const data = await res.json();
                    console.log('ランダム訪問:', data.username);
                    loadPlanet(data); // 取得したデータで惑星を再描画
                    modal.classList.remove('is-visible'); // モーダルを閉じる
                } else {
                    alert('他の惑星が見つかりませんでした');
                }
            } catch (err) {
                console.error('ランダム訪問エラー', err);
            }
        });
    }
}

// 最後に初期化関数を実行
init();

// DOM要素の取得とパネル開閉処理 (既存のコードを維持)
const planetDetailsPanel = document.getElementById('planet-details-panel');
const toggleDetailsBtn = document.getElementById('toggle-details-btn');
const arrowIcon = toggleDetailsBtn ? toggleDetailsBtn.querySelector('.arrow-icon') : null;

if (toggleDetailsBtn && planetDetailsPanel && arrowIcon) {
    toggleDetailsBtn.addEventListener('click', () => {
        planetDetailsPanel.classList.toggle('is-open');
        toggleDetailsBtn.classList.toggle('is-open');
        arrowIcon.classList.toggle('right');
        arrowIcon.classList.toggle('left');
    });
}