import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

const params = new URLSearchParams(window.location.search);
const username = params.get('username');

// ★背景の星を生成する関数
function createStars() {
    const container = document.getElementById('star-container');
    const starCount = 50; // 星の数
    for (let i = 0; i < starCount; i++) {
        const star = document.createElement('div');
        star.className = 'star';
        // ランダムな位置
        const x = Math.random() * 100;
        const y = Math.random() * 100;
        // ランダムなサイズ
        const size = Math.random() * 2 + 1;
        // ランダムな点滅遅延
        const delay = Math.random() * 3;

        star.style.left = `${x}%`;
        star.style.top = `${y}%`;
        star.style.width = `${size}px`;
        star.style.height = `${size}px`;
        star.style.animationDelay = `${delay}s`;

        container.appendChild(star);
    }
}

async function init() {
    createStars(); // 星を降らせる

    if (!username) return;

    try {
        const res = await fetch(`/api/planets/user/${username}`);
        if (!res.ok) throw new Error('Fetch failed');
        const data = await res.json();

        // テキスト反映
        document.getElementById('username-display').textContent = data.username.toUpperCase();
        document.getElementById('planet-name-sub').textContent = data.planetName || 'UNKNOWN SYSTEM';
        document.getElementById('commits-val').textContent = (data.totalCommits || 0).toLocaleString();
        document.getElementById('main-lang-val').textContent = data.mainLanguage || 'N/A';

        // レベル
        const level = Math.floor(Math.sqrt(data.totalCommits || 0)) + 1;
        document.getElementById('level-val').textContent = level.toString().padStart(2, '0');

        // 言語バー生成
        const langBar = document.getElementById('lang-bar');
        if (data.languageStats) {
            const total = Object.values(data.languageStats).reduce((a, b) => a + b, 0);

            // ネオンカラー定義
            const colors = {
                JavaScript: '#f7df1e', TypeScript: '#3178c6', Python: '#3776ab',
                HTML: '#e34c26', CSS: '#563d7c', Vue: '#42b883', React: '#61dafb',
                Java: '#b07219', C: '#555555', Go: '#00ADD8', Rust: '#dea584'
            };

            const sorted = Object.entries(data.languageStats).sort(([, a], [, b]) => b - a).slice(0, 5);

            sorted.forEach(([lang, bytes]) => {
                const percent = (bytes / total) * 100;
                const el = document.createElement('div');
                el.className = 'lang-segment';
                el.style.width = `${percent}%`;
                // フォールバック色はシアン
                const color = colors[lang] || '#0ff';
                el.style.backgroundColor = color;
                // セグメントごとの発光
                el.style.boxShadow = `0 0 8px ${color}`;
                langBar.appendChild(el);
            });
        }

        // --- Three.js Setup ---
        const w = 460, h = 460;
        const scene = new THREE.Scene();

        const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
        camera.position.z = 11;

        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        renderer.setSize(w, h);
        renderer.setPixelRatio(window.devicePixelRatio);
        document.getElementById('planet-canvas').appendChild(renderer.domElement);

        // ライティング（ドラマチックに）
        scene.add(new THREE.AmbientLight(0xffffff, 0.2)); // 環境光は弱く

        // メインライト（右上から強く）
        const dl = new THREE.DirectionalLight(0xffffff, 1.8);
        dl.position.set(8, 5, 10);
        scene.add(dl);

        // リムライト（左下から青く怪しく光る）
        const rim = new THREE.DirectionalLight(0x00ffff, 2.5);
        rim.position.set(-8, -5, -5);
        scene.add(rim);

        // 惑星本体
        const geo = new THREE.SphereGeometry(3.5, 64, 64);
        const mat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(data.planetColor || '#808080'),
            roughness: 0.4,  // ツヤツヤにする
            metalness: 0.7,  // 金属感を強く
            emissive: new THREE.Color(data.planetColor), // ほんのり自発光させる
            emissiveIntensity: 0.1
        });

        new THREE.TextureLoader().load('/front/img/2k_mars.jpg', (tex) => {
            mat.map = tex;
            mat.needsUpdate = true;
            finish();
        }, undefined, finish);

        const mesh = new THREE.Mesh(geo, mat);
        scene.add(mesh);

        // 角度調整
        mesh.rotation.y = -0.8;
        mesh.rotation.z = 0.3;
        mesh.rotation.x = 0.3;

        // 星屑のようなパーティクルを3D空間にも飛ばす
        const starsGeo = new THREE.BufferGeometry();
        const starsCount = 200;
        const posArray = new Float32Array(starsCount * 3);
        for (let i = 0; i < starsCount * 3; i++) {
            posArray[i] = (Math.random() - 0.5) * 20; // 範囲広めに
        }
        starsGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
        const starsMat = new THREE.PointsMaterial({
            size: 0.05, color: 0xffffff, transparent: true, opacity: 0.8
        });
        const starsMesh = new THREE.Points(starsGeo, starsMat);
        scene.add(starsMesh);

        // アニメーションループ（ブラウザで見た時用）
        function animate() {
            requestAnimationFrame(animate);
            mesh.rotation.y += 0.002; // ゆっくり回す
            starsMesh.rotation.y -= 0.001; // 背景の星も逆回転
            renderer.render(scene, camera);
        }
        animate();

        function finish() {
            // 撮影の合図
            setTimeout(() => {
                const div = document.createElement('div');
                div.id = 'ready-signal';
                document.body.appendChild(div);
            }, 1000); // アニメーションが馴染むまで少し待つ
        }

    } catch (e) { console.error(e); }
}

init();