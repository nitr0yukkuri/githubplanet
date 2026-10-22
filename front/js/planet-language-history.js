function percentagesFromPlanet(planet) {
    if (planet?.languagePercentages && typeof planet.languagePercentages === 'object') {
        return planet.languagePercentages;
    }

    const stats = planet?.languageStats;
    if (!stats || typeof stats !== 'object') return {};
    const entries = Object.entries(stats)
        .map(([language, value]) => [language, Number(value)])
        .filter(([, value]) => Number.isFinite(value) && value > 0);
    const total = entries.reduce((sum, [, value]) => sum + value, 0);
    if (total <= 0) return {};
    return Object.fromEntries(entries.map(([language, value]) => [language, value * 100 / total]));
}

function stateSignature(state) {
    const percentages = Object.entries(percentagesFromPlanet(state))
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([language, percentage]) => [language, Number(percentage).toFixed(2)]);
    return JSON.stringify([state.mainLanguage || '', state.planetColor || '', percentages]);
}

function normalizeSnapshot(snapshot) {
    if (!snapshot || !Number.isFinite(Date.parse(snapshot.capturedAt))) return null;
    const languagePercentages = Object.fromEntries(
        Object.entries(percentagesFromPlanet(snapshot))
            .filter(([language, percentage]) => (
                typeof language === 'string'
                && Number.isFinite(Number(percentage))
                && Number(percentage) >= 0
                && Number(percentage) <= 100
            ))
            .map(([language, percentage]) => [language, Number(percentage)])
    );
    if (!/^#[\da-f]{6}$/i.test(snapshot.planetColor || '')) return null;
    return {
        capturedAt: new Date(snapshot.capturedAt).toISOString(),
        mainLanguage: typeof snapshot.mainLanguage === 'string' ? snapshot.mainLanguage : 'Unknown',
        planetColor: snapshot.planetColor,
        languagePercentages
    };
}

export function buildPlanetLanguageHistory(history, current) {
    if (!Array.isArray(history) || !current) return [];

    const snapshots = history.map(normalizeSnapshot).filter(Boolean)
        .sort((left, right) => Date.parse(left.capturedAt) - Date.parse(right.capturedAt));
    const entries = [];
    for (const snapshot of snapshots) {
        if (entries.length && stateSignature(entries.at(-1)) === stateSignature(snapshot)) continue;
        entries.push(snapshot);
    }

    const currentState = {
        capturedAt: null,
        mainLanguage: current.mainLanguage || 'Unknown',
        planetColor: current.planetColor,
        languagePercentages: percentagesFromPlanet(current),
        isCurrent: true
    };
    if (!/^#[\da-f]{6}$/i.test(currentState.planetColor || '')) return [];
    if (entries.length && stateSignature(entries.at(-1)) === stateSignature(currentState)) {
        entries[entries.length - 1] = { ...entries.at(-1), isCurrent: true };
    } else {
        entries.push(currentState);
    }

    return entries.length > 1 ? entries : [];
}

export function buildPlanetLanguageYearStops(entries, now = Date.now()) {
    const stopsByYear = new Map();
    entries.forEach((entry, entryIndex) => {
        const capturedAt = Date.parse(entry.capturedAt);
        if (Number.isFinite(capturedAt)) {
            const capturedYear = new Date(capturedAt).getUTCFullYear();
            // 現在状態と同じでも、保存された過去年の停止位置は残しておく。
            stopsByYear.set(capturedYear, { year: capturedYear, entryIndex });
        }
        if (entry.isCurrent) {
            const currentYear = new Date(now).getUTCFullYear();
            stopsByYear.set(currentYear, { year: currentYear, entryIndex });
        }
    });
    return [...stopsByYear.values()];
}

export function createPlanetLanguageHistory({ element, onSelect, translate }) {
    const slider = element.querySelector('#planet-language-history-slider');
    const dateOutput = element.querySelector('#planet-language-history-date');
    const yearsElement = element.querySelector('#planet-language-history-years');
    let entries = [];
    let yearStops = [];
    let yearMarkers = [];
    let selectedIndex = -1;
    let selectedYearStopIndex = -1;
    let dispatchedIndex = -1;
    let pendingTimer = null;

    function clearPending() {
        if (pendingTimer !== null) window.clearTimeout(pendingTimer);
        pendingTimer = null;
    }

    function renderYearMarkers() {
        yearMarkers = [];
        yearsElement?.replaceChildren();
        if (!yearsElement || yearStops.length === 0) return;

        yearStops.forEach((stop, index) => {
            const marker = document.createElement('span');
            marker.className = 'planet-language-history-year';
            marker.dataset.year = String(stop.year);
            marker.dataset.selected = 'false';
            marker.style.left = `${yearStops.length > 1 ? index / (yearStops.length - 1) * 100 : 50}%`;
            marker.textContent = String(stop.year);
            yearsElement.append(marker);
            yearMarkers.push(marker);
        });
    }

    function updateSelection(value) {
        if (yearStops.length === 0) return;
        selectedYearStopIndex = Math.max(0, Math.min(yearStops.length - 1, Number(value) || 0));
        selectedIndex = yearStops[selectedYearStopIndex].entryIndex;
        slider.value = String(selectedYearStopIndex);
        const progress = yearStops.length > 1
            ? selectedYearStopIndex / (yearStops.length - 1) * 100
            : 0;
        element.style.setProperty('--language-history-progress', `${progress}%`);
        yearMarkers.forEach((marker) => {
            marker.dataset.selected = String(Number(marker.dataset.year) === yearStops[selectedYearStopIndex].year);
        });
        const selected = entries[selectedIndex];
        const description = selected.isCurrent
            ? translate('home.languageHistoryNow')
            : new Intl.DateTimeFormat(document.documentElement.lang || 'ja', {
                year: 'numeric', month: '2-digit', day: '2-digit'
            }).format(new Date(selected.capturedAt));
        dateOutput.textContent = description;
        slider.title = description;
        slider.setAttribute('aria-valuetext', description);
    }

    function dispatchSelection() {
        clearPending();
        if (selectedIndex < 0 || selectedIndex === dispatchedIndex) return;
        dispatchedIndex = selectedIndex;
        onSelect(entries[selectedIndex]);
    }

    slider.addEventListener('input', () => {
        updateSelection(slider.value);
        clearPending();
        // 言語別シェーダーの再生成を連続させないよう、ドラッグ中はまとめて反映する。
        pendingTimer = window.setTimeout(dispatchSelection, 180);
    });
    slider.addEventListener('change', dispatchSelection);
    slider.addEventListener('pointerup', dispatchSelection);
    slider.addEventListener('pointercancel', dispatchSelection);

    return {
        hide() {
            clearPending();
            entries = [];
            yearStops = [];
            yearMarkers = [];
            selectedIndex = selectedYearStopIndex = dispatchedIndex = -1;
            yearsElement?.replaceChildren();
            element.hidden = true;
        },
        show(history, current) {
            clearPending();
            entries = buildPlanetLanguageHistory(history, current);
            yearStops = buildPlanetLanguageYearStops(entries);
            if (entries.length < 2 || yearStops.length < 2) {
                this.hide();
                return;
            }
            slider.min = '0';
            slider.max = String(yearStops.length - 1);
            slider.step = '1';
            selectedYearStopIndex = yearStops.length - 1;
            selectedIndex = dispatchedIndex = yearStops[selectedYearStopIndex].entryIndex;
            renderYearMarkers();
            updateSelection(selectedYearStopIndex);
            element.hidden = false;
        }
    };
}
