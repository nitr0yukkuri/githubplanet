import { randomBytes, timingSafeEqual } from 'node:crypto';

export function issueSessionCsrfToken(req, res) {
    res.set('Cache-Control', 'private, no-store');
    if (!req.session?.planetData?.user?.id) return res.status(401).json({ error: 'Not logged in' });
    req.session.csrfToken ||= randomBytes(32).toString('hex');
    return res.json({ csrfToken: req.session.csrfToken });
}

export function verifyCsrfToken(expected, supplied) {
    if (typeof expected !== 'string' || typeof supplied !== 'string'
        || !/^[a-f0-9]{64}$/.test(expected) || !/^[a-f0-9]{64}$/.test(supplied)) return false;
    return timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}
