export function createCanonicalHostRedirect({ publicBaseUrl, isProduction }) {
    const normalizedPublicBaseUrl = publicBaseUrl.replace(/\/+$/, '');
    const canonicalHostname = new URL(normalizedPublicBaseUrl).hostname.toLowerCase();
    const knownAliases = new Set([
        'githubplanet.onrender.com',
        `www.${canonicalHostname}`
    ]);

    return (req, res, next) => {
        if (!['GET', 'HEAD'].includes(req.method.toUpperCase())) return next();

        const hostname = req.hostname?.toLowerCase();
        if (!hostname || hostname === canonicalHostname) return next();

        const isCloudRunAlias = isProduction && hostname.endsWith('.run.app');
        if (!knownAliases.has(hostname) && !isCloudRunAlias) return next();

        return res.redirect(301, `${normalizedPublicBaseUrl}${req.originalUrl}`);
    };
}
