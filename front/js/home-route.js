export const DEFAULT_SHOWCASE_SLUG = 'typescript';

function normalizePath(pathname) {
    const withoutTrailingSlash = pathname.replace(/\/+$/, '');
    return withoutTrailingSlash || '/';
}

function stripLocale(pathname) {
    return pathname.replace(/^\/(?:en|english)(?=\/|$)/, '') || '/';
}

export function resolveHomeRoute(pathname, search = '') {
    const normalizedPath = stripLocale(normalizePath(pathname));
    const query = new URLSearchParams(search);
    const querySlug = query.get('showcase')?.trim().toLowerCase() || null;

    if (normalizedPath === '/exhibition') {
        return { mode: 'exhibition', showcaseSlug: null };
    }

    if (normalizedPath === '/showcase') {
        return {
            mode: 'showcase',
            showcaseSlug: querySlug || DEFAULT_SHOWCASE_SLUG
        };
    }

    if (normalizedPath.startsWith('/showcase/')) {
        const slug = normalizedPath.slice('/showcase/'.length).split('/')[0].trim().toLowerCase();
        return {
            mode: 'showcase',
            showcaseSlug: slug || DEFAULT_SHOWCASE_SLUG
        };
    }

    if (querySlug) {
        return { mode: 'showcase', showcaseSlug: querySlug };
    }

    return { mode: 'normal', showcaseSlug: null };
}
