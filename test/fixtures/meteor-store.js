export function createMemoryMeteorStore() {
    const events = [], keys = new Set();
    let reads = 0;
    return {
        events,
        get reads() { return reads; },
        clear() { events.length = 0; keys.clear(); reads = 0; },
        async append(key, payload) {
            if (keys.has(key)) return null;
            keys.add(key);
            const id = String(events.length + 1);
            events.push({ id, payload }); return id;
        },
        async latestId() { return String(events.length); },
        async readAfter(cursor, limit = 100) {
            reads++;
            return events.filter((event) => BigInt(event.id) > BigInt(cursor)).slice(0, limit);
        },
        async cleanup() {}
    };
}
