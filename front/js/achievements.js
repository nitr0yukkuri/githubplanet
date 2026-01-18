// front/js/achievements.js

const MASTER_ACHIEVEMENTS = {
    DUMMY_1: { id: 'DUMMY_1', name: '流れ星にネギを', description: '進行中...', progress: { current: 83, max: 100 } },
    DUMMY_2: { id: 'DUMMY_2', name: '蒼穹の遊巡', description: 'ダミーの説明' },
    FIRST_PLANET: { id: 'FIRST_PLANET', name: 'First Contact', description: '初めての惑星を作成した。' },
    DUMMY_4: { id: 'DUMMY_4', name: '惑星の開拓者', description: 'ダミーの説明' },
    COMMIT_100: { id: 'COMMIT_100', name: 'コミット100', description: '累計コミット数が100を超えた。' },
    COMMIT_500: { id: 'COMMIT_500', name: 'コミット500', description: '累計コミット数が500を超えた。' },
    COMMIT_1000: { id: 'COMMIT_1000', name: 'コミット1000', description: '累計コミット数が1000を超えた。' },
};

const TROPHY_SVG = `<svg stroke="currentColor" fill="none" stroke-width="2.5" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="1.2em" width="1.2em" xmlns="http://www.w3.org/2000/svg" style="margin-right: 8px;"><path d="M8 21h8"></path><path d="M12 17v4"></path><path d="M7 4h10v8a5 5 0 0 1-10 0V4z"></path><path d="M17 8h1a2 2 0 0 1 0 4h-1"></path><path d="M7 8H6a2 2 0 0 0 0 4h1"></path></svg>`;

function renderPage(data) {
    if (!data || !data.user || !data.planetData) {
        document.getElementById('achievement-list').innerHTML = '<p class="loading-text">ログインしていません。<a href="/">ホーム</a>に戻ってログインしてください。</p>';
        return;
    }

    const { user, planetData } = data;
    const userAchievements = planetData.achievements || {};

    document.getElementById('planet-type').textContent = planetData.planetName || '名もなき星';
    document.getElementById('user-name').textContent = user.login || '不明なユーザー';

    const masterKeys = Object.keys(MASTER_ACHIEVEMENTS);
    const totalCount = masterKeys.length;

    let unlockedCount = 0;
    if (userAchievements['DUMMY_2']) unlockedCount++;
    if (userAchievements['FIRST_PLANET']) unlockedCount++;
    if (userAchievements['DUMMY_4']) unlockedCount++;

    const displayRate = 54; // スクリーンショット再現用
    document.getElementById('achievement-rate').textContent = `${displayRate}%`;
    const chartBar = document.getElementById('rate-chart-bar');
    chartBar.style.strokeDasharray = `${displayRate}, 100`;

    const listContainer = document.getElementById('achievement-list');
    listContainer.innerHTML = '';

    masterKeys.forEach(key => {
        const masterData = MASTER_ACHIEVEMENTS[key];
        const userData = userAchievements[key];
        const isUnlocked = !!userData;
        const unlockedDate = (userData?.unlockedAt || '2025-01-01T00:00:00Z').split('T')[0].replace(/-/g, '/');

        const card = document.createElement('div');
        card.className = `achievement-card ${isUnlocked ? 'unlocked' : 'locked'}`;
        card.id = key;

        if (isUnlocked) {
            card.innerHTML = `
                <h3 class="card-header"><span class="icon">${TROPHY_SVG}</span> ${masterData.name}</h3>
                <p class="card-status">Unlocked: ${unlockedDate}</p>
                <div class="card-details">
                    <a href="#">詳細を確認する ></a>
                </div>
            `;
        } else {
            let statusText = 'Locked';
            if (masterData.progress) {
                statusText = `Locked: ${masterData.progress.current}/${masterData.progress.max}`;
            }
            card.innerHTML = `
                <h3 class="card-header"><span class="icon">🔒</span> ${masterData.name}</h3>
                <p class="card-status">${statusText}</p>
                <div class="card-details">
                    <a href="#">詳細を確認する ></a>
                </div>
            `;
        }
        listContainer.appendChild(card);
    });
}

async function initAchievementsPage() {
    try {
        const res = await fetch('/api/me');
        if (!res.ok) throw new Error('Not logged in');
        const data = await res.json();
        renderPage(data);
    } catch (error) {
        console.error('Error fetching user data:', error);
        renderPage(null);
    }
}

// パララックス効果の追加
document.addEventListener('mousemove', (e) => {
    const moveX = (e.clientX - window.innerWidth / 2) * 0.005;
    const moveY = (e.clientY - window.innerHeight / 2) * 0.005;
    document.body.style.backgroundPosition = `calc(50% + ${moveX}px) calc(50% + ${moveY}px)`;
});

document.addEventListener('DOMContentLoaded', initAchievementsPage);