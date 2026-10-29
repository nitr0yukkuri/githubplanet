import { localizedPath, t } from '../i18n.js';

export function showPlanetProgressToast(progressNotice = {}) {
    const achievementIds = Array.isArray(progressNotice.newlyUnlockedAchievementIds)
        ? progressNotice.newlyUnlockedAchievementIds
        : [];
    const contributionDelta = Math.max(0, Number(progressNotice.contributionDelta) || 0);
    if (achievementIds.length === 0 && contributionDelta === 0) return;

    document.querySelector('.achievement-unlock-toast')?.remove();

    const toast = document.createElement('aside');
    toast.className = 'achievement-unlock-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');

    const header = document.createElement('div');
    header.className = 'achievement-unlock-header';

    const title = document.createElement('strong');
    title.textContent = achievementIds.length > 0
        ? t('home.newAchievementsTitle', { count: achievementIds.length })
        : t('home.contributionGrowthTitle', {
            count: new Intl.NumberFormat(document.documentElement.lang || undefined).format(contributionDelta)
        });

    const closeButton = document.createElement('button');
    closeButton.className = 'achievement-unlock-close';
    closeButton.type = 'button';
    closeButton.textContent = '×';
    closeButton.setAttribute('aria-label', t('home.closeAchievementNotice'));
    closeButton.title = t('home.closeAchievementNotice');

    const dismiss = () => {
        toast.classList.remove('is-visible');
        window.setTimeout(() => toast.remove(), 220);
    };

    closeButton.addEventListener('click', dismiss);
    header.append(title, closeButton);
    toast.append(header);

    if (achievementIds.length > 0) {
        const names = document.createElement('p');
        names.className = 'achievement-unlock-names';
        const visibleIds = achievementIds.slice(0, 3);
        names.textContent = visibleIds
            .map((id) => t(`achievements.names.${id}`))
            .join(' / ');
        if (achievementIds.length > visibleIds.length) {
            names.textContent += ` ${t('home.newAchievementsMore', {
                count: achievementIds.length - visibleIds.length
            })}`;
        }

        const link = document.createElement('a');
        link.className = 'achievement-unlock-link';
        link.href = localizedPath('/achievements');
        link.textContent = t('home.viewAchievements');
        toast.append(names, link);
    }
    document.body.appendChild(toast);
    window.requestAnimationFrame(() => toast.classList.add('is-visible'));
    window.setTimeout(dismiss, 7000);
}

export function showLocalAchievementPreview() {
    const isLocal = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
    const isPreview = new URLSearchParams(window.location.search).has('preview-achievement');
    if (!isLocal || !isPreview) return;

    showPlanetProgressToast({
        contributionDelta: 128,
        newlyUnlockedAchievementIds: [
            'FIRST_PLANET',
            'FIRST_COMMIT',
            'COMMIT_100',
            'POLYGLOT_PIONEER'
        ]
    });
}

