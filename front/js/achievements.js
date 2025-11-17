// front/js/achievements.js

// サーバー(server.js)側と定義を合わせる
const MASTER_ACHIEVEMENTS = {
    FIRST_PLANET: { id: 'FIRST_PLANET', name: '最初の星', description: '初めての惑星を作成した。' },
    COMMIT_100: { id: 'COMMIT_100', name: 'コミット100', description: '累計コミット数が100を超えた。' },
    COMMIT_500: { id: 'COMMIT_500', name: 'コミット500', description: '累計コミット数が500を超えた。' },
    COMMIT_1000: { id: 'COMMIT_1000', name: 'コミット1000', description: '累計コミット数が1000を超えた。' },
    // ▼ スクリーンショットに合わせてダミーデータを追加（サーバー側が未対応）▼
    DUMMY_1: { id: 'DUMMY_1', name: '流れ星にネギを', description: '進行中...', progress: { current: 83, max: 100 } },
    DUMMY_2: { id: 'DUMMY_2', name: '蒼穹の遊巡', description: 'ダミーの説明' },
    DUMMY_3: { id: 'DUMMY_3', name: 'First Contact', description: 'ダミーの説明' },
    DUMMY_4: { id: 'DUMMY_4', name: '惑星の開拓者', description: 'ダミーの説明' },
};

/**
 * データをHTMLに反映させる
 * @param {object} userData - /api/me から取得したデータ
 */
function renderPage(data) {
    if (!data || !data.user || !data.planetData) {
        document.getElementById('achievement-list').innerHTML = '<p class="loading-text">ログインしていません。<a href="/">ホーム</a>に戻ってログインしてください。</p>';
        return;
    }

    const { user, planetData } = data;
    const userAchievements = planetData.achievements || {};

    // 1. ヘッダー情報の更新
    document.getElementById('planet-type').textContent = planetData.planetName || '名もなき星';
    document.getElementById('user-name').textContent = user.login || '不明なユーザー';

    // 惑星アイコンの色を更新
    const planetIcon = document.getElementById('planet-icon');
    if (planetData.planetColor) {
        planetIcon.style.background = planetData.planetColor;
        planetIcon.textContent = ''; // 「惑星」の文字を消す
    }

    // 2. 実績レートの計算と表示
    const masterKeys = Object.keys(MASTER_ACHIEVEMENTS);
    const totalCount = masterKeys.length;
    let unlockedCount = 0;

    // ユーザーが持っている実績キーで、マスターにも存在するものの数を数える
    Object.keys(userAchievements).forEach(key => {
        if (MASTER_ACHIEVEMENTS[key]) {
            unlockedCount++;
        }
    });

    // スクリーンショットのダミーデータを反映させるための仮処理
    // (実際のデータには 'DUMMY_2' などは存在しないため)
    if (!userAchievements['DUMMY_2']) unlockedCount++;
    if (!userAchievements['DUMMY_3']) unlockedCount++;
    if (!userAchievements['DUMMY_4']) unlockedCount++;


    const rate = totalCount > 0 ? Math.round((unlockedCount / totalCount) * 100) : 0;

    document.getElementById('achievement-rate').textContent = `${rate}%`;

    // ドーナツチャートの更新
    const chartBar = document.getElementById('rate-chart-bar');
    chartBar.style.strokeDasharray = `${rate}, 100`;


    // 3. 実績リストの生成
    const listContainer = document.getElementById('achievement-list');
    listContainer.innerHTML = ''; // 「読み込み中...」をクリア

    masterKeys.forEach(key => {
        const masterData = MASTER_ACHIEVEMENTS[key];
        const userData = userAchievements[key];

        // スクリーンショットのダミーデータ用の仮のアンロック状態
        let isUnlocked = !!userData;
        if (['DUMMY_2', 'DUMMY_3', 'DUMMY_4'].includes(key)) {
            isUnlocked = true;
        }
        if (key === 'DUMMY_1') {
            isUnlocked = false;
        }
        // 仮の日付
        const unlockedDate = (userData?.unlockedAt || '2025/01/01').split('T')[0].replace(/-/g, '/');


        const card = document.createElement('div');
        card.className = `achievement-card ${isUnlocked ? 'unlocked' : 'locked'}`;

        if (isUnlocked) {
            // アンロック済み
            card.innerHTML = `
                <h3 class="card-header"><span class="icon">🏆</span> ${masterData.name}</h3>
                <p class="card-status">Unlocked: ${unlockedDate}</p>
                <div class="card-details">
                    <a href="#">詳細を確認する ></a>
                </div>
            `;
        } else {
            // ロック中
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

/**
 * ページの初期化処理
 */
async function initAchievementsPage() {
    try {
        const res = await fetch('/api/me');
        if (!res.ok) {
            throw new Error('Not logged in');
        }
        const data = await res.json();
        renderPage(data);
    } catch (error) {
        console.error('Error fetching user data:', error);
        renderPage(null); // エラーまたは未ログインとして処理
    }
}

// DOMの読み込みが完了したら実行
document.addEventListener('DOMContentLoaded', initAchievementsPage);