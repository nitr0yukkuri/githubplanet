import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

let scene, camera, renderer, controls;
let planetGroup;
// let moonPivotRed, moonPivotBlue1, moonPivotBlue2; // 月関連の変数を削除

// 初期化関数
function init() {
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

    const ambientLight = new THREE.AmbientLight(0x888888, 2); // 0x888888 (明るい灰色) に変更
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0xffffff, 25, 1000); // 強さを 1.5 -> 15 に
    pointLight.position.set(20, 10, 5); // 位置はそのまま
    scene.add(pointLight);

    // 補助的なDirectionalLight（太陽光のような光）を追加
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.4); // 白色の光、強さ0.5
    directionalLight.position.set(50, 15, 10); // 左上奥から当たるように設定
    scene.add(directionalLight);

    // ★★★ ここからSkyboxコードを追加します ★★★
    // 既存の createStarField(); は削除します

    // 1. CubeTextureLoader を作成
    const cubeLoader = new THREE.CubeTextureLoader();
    
    // 2. 画像が置いてあるフォルダのパスを指定します
    // (例: 'textures/skybox/' フォルダに6枚の画像を入れた場合)
    // このパスはあなたの環境に合わせて変更してください。
    cubeLoader.setPath('front/img/skybox/'); // ★★ 要変更 ★★

    // 3. 6枚の画像を順番に指定して読み込みます
    // (ファイル名もあなたの環境に合わせて変更してください)
    const textureCube = cubeLoader.load([
        'right.png', // 右 (Positive X)
        'left.png', // 左 (Negative X)
        'top.png', // 上 (Positive Y)
        'bottom.png', // 下 (Negative Y)
        'front.png', // 奥 (Positive Z)
        'back.png'  // 手前 (Negative Z)
    ]);
    
    // 4. シーンの背景に設定します
    scene.background = textureCube;
    // ★★★ Skyboxコードはここまで ★★★

    planetGroup = new THREE.Group();

    // 1. テクスチャを読み込むための「ローダー」を作成
    const textureLoader = new THREE.TextureLoader();

    // 惑星本体
    const planetGeo = new THREE.SphereGeometry(4, 32, 32);
    const planetMat = new THREE.MeshStandardMaterial({
        color: 0x3366ff,    //好きな色
        metalness: 0.2,    
        roughness: 0.8,    
        aoMapIntensity: 1.5,
    });

    const aoTexture = textureLoader.load('front/img/2k_mars.jpg');
    planetMat.aoMap = aoTexture;

    const planet = new THREE.Mesh(planetGeo, planetMat);

    planet.geometry.setAttribute(
        'uv2',
        new THREE.BufferAttribute(planet.geometry.attributes.uv.array, 2)
    );

    planetGroup.add(planet);

    // 惑星とリングのグループを傾ける (リングがなくなったので、単に惑星の傾きに)
    planetGroup.rotation.x = Math.PI * 0.4;
    planetGroup.rotation.y = Math.PI * 0.1;

    scene.add(planetGroup);

    window.addEventListener('resize', onWindowResize);
    animate();
}


function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// アニメーションループ
function animate() {
    requestAnimationFrame(animate);

    planetGroup.rotation.z += 0.001;

    controls.update();
    renderer.render(scene, camera);
}

init();