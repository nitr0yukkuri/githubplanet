export async function checkRequestBudget(storage, windowMs, limit, now = Date.now()) {
    let value = await storage.get('budget');
    const fresh = !value || value.reset <= now;
    if (fresh) value = { count: 0, reset: now + windowMs };
    // 拒否済み要求の連打で、流星やジョブと共有する日次書込み枠を使い切らせない。
    if (value.count >= limit) return { allowed: false, remaining: 0, reset: value.reset };
    value.count += 1;
    await storage.put('budget', value);
    if (fresh || await storage.getAlarm() === null) await storage.setAlarm(value.reset);
    return { allowed: true, remaining: Math.max(0, limit - value.count), reset: value.reset };
}
