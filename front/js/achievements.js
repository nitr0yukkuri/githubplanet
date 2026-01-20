// front/js/achievements.js

const MASTER_ACHIEVEMENTS = {
    OCTOCAT_FRIEND: { id: 'OCTOCAT_FRIEND', name: '星界の盟友', description: '長い間この宇宙を旅し、登録から1年以上が経過した。' },
    VELOCITY_STAR: { id: 'VELOCITY_STAR', name: '光速の星', description: '爆発的な開発スピードで宇宙を駆け抜け、週間50コミット以上を記録した。' },
    OS_CONTRIBUTOR: { id: 'OS_CONTRIBUTOR', name: '銀河の貢献者', description: '他の星系に文明をもたらし、他リポジトリへの貢献を果たした。' },
    STARGAZER: { id: 'STARGAZER', name: '星を見上げる者', description: '多くの輝きを知り、または自身が輝き、Star数10以上を達成した。' },
    POLYGLOT_PIONEER: { id: 'POLYGLOT_PIONEER', name: '多言語の開拓者', description: '多様な技術を操り、5種類以上の言語で彩り豊かな惑星を築き上げた。' },
    FIRST_COMMIT: { id: 'FIRST_COMMIT', name: '星の産声', description: 'GitHub Planetにログイン後、初めてのコミットを記録した。' },
    FIRST_PLANET: { id: 'FIRST_PLANET', name: '最初の星', description: '初めて自分の惑星を宇宙に誕生させた。' },
    COMMIT_100: { id: 'COMMIT_100', name: 'コミット100', description: '累計コミット数が100を超えた。' },
    COMMIT_500: { id: 'COMMIT_500', name: 'コミット500', description: '累計コミット数が500を超えた。' },
    COMMIT_1000: { id: 'COMMIT_1000', name: 'コミット1000', description: '累計コミット数が1000を超えた。' },
};

const TROPHY_SVG = `<svg stroke="currentColor" fill="none" stroke-width="2.5" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="1.2em" width="1.2em" xmlns="http://www.w3.org/2000/svg" style="margin-right: 8px;"><path d="M8 21h8"></path><path d="M12 17v4"></path><path d="M7 4h10v8a5 5 0 0 1-10 0V4z"></path><path d="M17 8h1a2 2 0 0 1 0 4h-1"></path><path d="M7 8H6a2 2 0 0 0 0 4h1"></path></svg>`;

// ビュー切り替え用の要素
const listView = document.getElementById('achievement-list-view');
const detailView = document.getElementById('achievement-detail-view');

// 詳細表示用の要素
const detailIcon = document.getElementById('detail-icon-large');
const detailTitle = document.getElementById('detail-title');
const detailDesc = document.getElementById('detail-description');
const detailStatus = document.getElementById('detail-status-text');
const backBtn = document.getElementById('back-to-list-btn');

function showDetail(masterData, userData) {
    const isUnlocked = !!userData;
    const unlockedDate = (userData?.unlockedAt || '').split('T')[0].replace(/-/g, '/');
    const statusText = isUnlocked ? `Unlocked (${unlockedDate})` : 'Locked';

    // アイコン設定
    detailIcon.innerHTML = isUnlocked ? TROPHY_SVG.replace('height="1.2em" width="1.2em"', 'height="4em" width="4em"') : '<span style="font-size: 4em;">🔒</span>';
    detailIcon.className = isUnlocked ? 'detail-icon-large unlocked' : 'detail-icon-large locked';

    // テキスト設定
    detailTitle.textContent = masterData.name;
    detailDesc.textContent = masterData.description;
    detailStatus.textContent = statusText;

    if (isUnlocked) {
        detailStatus.style.color = '#ffd700';
    } else {
        detailStatus.style.color = '#ccc';
    }

    // 画面切り替え
    listView.style.display = 'none';
    detailView.style.display = 'flex';
}

function hideDetail() {
    detailView.style.display = 'none';
    listView.style.display = 'block';
}

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

    // 実績解除数をカウント
    const unlockedCount = masterKeys.filter(key => userAchievements[key]).length;

    const rate = totalCount === 0 ? 0 : Math.round((unlockedCount / totalCount) * 100);

    document.getElementById('achievement-rate').textContent = `${rate}%`;
    const chartBar = document.getElementById('rate-chart-bar');
    chartBar.style.strokeDasharray = `${rate}, 100`;

    const listContainer = document.getElementById('achievement-list');
    listContainer.innerHTML = '';

    masterKeys.forEach(key => {
        const masterData = MASTER_ACHIEVEMENTS[key];
        const userData = userAchievements[key];
        const isUnlocked = !!userData;
        const unlockedDate = (userData?.unlockedAt || '').split('T')[0].replace(/-/g, '/');

        const card = document.createElement('div');
        card.className = `achievement-card ${isUnlocked ? 'unlocked' : 'locked'}`;
        card.id = key;

        const headerIcon = isUnlocked ? TROPHY_SVG : '🔒';
        const statusText = isUnlocked ? `Unlocked: ${unlockedDate}` : 'Locked';

        card.innerHTML = `
            <h3 class="card-header"><span class="icon">${headerIcon}</span> ${masterData.name}</h3>
            <p class="card-status">${statusText}</p>
            <div class="card-details">
                <a class="detail-link">詳細を確認する ></a>
            </div>
        `;

        // 「詳細を確認」クリック時の動作
        card.querySelector('.detail-link').addEventListener('click', () => {
            showDetail(masterData, userData);
        });

        listContainer.appendChild(card);
    });
}

// 戻るボタンのイベントリスナー
if (backBtn) {
    backBtn.addEventListener('click', hideDetail);
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

document.addEventListener('DOMContentLoaded', initAchievementsPage);