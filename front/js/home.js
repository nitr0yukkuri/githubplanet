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
    const geo = new THREE.SphereGeometry(4, 32, 32);
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
    if (data) loadPlanet(data);
    else { document.getElementById('not-logged-in-container').style.display = 'flex'; controls.enabled = false; }
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