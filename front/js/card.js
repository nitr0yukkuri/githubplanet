// front/js/card.js
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const params = new URLSearchParams(window.location.search);
const username = params.get('username') || 'NITROYUKKURI';
const isScreenshotMode = params.has('fix');

// バックアップとしてJSでもクラス追加を行うが、HTML側が主役
if (isScreenshotMode) {
    document.documentElement.classList.add('is-screenshot');
    document.body.classList.add('is-screenshot');
}

const containerElement = document.getElementById('card-container');
const canvasContainer = document.getElementById('planet-canvas');
const usernameDisplay = document.getElementById('username-display');
const planetNameSub = document.getElementById('planet-name-sub');
const mainLangStat = document.getElementById('main-lang-stat');
const commitsVal = document.getElementById('commits-val');
const langBar = document.getElementById('lang-bar');

const sysStatus = document.querySelector('.sys-status');
const idLabel = document.querySelector('.id-label');

const shareSection = document.getElementById('share-section');
const markdownCode = document.getElementById('markdown-code');
const copyBtn = document.getElementById('copy-btn');

if (isScreenshotMode && containerElement && containerElement.parentNode !== document.body) {
    document.body.appendChild(containerElement);
}

if (!isScreenshotMode) {
    if (shareSection) shareSection.style.display = 'block';

    const deployUrl = window.location.origin;
    // キャッシュバスターのためのタイムスタンプ
    const timestamp = Date.now();
    const targetUrl = `${deployUrl}/card.html?username=${username}&fix=true&time=${timestamp}`;
    const thumbUrl = `https://image.thum.io/get/width/800/crop/400/noanimate/wait/8/${targetUrl}`;

    const pageUrl = `${deployUrl}/card.html?username=${username}`;
    const mdText = `[![GitHub Planet](${thumbUrl})](${pageUrl})`;

    if (markdownCode) markdownCode.textContent = mdText;
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(mdText);
        });
    }
} else {
    if (shareSection) shareSection.style.display = 'none';
}

const width = isScreenshotMode ? 800 : (containerElement ? containerElement.clientWidth : 800);
const height = isScreenshotMode ? 400 : (containerElement ? containerElement.clientHeight : 400);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);

if (isScreenshotMode) {
    // 撮影モード: 惑星をさらに大きく
    camera.position.set(6.0, 0, 10.5);
} else {
    camera.position.set(6.0, 0, 10.0);
}

const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
renderer.setSize(width, height);
renderer.setPixelRatio(window.devicePixelRatio);
canvasContainer.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enableZoom = false;
controls.autoRotate = false;
controls.enabled = false;

if (isScreenshotMode) {
    controls.target.set(3.5, 0, 0);
} else {
    controls.target.set(3.5, 0, 0);
}

window.addEventListener('resize', () => {
    if (isScreenshotMode) return;
    const w = containerElement ? containerElement.clientWidth : 800;
    const h = containerElement ? containerElement.clientHeight : 400;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
});

const textureLoader = new THREE.TextureLoader();
const planetTexture = textureLoader.load('front/img/2k_mars.jpg');

const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
dirLight.position.set(5, 3, 5);
scene.add(dirLight);

const backLight = new THREE.PointLight(0xffffff, 0.5, 50);
backLight.position.set(-5, 2, -10);
scene.add(backLight);

const planetGroup = new THREE.Group();
planetGroup.position.set(0, 0, 0);
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

    const duration = isScreenshotMode ? 0 : 1500;
    animateValue(commitsVal, 0, data.totalCommits || 0, duration);

    mainLangStat.textContent = (data.mainLanguage || 'UNKNOWN').toUpperCase();

    if (data.planetColor) {
        langBar.style.background = data.planetColor;
        langBar.style.boxShadow = `0 0 10px ${data.planetColor}`;
        if (sysStatus) sysStatus.style.color = data.planetColor;
        if (idLabel) idLabel.style.color = data.planetColor;
    }
    setTimeout(() => { langBar.style.width = '100%'; }, isScreenshotMode ? 0 : 100);
}

function animateValue(obj, start, end, duration) {
    if (duration === 0) {
        obj.innerHTML = end;
        return;
    }
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

    const baseSize = Math.min(1.3 * (data.planetSizeFactor || 1), 6.0);

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
            uniforms: { pixelRatio: { value: window.devicePixelRatio } },
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
    planetGroup.rotation.y -= 0.003;
    renderer.render(scene, camera);
}

animate();
init();