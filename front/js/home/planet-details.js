import { localizedPlanetName, localizedTitle } from '../i18n.js';

export function updatePlanetDetails(data) {
    const stats = document.getElementById('lang-stats-container');
    const commits = document.getElementById('commit-count-val');
    const name = document.getElementById('planet-name-val');
    const title = document.getElementById('planet-title-val');

    console.log('updatePlanetDetails called with:', data);

    if (stats) {
        stats.innerHTML = '';

        if (data.languageStats) {
            const entries = Object.entries(data.languageStats);

            if (entries.length > 0) {
                const total = entries.reduce((sum, [, bytes]) => sum + bytes, 0);

                if (total > 0) {
                    entries
                        .sort(([, a], [, b]) => b - a)
                        .slice(0, 3)
                        .forEach(([lang, bytes]) => {
                            const p = document.createElement('p');
                            const rawPercentage = (bytes / total) * 100;
                            const percentage = rawPercentage <= 1
                                ? rawPercentage.toFixed(1)
                                : Math.round(rawPercentage);
                            p.append(document.createTextNode(lang));
                            const percentageLabel = document.createElement('span');
                            percentageLabel.textContent = `${percentage}%`;
                            p.appendChild(percentageLabel);
                            stats.appendChild(p);
                        });
                }
            }
        }
    }

    if (commits) {
        const commitCount = data.isPublicPreview
            ? '—'
            : (data.totalCommits !== null && data.totalCommits !== undefined) ? data.totalCommits : 0;
        commits.textContent = commitCount;
    }

    if (title) {
        if (data.activeTitle) {
            title.textContent = localizedTitle(data.activeTitle);
        } else {
            title.textContent = '';
        }
    }

    if (name) {
        name.textContent = localizedPlanetName(data);
    }
}

