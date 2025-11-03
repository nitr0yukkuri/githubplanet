import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

let scene, camera, renderer, controls;
let planetGroup;
let planetMat; // ★ マテリアルをスコープ外から参照できるように変更

// ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
// ★ 最小限の変更点 (D): ログイン状態と惑星データを取得する関数 (旧 client.js のロジック)
// ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
async function fetchPlanetData() {
    try {
        const response = await fetch('/api/me');

        if (!response.ok) {
            // セッションが切れているか、未ログイン
            console.log('ログインしていません');
            // 「自分の星」ボタンを表示 (ログインしていないので)
            document.getElementById('my-planet-btn-wrapper').style.display = 'block';
            return null;
        }

        // ログイン成功時の処理
        const data = await response.json();
        console.log('ユーザーデータ:', data);

        // 「自分の星」ボタンを隠す (ログイン済みなので)
        document.getElementById('my-planet-btn-wrapper').style.display = 'none';

        // 惑星データを返す
        return data.planetData;

    } catch (error) {
        console.error('データ取得エラー:', error);
        // エラー時も「自分の星」ボタンは表示しておく
        document.getElementById('my-planet-btn-wrapper').style.display = 'block';
        return null;
    }
}

// 初期化関数
async function init() { // ★ async に変更
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
    const textureCube = cubeLoader.load([
        'right.png', 'left.png', 'top.png', 'bottom.png', 'front.png', 'back.png'
    ]);
    scene.background = textureCube;

    // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
    // ★ 最小限の変更点 (E): 惑星データを取得し、色を適用する
    // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
    const myPlanetData = await fetchPlanetData(); // ★ データを待つ

    planetGroup = new THREE.Group();
    const textureLoader = new THREE.TextureLoader();
    const planetGeo = new THREE.SphereGeometry(4, 32, 32);

    // マテリアルの色をサーバーデータから設定
    let defaultColor = 0x3366ff; // デフォルトの色 (ログインしていない場合)
    if (myPlanetData && myPlanetData.planetColor) {
        try {
            // planetColor (例: '#f0db4f') を Three.js の色 (0xf0db4f) に変換
            defaultColor = new THREE.Color(myPlanetData.planetColor).getHex();
            console.log('惑星の色を適用:', myPlanetData.planetColor);
        } catch (e) {
            console.error('色の変換に失敗:', e);
            // 失敗したらデフォルト色のまま
        }
    }

    planetMat = new THREE.MeshStandardMaterial({
        color: defaultColor, // ★ 取得した色を適用
        metalness: 0.2,
        roughness: 0.8,
        aoMapIntensity: 1.5,
    });
    // ★★★ (ここまで修正) ★★★

    const aoTexture = textureLoader.load('front/img/2k_mars.jpg');
    planetMat.aoMap = aoTexture;
    const planet = new THREE.Mesh(planetGeo, planetMat);
    planet.geometry.setAttribute(
        'uv2',
        new THREE.BufferAttribute(planet.geometry.attributes.uv.array, 2)
    );
    planetGroup.add(planet);
    planetGroup.rotation.x = Math.PI * 0.4;
    planetGroup.rotation.y = Math.PI * 0.1;
    scene.add(planetGroup);

    window.addEventListener('resize', onWindowResize);

    // ★★★ UIイベントリスナーを設定する関数を呼び出し ★★★
    setupUIEventListeners();

    animate();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    planetGroup.rotation.z += 0.001;
    controls.update();
    renderer.render(scene, camera);
}

// ★★★ ここから新しい関数を追加 ★★★
function setupUIEventListeners() {
    const openButton = document.getElementById('open-select-modal-btn');
    const modal = document.getElementById('select-modal');

    // ボタンをクリックしたらモーダルを表示
    if (openButton && modal) {
        openButton.addEventListener('click', () => {
            modal.classList.add('is-visible');
        });
    }

    // モーダルの背景をクリックしたらモーダルを非表示
    if (modal) {
        modal.addEventListener('click', (event) => {
            // event.target (クリックされた要素) が modal (背景) 自身だった場合のみ閉じる
            if (event.target === modal) {
                modal.classList.remove('is-visible');
            }
        });
    }
}
// ★★★ ここまで追加 ★★★

// 最後に初期化関数を実行
init();