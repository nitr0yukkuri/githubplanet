export function createMeteorConnection({ io, windowRef = window, documentRef = document } = {}) {
    const transport = documentRef.querySelector('meta[name="githubplanet-realtime-transport"]')?.content;
    if (transport !== 'websocket') {
        const origin = windowRef.location.hostname === 'githubplanet.dev'
            ? 'https://githubplanet-git-e7ranic5ja-dt.a.run.app' : windowRef.location.origin;
        const socket = io(origin, { transports: ['websocket', 'polling'] });
        socket.on('connect', () => console.info('Realtime meteor connected (' + (socket.io.engine?.transport?.name || 'unknown') + ')'));
        socket.on('connect_error', () => { socket.io.opts.transports = ['polling', 'websocket']; });
        return socket;
    }
    const endpoint = documentRef.querySelector('meta[name="githubplanet-realtime-url"]')?.content || '/realtime';
    const url = new URL(endpoint, windowRef.location.href);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const listeners = new Map();
    const seen = new Set();
    let socket, retryTimer, heartbeat, attempt = 0, stopped = false, lastMessage = 0;
    const emit = (type, value) => { for (const handler of listeners.get(type) || []) handler(value); };
    function connect() {
        if (stopped) return;
        windowRef.clearTimeout(retryTimer);
        if (socket && socket.readyState < 2) return;
        const current = new windowRef.WebSocket(url);
        socket = current;
        current.addEventListener('open', () => {
            if (socket !== current) return;
            attempt = 0; lastMessage = Date.now(); emit('connect');
            heartbeat = windowRef.setInterval(() => {
                if (Date.now() - lastMessage > 90_000) current.close();
                else if (current.readyState === 1) current.send('ping');
            }, 30_000);
        });
        current.addEventListener('message', (message) => {
            if (socket !== current) return;
            lastMessage = Date.now();
            if (message.data === 'pong') return;
            try {
                const event = JSON.parse(message.data);
                if (event.type !== 'meteor' || typeof event.id !== 'string' || seen.has(event.id)) return;
                const payload = event.payload;
                if (!/^#[a-f0-9]{6}$/i.test(payload?.color || '') || !Number.isFinite(payload.scale) || payload.scale <= 0 || payload.scale > 2 || typeof payload.language !== 'string') return;
                seen.add(event.id);
                if (seen.size > 256) seen.delete(seen.values().next().value);
                emit('meteor', payload);
            } catch { /* 不完全なフレームを演出へ渡さない。 */ }
        });
        current.addEventListener('error', () => { if (socket === current) emit('connect_error'); });
        current.addEventListener('close', () => {
            if (socket !== current) return;
            socket = null;
            windowRef.clearInterval(heartbeat);
            if (!stopped) retryTimer = windowRef.setTimeout(connect, Math.min(30_000, 1000 * 2 ** Math.min(attempt++, 5)) * (0.75 + Math.random() * 0.5));
        });
    }
    const disconnect = () => { stopped = true; windowRef.clearTimeout(retryTimer); windowRef.clearInterval(heartbeat); const previous = socket; socket = null; previous?.close(); };
    windowRef.addEventListener('pagehide', disconnect);
    windowRef.addEventListener('pageshow', () => { if (stopped) { stopped = false; connect(); } });
    connect();
    return { on(type, handler) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(handler); return this; }, disconnect };
}
