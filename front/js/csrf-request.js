export async function postWithCsrf(url, options = {}) {
    // Cookieだけで成立する更新を防ぎ、同一originで取得したsession専用tokenを添える。
    const tokenResponse = await fetch('/api/csrf-token', { cache: 'no-store' });
    if (!tokenResponse.ok) return tokenResponse;
    const { csrfToken } = await tokenResponse.json();
    const headers = new Headers(options.headers);
    headers.set('X-CSRF-Token', csrfToken);
    return fetch(url, { ...options, method: 'POST', headers });
}
