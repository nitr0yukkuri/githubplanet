// front/js/achievements.js
import { applyI18n, getTranslation, localizedPlanetName, t } from './i18n.js';

const MASTER_ACHIEVEMENTS = {
    OCTOCAT_FRIEND: { id: 'OCTOCAT_FRIEND' },
    VELOCITY_STAR: { id: 'VELOCITY_STAR' },
    OS_CONTRIBUTOR: { id: 'OS_CONTRIBUTOR' },
    STARGAZER: { id: 'STARGAZER' },
    POLYGLOT_PIONEER: { id: 'POLYGLOT_PIONEER' },
    FIRST_COMMIT: { id: 'FIRST_COMMIT' },
    FIRST_PLANET: { id: 'FIRST_PLANET' },
    COMMIT_100: { id: 'COMMIT_100' },
    COMMIT_500: { id: 'COMMIT_500' },
    COMMIT_1000: { id: 'COMMIT_1000' },
    CONTRIBUTION_10000: { id: 'CONTRIBUTION_10000' },
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

// ★追加: 報酬表示用の要素
const rewardContainer = document.getElementById('reward-container');
const rewardPrefix = document.getElementById('reward-prefix');
const rewardSuffix = document.getElementById('reward-suffix');

function showDetail(masterData, userData) {
    const isUnlocked = !!userData;
    const unlockedDate = (userData?.unlockedAt || '').split('T')[0].replace(/-/g, '/');
    const statusText = isUnlocked ? t('achievements.unlocked', { date: unlockedDate }) : t('achievements.locked');

    // アイコン設定
    detailIcon.innerHTML = isUnlocked ? TROPHY_SVG.replace('height="1.2em" width="1.2em"', 'height="4em" width="4em"') : `<span style="font-size: 2.5em;">${t('achievements.lockIcon')}</span>`;
    detailIcon.className = isUnlocked ? 'detail-icon-large unlocked' : 'detail-icon-large locked';

    // テキスト設定
    detailTitle.textContent = t(`achievements.names.${masterData.id}`);
    detailDesc.textContent = t(`achievements.descriptions.${masterData.id}`);

    // ★変更: 報酬称号を専用エリアに表示
    const reward = getTranslation(`achievements.rewards.${masterData.id}`);
    if (reward) {
        rewardContainer.style.display = 'block';
        rewardPrefix.textContent = reward.prefix;
        rewardSuffix.textContent = reward.suffix;
    } else {
        rewardContainer.style.display = 'none';
    }

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
    applyI18n();
    if (!data || !data.user || !data.planetData) {
        document.getElementById('planet-type').textContent = '-';
        document.getElementById('user-name').textContent = '-';
        const listContainer = document.getElementById('achievement-list');
        listContainer.innerHTML = `<p class="loading-text">${t('achievements.notLoggedInHtml')}</p>`;
        applyI18n(listContainer);
        return;
    }

    const { user, planetData } = data;
    const userAchievements = planetData.achievements || {};

    document.getElementById('planet-type').textContent = localizedPlanetName(planetData);
    document.getElementById('user-name').textContent = user.login || t('achievements.unknownUser');

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
        const statusText = isUnlocked ? t('achievements.unlockedList', { date: unlockedDate }) : t('achievements.locked');

        card.innerHTML = `
            <h3 class="card-header"><span class="icon">${headerIcon}</span> ${t(`achievements.names.${masterData.id}`)}</h3>
            <p class="card-status">${statusText}</p>
            <div class="card-details">
                <button type="button" class="detail-link">${t('achievements.detailLink')}</button>
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
    applyI18n();

    try {
        const res = await fetch('/api/me');
        if (res.status === 401) {
            renderPage(null);
            return;
        }
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        const data = await res.json();
        renderPage(data);
    } catch (error) {
        console.error('Error fetching user data:', error);
        renderPage(null);
    }
}

document.addEventListener('DOMContentLoaded', initAchievementsPage);
