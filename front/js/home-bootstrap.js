import { applyI18n, t } from './i18n.js';
import { resolveHomeRoute } from './home-route.js';
import { startInitialPlanetLoad } from './home/initial-planet-load.js';

applyI18n();
const route = resolveHomeRoute(window.location.pathname, window.location.search);
let hasVisited = false;
try { hasVisited = localStorage.getItem('githubPlanetVisited') === 'true'; } catch {}
const needsIntroduction = route.mode === 'exhibition'
    || (!['showcase', 'demo'].includes(route.mode) && !hasVisited);
const welcome = document.getElementById('welcome-modal');
const button = document.getElementById('welcome-ok-btn');

async function startHome() {
    // APIと画像を3D依存モジュールの後から取り始めると、独立した待ち時間が直列に積み上がる。
    const initialPlanetLoad = route.mode === 'normal' || route.mode === 'exhibition'
        ? startInitialPlanetLoad()
        : null;
    const preloadTexture = () => {
        const texture = new Image();
        texture.src = '/front/img/2k_mars.jpg';
    };
    if (initialPlanetLoad) {
        void initialPlanetLoad.first.then(result => { if (result.data) preloadTexture(); });
    } else {
        preloadTexture();
    }
    const { init } = await import('./home.js');
    await init({ initialPlanetLoad });
}

if (needsIntroduction && welcome && button) {
    // 説明を読んでいる間のGPU初期化は初回描画と入力を妨げるため、利用開始の操作まで待つ。
    document.body.classList.add('home-introduction');
    welcome.style.display = 'block';
    button.focus();
    button.addEventListener('click', async () => {
        button.disabled = true;
        button.textContent = t('common.loading');
        document.body.dataset.welcomeAccepted = 'true';
        try {
            await startHome();
            try { localStorage.setItem('githubPlanetVisited', 'true'); } catch {}
        } catch (error) {
            console.error('Home startup failed:', error);
            delete document.body.dataset.welcomeAccepted;
            button.disabled = false;
            button.textContent = t('home.retry');
            let message = document.getElementById('home-startup-error');
            if (!message) {
                message = document.createElement('p');
                message.id = 'home-startup-error';
                message.setAttribute('role', 'alert');
                button.before(message);
            }
            message.textContent = t('home.loadError');
        }
    });
} else {
    if (welcome) welcome.style.display = 'none';
    void startHome();
}
