import assert from 'node:assert/strict';
import test from 'node:test';
import { createGithubPublicHistoryClient, parsePublicContributionCalendar, parsePublicContributionProfile } from '../src/infrastructure/external/github-public-history.js';

function calendar(days) {
    return days.map(([date, count], index) => `
        <td data-date="${date}" id="day-${index}" data-level="0"></td>
        <tool-tip for="day-${index}">${count === 0 ? 'No contributions' : `${count.toLocaleString('en-US')} contribution${count === 1 ? '' : 's'}`} on January 1st.</tool-tip>
    `).join('');
}

function calendarRange(from, to, counts = {}) {
    const result = [];
    for (let time = Date.parse(`${from}T00:00:00Z`); time <= Date.parse(`${to}T00:00:00Z`); time += 86_400_000) {
        const date = new Date(time).toISOString().slice(0, 10);
        result.push([date, counts[date] || 0]);
    }
    return calendar(result);
}

function profile(id, login, years) {
    return years.map((year, i) => `<a id="year-link-${year}" aria-label="Contribution activity in ${year}, ${i + 1} of ${years.length}" data-hydro-click="{&quot;profile_user_id&quot;:${id}}" href="/${login}?tab=overview">${year}</a>`).join('');
}

test('preserves a public 100+ day as a lower bound rather than an exact count', () => {
    const html = calendar([['2026-06-03',100]]).replace('100 contributions','100+ contributions');
    assert.deepEqual(parsePublicContributionCalendar(html,'2026-06-03','2026-06-03'),[
        {date:'2026-06-03',contributionCount:100,contributionCountIsLowerBound:true}
    ]);
});

test('verifies all declared years and the database identity without inventing an account creation date', () => {
    const result=parsePublicContributionProfile(profile(42,'canonical',[2026,2025]),42,'2026-10-21');
    assert.deepEqual(result,{githubLogin:'canonical',calendarYears:[2025,2026],calendarStartedAt:'2025-01-01T00:00:00.000Z'});
    assert.throws(()=>parsePublicContributionProfile(profile(99,'canonical',[2026,2025]),42,'2026-10-21'),/identity/);
    assert.throws(()=>parsePublicContributionProfile(profile(42,'canonical',[2026,2024]),42,'2026-10-21'),/incomplete/);
});

test('restores a profile whose REST endpoint is unavailable using only verified public years', async () => {
    const requests=[];
    const client=createGithubPublicHistoryClient({axios:{async get(url,config){
        requests.push(url);
        assert.equal(config.headers.Authorization,undefined);
        if(url==='https://github.com/old-name')return {data:profile(42,'canonical',[2025])};
        assert.equal(url,'https://github.com/users/canonical/contributions');
        return {data:calendar([['2025-01-01',1],['2025-01-02',0]])};
    }}});
    const result=await client.getPublicContributionHistory({githubId:42,username:'old-name',now:'2025-01-02T12:00:00Z'});
    assert.equal(requests.length,2);
    assert.equal(result.accountCreatedAt,null);
    assert.equal(result.calendarStartedAt,'2025-01-01T00:00:00.000Z');
    assert.equal(result.dailyContributions.length,2);
});

test('uses a verified numeric ID and the direct calendar when the activity page is unavailable', async () => {
    const client=createGithubPublicHistoryClient({axios:{async get(url){
        if(url==='https://github.com/old-name')throw Object.assign(new Error('Not Found'),{response:{status:404}});
        if(url==='https://api.github.com/user/42')return {data:{id:42,login:'new-name',created_at:'2025-01-01T12:00:00Z'}};
        assert.equal(url,'https://github.com/users/new-name/contributions');
        return {data:calendar([['2025-01-01',2],['2025-01-02',0]])};
    }}});
    const result=await client.getPublicContributionHistory({githubId:42,username:'old-name',now:'2025-01-02T12:00:00Z'});
    assert.equal(result.githubLogin,'new-name');
    assert.equal(result.accountCreatedAt,'2025-01-01T12:00:00.000Z');
    assert.equal(result.dailyContributions[0].contributionCount,2);
});

