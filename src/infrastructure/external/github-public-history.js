import { measureExternalOperation } from '../observability/external-performance.js';

const DAY_MS = 86_400_000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1_000;
const MAX_CACHE_ENTRIES = 32;
const MAX_CONCURRENT_REQUESTS = 3;
const HISTORY_DEADLINE_MS = 30_000;

function attribute(tag, name) {
    return tag.match(new RegExp(`(?:^|\\s)${name}=["']([^"']*)["']`, 'i'))?.[1];
}

function extractTooltipText(markup) {
    let text = '';
    let tag = '';
    let inTag = false;
    let quote = '';
    let ignoredTag = '';

    for (const character of String(markup)) {
        if (!inTag) {
            if (character === '<') {
                inTag = true;
                tag = '';
                quote = '';
                text += ' ';
            } else if (!ignoredTag) {
                text += character;
            }
            continue;
        }

        if (quote) {
            if (character === quote) quote = '';
            continue;
        }
        if (character === '"' || character === "'") {
            quote = character;
            continue;
        }
        if (character !== '>') {
            tag += character;
            continue;
        }

        inTag = false;
        let index = 0;
        while (/\s/.test(tag[index] || '')) index++;
        const closing = tag[index] === '/';
        if (closing) index++;
        const nameStart = index;
        while (/[a-z0-9:-]/i.test(tag[index] || '')) index++;
        const name = tag.slice(nameStart, index).toLowerCase();

        // Tooltip text is only parsed as a contribution count; active-content bodies are never data.
        if (!closing && (name === 'script' || name === 'style')) ignoredTag = name;
        else if (closing && name === ignoredTag) ignoredTag = '';
        if (!ignoredTag) text += ' ';
    }

    return text.trim();
}

export function parsePublicContributionCalendar(html, from, to) {
    const counts = new Map();
    for (const match of String(html).matchAll(/<tool-tip\b([^>]*)>([\s\S]*?)<\/tool-tip>/gi)) {
        const text = extractTooltipText(match[2]);
        const count = text.match(/^(No|\d[\d,]*)(\+)? contributions?\s+on\b/i);
        if (count && !(count[2] && /^no$/i.test(count[1]))) {
            counts.set(attribute(match[1], 'for'), {
                contributionCount: /^no$/i.test(count[1]) ? 0 : Number(count[1].replaceAll(',', '')),
                ...(count[2] ? { contributionCountIsLowerBound: true } : {})
            });
        }
    }
    const days = new Map();
    for (const match of String(html).matchAll(/<td\b[^>]*>/gi)) {
        const date = attribute(match[0], 'data-date');
        if (!date || date < from || date > to) continue;
        const count = counts.get(attribute(match[0], 'id'));
        if (!Number.isSafeInteger(count?.contributionCount) || count.contributionCount < 0 || days.has(date)) {
            throw new Error('Public contribution calendar has an unreadable day');
        }
        days.set(date, count);
    }
    const first = Date.parse(`${from}T00:00:00Z`);
    const last = Date.parse(`${to}T00:00:00Z`);
    if (!Number.isFinite(first) || !Number.isFinite(last) || last < first || last - first >= 366 * DAY_MS) {
        throw new Error('Invalid public contribution calendar range');
    }
    const result = [];
    for (let timestamp = first; timestamp <= last; timestamp += DAY_MS) {
        const date = new Date(timestamp).toISOString().slice(0, 10);
        // HTML変更や部分取得を0件の活動と誤認すると、存在しない過去の惑星を生成してしまう。
        if (!days.has(date)) throw new Error('Public contribution calendar is incomplete');
        result.push({ date, ...days.get(date) });
    }
    return result;
}

