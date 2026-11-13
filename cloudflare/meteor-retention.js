const DAY = 86_400_000;
export async function pruneMeteorEvents(storage, now = Date.now()) {
    const previous = await storage.get('cleanup');
    const entries = await storage.list({ prefix: 'event:', limit: 1000,
        ...(previous?.cursor ? { startAfter: previous.cursor } : {}) });
    const expired = [];
    let nextExpiry = previous?.nextExpiry ?? null;
    for (const [key, value] of entries) {
        if (value.at + DAY <= now) expired.push(key);
        else nextExpiry = Math.min(nextExpiry ?? Infinity, value.at + DAY);
    }
    if (expired.length) await storage.delete(expired);
    if (entries.size === 1000) {
        // 一日1000件で掃除を打ち切らず、短い処理へ分割して末尾まで進む。
        await storage.put('cleanup', { cursor: [...entries.keys()].at(-1), nextExpiry });
        await storage.setAlarm(now + 1000);
        return;
    }
    if (previous) await storage.delete('cleanup');
    if (nextExpiry !== null || (await storage.list({ prefix: 'event:', limit: 1 })).size) {
        await storage.setAlarm(Math.max(now + 1000, nextExpiry ?? now + DAY));
    }
}
