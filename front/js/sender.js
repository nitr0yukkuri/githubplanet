// 主要言語リスト（ここにない言語もサーバー側で色は解決されますが、ボタン用として定義）
const LANGUAGES = [
    { name: 'JavaScript', color: '#f0db4f' },
    { name: 'TypeScript', color: '#007acc' },
    { name: 'Python', color: '#306998' },
    { name: 'HTML', color: '#e34c26' },
    { name: 'CSS', color: '#563d7c' },
    { name: 'Java', color: '#b07219' },
    { name: 'Go', color: '#00ADD8' },
    { name: 'Rust', color: '#dea584' },
    { name: 'Ruby', color: '#CC342D' },
    { name: 'PHP', color: '#4F5D95' },
    { name: 'Swift', color: '#F05138' },
    { name: 'C++', color: '#f34b7d' },
];

const grid = document.getElementById('button-grid');
const statusText = document.getElementById('status-text');

function createButtons() {
    LANGUAGES.forEach(lang => {
        const btn = document.createElement('button');
        btn.className = 'meteor-btn';
        btn.innerHTML = `
            <div class="color-indicator" style="background-color: ${lang.color}"></div>
            ${lang.name}
        `;

        btn.addEventListener('click', () => sendMeteor(lang.name));
        grid.appendChild(btn);
    });
}

async function sendMeteor(language) {
    statusText.innerText = `SENDING ${language.toUpperCase()}...`;
    statusText.style.color = '#fff';

    try {
        const res = await fetch('/api/meteor', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ language: language })
        });

        if (res.ok) {
            const data = await res.json();
            statusText.innerText = 'SENT!';
            statusText.style.color = '#00f3ff';
            setTimeout(() => {
                statusText.innerText = 'READY';
                statusText.style.color = '#6e7a8e';
            }, 1000);
        } else {
            throw new Error('API Error');
        }
    } catch (e) {
        statusText.innerText = 'ERROR';
        statusText.style.color = '#ff3333';
        console.error(e);
        setTimeout(() => {
            statusText.innerText = 'READY';
            statusText.style.color = '#6e7a8e';
        }, 2000);
    }
}

// 初期化
createButtons();