export function parsePublicContributionProfile(html, githubId, now = new Date()) {
    const links = [...String(html).matchAll(/<a\b[^>]*\bid=["']year-link-(\d{4})["'][^>]*>[\s\S]*?<\/a>/gi)];
    const ids = [...new Set(links.flatMap(link => [...link[0].matchAll(
        /(?:&quot;|")profile_user_id(?:&quot;|")\s*:\s*(\d+)/g
    )].map(match => match[1])))];
    if (ids.length !== 1 || ids[0] !== String(githubId)) throw new Error('Public contribution history identity is invalid');
    const calendarYears = [...new Set(links.map(link => Number(link[1])))].sort((a, b) => a - b);
    const declaredCount = Number(links[0]?.[0].match(/Contribution activity in \d{4}, \d+ of (\d+)/)?.[1]);
    const year = new Date(now).getUTCFullYear();
    if (!calendarYears.length || calendarYears[0] < 2008 || calendarYears.at(-1) !== year
        || declaredCount !== calendarYears.length || calendarYears.length !== year - calendarYears[0] + 1) {
        throw new Error('Public contribution history year list is incomplete');
    }
    const href = attribute(links[0][0], 'href')?.replaceAll('&amp;', '&');
    const url = new URL(href || '', 'https://github.com');
    const githubLogin = decodeURIComponent(url.pathname.slice(1));
    if (url.origin !== 'https://github.com' || !/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(githubLogin)) {
        throw new Error('Public contribution history identity is invalid');
    }
    return {
        githubLogin, calendarYears,
        // 公開年一覧から分かるのは取得範囲であり、未確認のアカウント作成日時としては保存しない。
        calendarStartedAt: new Date(Date.UTC(calendarYears[0], 0, 1)).toISOString()
    };
}

export function createGithubPublicHistoryClient({ axios, onRequestTiming, minRequestIntervalMs = 0 }) {
    const cache = new Map();
    let activeRequests = 0;
    const waiters = [];
    let nextRequestAt = 0;

    async function request(url, options, deadline, state) {
        if (activeRequests < MAX_CONCURRENT_REQUESTS) activeRequests += 1;
        else await new Promise(resolve => waiters.push(resolve));
        try {
            if (state.failed) throw new Error('Public contribution history request was cancelled');
            const requestAt = Math.max(Date.now(), nextRequestAt);
            nextRequestAt = requestAt + minRequestIntervalMs;
            if (requestAt > Date.now()) await new Promise(resolve => setTimeout(resolve, requestAt - Date.now()));
            const remaining = deadline - Date.now();
            if (state.failed || remaining <= 0) throw new Error('Public contribution history deadline exceeded');
            return await axios.get(url, {
                ...options,
                timeout: Math.min(10_000, remaining),
                maxContentLength: 2 * 1024 * 1024,
                headers: { Accept: 'text/html', 'Accept-Language': 'en-US', ...options.headers }
            });
        } finally {
            const next = waiters.shift();
            if (next) next();
            else activeRequests -= 1;
        }
    }

    async function load(githubId, username, through, existingHistory = null, deadlineMs = HISTORY_DEADLINE_MS) {
        const deadline = Date.now() + deadlineMs;
        const state = { failed: false };
        let profile = null;
        let accountCreatedAt = null;
        if (/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(username || '')) {
            try {
                // 通常ページやRESTが404でも公開活動は読める。年一覧内の数値IDで本人を照合する。
                const { data } = await request(`https://github.com/${encodeURIComponent(username)}`, {
                    params: { action: 'show', controller: 'profiles', tab: 'contributions', user_id: username },
                    headers: { 'X-Requested-With': 'XMLHttpRequest' }
                }, deadline, state);
                profile = parsePublicContributionProfile(data, githubId, through);
            } catch (error) {
                if ([403, 429].includes(error.response?.status)) throw error;
            }
        }
        if (!profile) {
            // 公開活動ページがない人や旧名は、数値IDで現在名と実際の作成日を確かめてカレンダーを直接読む。
            const { data: user } = await request(`https://api.github.com/user/${githubId}`, {
                headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
            }, deadline, state);
            const createdAt = new Date(user?.created_at);
            if (String(user?.id) !== githubId || !/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(user?.login || '')
                || !Number.isFinite(createdAt.getTime()) || createdAt.getUTCFullYear() < 2008 || createdAt > through) {
                throw new Error('Public contribution history identity is invalid');
            }
            accountCreatedAt = createdAt.toISOString();
            profile = { githubLogin: user.login,
                calendarStartedAt: new Date(Date.UTC(createdAt.getUTCFullYear(), createdAt.getUTCMonth(), createdAt.getUTCDate())).toISOString(),
                calendarYears: Array.from({ length: through.getUTCFullYear() - createdAt.getUTCFullYear() + 1 }, (_, i) => createdAt.getUTCFullYear() + i) };
        }
        const profileStartedAt = Date.parse(profile.calendarStartedAt);
        if (!Number.isFinite(profileStartedAt) || profileStartedAt > through.getTime()) {
            throw new Error('Public contribution history range is invalid');
        }

        const existingStartedAt = Date.parse(existingHistory?.calendarStartedAt);
        const existingCapturedAt = Date.parse(existingHistory?.capturedAt);
        const existingYears = existingHistory?.calendarYears;
        const existingDays = existingHistory?.dailyContributions;
        const existingFirstDate = Number.isFinite(existingStartedAt)
            ? new Date(existingStartedAt).toISOString().slice(0, 10)
            : '';
        const existingLastDate = Number.isFinite(existingCapturedAt)
            ? new Date(existingCapturedAt).toISOString().slice(0, 10)
            : '';
        const existingDates = new Set();
        const existingHistoryIsComplete = Number.isFinite(existingStartedAt)
            && Number.isFinite(existingCapturedAt)
            && existingStartedAt <= existingCapturedAt
            && existingCapturedAt <= through.getTime()
            && Array.isArray(existingYears)
            && existingYears.length > 0
            && existingYears[0] === new Date(existingStartedAt).getUTCFullYear()
            && existingYears.at(-1) === new Date(existingCapturedAt).getUTCFullYear()
            && existingYears[0] >= 2008
            && existingYears.every((year, index) => year === existingYears[0] + index)
            && Array.isArray(existingDays)
            && existingDays.every((day) => {
                const date = day?.date;
                const timestamp = Date.parse(`${date}T00:00:00Z`);
                const valid = /^\d{4}-\d{2}-\d{2}$/.test(date || '')
                    && date >= existingFirstDate && date <= existingLastDate
                    && Number.isFinite(timestamp)
                    && new Date(timestamp).toISOString().slice(0, 10) === date
                    && Number.isSafeInteger(day.contributionCount)
                    && day.contributionCount >= 0
                    && !existingDates.has(date)
                    && (day.contributionCountIsLowerBound === undefined
                        || typeof day.contributionCountIsLowerBound === 'boolean');
                if (valid) existingDates.add(date);
                return valid;
            });
        const startedAt = existingHistoryIsComplete
            ? Math.min(profileStartedAt, existingStartedAt)
            : profileStartedAt;
        const currentYear = through.getUTCFullYear();
        const firstYear = new Date(startedAt).getUTCFullYear();
        const calendarYears = Array.from({ length: currentYear - firstYear + 1 }, (_, index) => firstYear + index);
        const yearsToFetch = existingHistoryIsComplete
            ? calendarYears.filter(year => year >= currentYear - 1
                || !existingYears.includes(year)
                || (year === firstYear && startedAt < existingStartedAt))
            : calendarYears;
        const existingCounts = new Map((existingHistoryIsComplete ? existingDays : []).map(day => [day.date, day]));
        const fetchedCounts = new Map();
        const yearRequests = [];
        for (const year of yearsToFetch) {
            const from = new Date(Math.max(Date.UTC(year, 0, 1), startedAt)).toISOString().slice(0, 10);
            const to = new Date(Math.min(Date.UTC(year + 1, 0, 1) - 1, through.getTime())).toISOString().slice(0, 10);
            yearRequests.push(request(`https://github.com/users/${encodeURIComponent(profile.githubLogin)}/contributions`, {
                params: { from, to }
            }, deadline, state).then(({ data }) => {
                for (const day of parsePublicContributionCalendar(data, from, to)) fetchedCounts.set(day.date, day);
            }).catch(error => {
                state.failed = true;
                throw error;
            }));
        }
        await Promise.all(yearRequests);
        const firstDate = new Date(startedAt).toISOString().slice(0, 10);
        const lastDate = through.toISOString().slice(0, 10);
        const dailyContributions = [];
        for (let timestamp = Date.parse(`${firstDate}T00:00:00Z`);
            timestamp <= Date.parse(`${lastDate}T00:00:00Z`); timestamp += DAY_MS) {
            const date = new Date(timestamp).toISOString().slice(0, 10);
            dailyContributions.push(fetchedCounts.get(date) || existingCounts.get(date) || {
                date, contributionCount: 0
            });
        }
        return {
            ...profile,
            calendarStartedAt: new Date(startedAt).toISOString(),
            calendarYears,
            accountCreatedAt,
            dailyContributions,
            capturedAt: through.toISOString()
        };
    }

    return {
        async getPublicContributionHistory({
            githubId,
            username,
            now = new Date(),
            existingHistory = null,
            deadlineMs = HISTORY_DEADLINE_MS
        }) {
            const id = String(githubId);
            const through = new Date(now);
            if (!/^[1-9]\d{0,19}$/.test(id) || !Number.isFinite(through.getTime())) {
                throw new Error('Public contribution history identity is invalid');
            }
            const safeDeadlineMs = Math.max(1_000, Math.min(90_000, Math.trunc(Number(deadlineMs)) || HISTORY_DEADLINE_MS));
            const key = `${id}:${through.toISOString().slice(0, 10)}`;
            const existing = cache.get(key);
            if (existing && (existing.promise || existing.expiresAt > Date.now())) {
                if (existing.error) throw existing.error;
                return existing.promise || existing.value;
            }
            cache.delete(key);
            while (cache.size >= MAX_CACHE_ENTRIES) {
                const removable = [...cache].find(([, entry]) => !entry.promise)?.[0];
                if (!removable) throw new Error('Public contribution history is busy');
                cache.delete(removable);
            }
            const entry = { promise: null, expiresAt: 0, value: null, error: null };
            entry.promise = measureExternalOperation(onRequestTiming, 'public_contribution_history', () => (
                load(id, username, through, existingHistory, safeDeadlineMs)
            ), { provider: 'github' });
            cache.set(key, entry);
            try {
                entry.value = await entry.promise;
                entry.expiresAt = Date.now() + CACHE_TTL_MS;
                return entry.value;
            } catch (error) {
                entry.error = error;
                const retryAfterMs = Number(error.response?.headers?.['retry-after']) * 1_000 || 0;
                const resetDelayMs = (Number(error.response?.headers?.['x-ratelimit-reset']) * 1_000 || 0) - Date.now();
                entry.expiresAt = Date.now() + Math.min(60 * 60 * 1_000, Math.max(30_000, retryAfterMs, resetDelayMs));
                throw error;
            } finally {
                entry.promise = null;
            }
        }
    };
}
