import { applyI18n, t } from './i18n.js';

const prefixSelect = document.getElementById('prefix-select');
const suffixSelect = document.getElementById('suffix-select');
const previewPrefix = document.getElementById('preview-prefix');
const previewSuffix = document.getElementById('preview-suffix');
const saveBtn = document.getElementById('save-btn');

let currentPrefix = '';
let currentSuffix = '';

function updatePreview() {
    currentPrefix = prefixSelect.value;
    currentSuffix = suffixSelect.value;
    previewPrefix.textContent = currentPrefix;
    previewSuffix.textContent = currentSuffix;
}

prefixSelect.addEventListener('change', updatePreview);
suffixSelect.addEventListener('change', updatePreview);

saveBtn.addEventListener('click', async () => {
    try {
        const res = await fetch('/api/save-title', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prefix: currentPrefix, suffix: currentSuffix })
        });
        if (res.ok) {
            alert(t('settings.saved'));
        } else {
            alert(t('settings.saveFailed'));
        }
    } catch (e) {
        console.error(e);
        alert(t('settings.networkError'));
    }
});

async function init() {
    applyI18n();

    try {
        const res = await fetch('/api/me');
        if (!res.ok) {
            const settingsContainer = document.querySelector('.settings-container');
            settingsContainer.innerHTML = `<p>${t('common.loginRequired')}</p><a href="/" class="back-button">${t('common.back')}</a>`;
            applyI18n(settingsContainer);
            return;
        }
        const data = await res.json();
        const { planetData } = data;

        const unlocked = planetData.unlockedTitles || { prefixes: ['名もなき'], suffixes: ['旅人'] };
        const active = planetData.activeTitle || { prefix: '名もなき', suffix: '旅人' };

        // 選択肢の生成
        unlocked.prefixes.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p;
            opt.textContent = p;
            if (p === active.prefix) opt.selected = true;
            prefixSelect.appendChild(opt);
        });

        unlocked.suffixes.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s;
            opt.textContent = s;
            if (s === active.suffix) opt.selected = true;
            suffixSelect.appendChild(opt);
        });

        updatePreview();

    } catch (e) {
        console.error('Error fetching settings:', e);
    }
}

document.addEventListener('DOMContentLoaded', init);