test('reads exact public daily counts instead of estimating activity from color levels', () => {
    const html = calendar([['2025-01-03', 1234], ['2025-01-01', 0], ['2025-01-02', 1]]);
    assert.deepEqual(parsePublicContributionCalendar(html, '2025-01-01', '2025-01-03'), [
        { date: '2025-01-01', contributionCount: 0 },
        { date: '2025-01-02', contributionCount: 1 },
        { date: '2025-01-03', contributionCount: 1234 }
    ]);
});

test('parses visible tooltip text without counting script or style contents', () => {
    const html = `
        <td data-date="2025-01-01" id="day-0" data-level="1"></td>
        <tool-tip for="day-0"><script>999 contributions on a forged date</script><span>2 contributions</span> on January 1st.</tool-tip>
    `;

    assert.deepEqual(parsePublicContributionCalendar(html, '2025-01-01', '2025-01-01'), [
        { date: '2025-01-01', contributionCount: 2 }
    ]);
    assert.throws(() => parsePublicContributionCalendar(`
        <td data-date="2025-01-01" id="day-0" data-level="1"></td>
        <tool-tip for="day-0"><script>999 contributions on a forged date</script></tool-tip>
    `, '2025-01-01', '2025-01-01'), /unreadable day/i);
});

test('rejects missing days, missing counts, and changed markup instead of inventing zero activity', () => {
    for (const html of [
        calendar([['2025-01-01', 1]]),
        '<td data-date="2025-01-01" id="day-0" data-level="4"></td>',
        calendar([['2025-01-01', 1], ['2025-01-02', 2]]).replace('2 contributions', 'unknown activity'),
        '<html>Please sign in</html>'
    ]) {
        assert.throws(() => parsePublicContributionCalendar(html, '2025-01-01', '2025-01-02'), /calendar/i);
    }
});

test('public history uses the saved GitHub ID and canonical login without a viewer token or DB writes', async () => {
    const requests = [];
    const client = createGithubPublicHistoryClient({ axios: {
        async get(url, config) {
            requests.push({ url, config });
            assert.equal(config.headers.Authorization, undefined);
            assert.equal(config.headers.Cookie, undefined);
            assert.ok(config.timeout > 0 && config.timeout <= 10_000);
            if (url === 'https://api.github.com/user/42') {
                return { data: { id: 42, login: 'renamed-user', created_at: '2024-12-31T12:00:00Z' } };
            }
            assert.equal(url, 'https://github.com/users/renamed-user/contributions');
            assert.equal(config.headers['Accept-Language'], 'en-US');
            const days = config.params.from.startsWith('2024')
                ? [['2024-12-31', 3]]
                : [['2025-01-01', 1], ['2025-01-02', 0]];
            return { data: calendar(days) };
        }
    } });

    const options = { githubId: '42', now: '2025-01-02T12:00:00Z' };
    const [history, shared] = await Promise.all([
        client.getPublicContributionHistory(options), client.getPublicContributionHistory(options)
    ]);
    assert.equal(shared, history);
    assert.equal(requests.length, 3);
    assert.equal(history.accountCreatedAt, '2024-12-31T12:00:00.000Z');
    assert.equal(history.capturedAt, '2025-01-02T12:00:00.000Z');
    assert.deepEqual(history.dailyContributions, [
        { date: '2024-12-31', contributionCount: 3 },
        { date: '2025-01-01', contributionCount: 1 },
        { date: '2025-01-02', contributionCount: 0 }
    ]);
    assert.equal(await client.getPublicContributionHistory(options), history);
    assert.equal(requests.length, 3);
});

test('refreshes only the current and previous calendar years, then merges the saved older days', async () => {
    const requests = [];
    const client = createGithubPublicHistoryClient({ axios: {
        async get(url, config) {
            requests.push({ url, params: config.params });
            if (url === 'https://github.com/old-name') return { data: profile(42, 'canonical', [2024, 2025, 2026]) };
            assert.equal(url, 'https://github.com/users/canonical/contributions');
            return { data: calendarRange(config.params.from, config.params.to, {
                '2025-01-01': 7,
                '2026-01-01': 4,
                '2026-01-02': 2
            }) };
        }
    } });

    const history = await client.getPublicContributionHistory({
        githubId: 42,
        username: 'old-name',
        now: '2026-01-02T12:00:00Z',
        existingHistory: {
            githubLogin: 'old-name',
            calendarStartedAt: '2024-01-01T00:00:00.000Z',
            calendarYears: [2024, 2025],
            capturedAt: '2025-12-31T12:00:00.000Z',
            dailyContributions: [
                { date: '2024-04-01', contributionCount: 3 },
                { date: '2025-12-30', contributionCount: 1 }
            ]
        }
    });

    assert.deepEqual(requests.slice(1).map(({ params }) => params.from.slice(0, 4)), ['2025', '2026']);
    assert.equal(requests.length, 3);
    assert.deepEqual(history.calendarYears, [2024, 2025, 2026]);
    assert.deepEqual(history.dailyContributions.find(({ date }) => date === '2024-04-01'), {
        date: '2024-04-01', contributionCount: 3
    });
    assert.deepEqual(history.dailyContributions.find(({ date }) => date === '2025-01-01'), {
        date: '2025-01-01', contributionCount: 7
    });
    assert.deepEqual(history.dailyContributions.slice(-2), [
        { date: '2026-01-01', contributionCount: 4 },
        { date: '2026-01-02', contributionCount: 2 }
    ]);
});

test('caches unavailable accounts briefly and never substitutes a different account', async () => {
    let requests = 0;
    const client = createGithubPublicHistoryClient({ axios: {
        async get() { requests += 1; throw Object.assign(new Error('Not Found'), { response: { status: 404 } }); }
    } });
    const load = () => client.getPublicContributionHistory({ githubId: 42, now: '2025-01-02' });
    await assert.rejects(load, /Not Found/);
    await assert.rejects(load, /Not Found/);
    assert.equal(requests, 1);

    const mismatched = createGithubPublicHistoryClient({ axios: {
        async get() { return { data: { id: 99, login: 'unrelated', created_at: '2020-01-01' } }; }
    } });
    await assert.rejects(() => mismatched.getPublicContributionHistory({ githubId: 42 }), /identity/i);
});

test('limits concurrent public calendar requests across different visitors', async () => {
    let active = 0;
    let peak = 0;
    const client = createGithubPublicHistoryClient({ axios: {
        async get(url) {
            active += 1;
            peak = Math.max(peak, active);
            await new Promise(resolve => setTimeout(resolve, 2));
            active -= 1;
            const id = url.match(/\/user\/(\d+)$/)?.[1];
            return { data: id
                ? { id, login: `user-${id}`, created_at: '2025-01-01' }
                : calendar([['2025-01-01', 1], ['2025-01-02', 0]]) };
        }
    } });
    await Promise.all([1, 2, 3, 4, 5, 6].map(githubId => (
        client.getPublicContributionHistory({ githubId, now: '2025-01-02' })
    )));
    assert.ok(peak <= 3);
});

test('waits for GitHub rate-limit reset before retrying the public profile', async (t) => {
    let now = Date.UTC(2026, 9, 21);
    t.mock.method(Date, 'now', () => now);
    let requests = 0;
    const client = createGithubPublicHistoryClient({ axios: {
        async get() {
            requests += 1;
            throw Object.assign(new Error('Rate limited'), {
                response: { status: 403, headers: { 'x-ratelimit-reset': String((now + 120_000) / 1_000) } }
            });
        }
    } });
    const options = { githubId: 42, now: new Date(now) };
    await assert.rejects(() => client.getPublicContributionHistory(options), /Rate limited/);
    now += 60_000;
    await assert.rejects(() => client.getPublicContributionHistory(options), /Rate limited/);
    assert.equal(requests, 1);
});
