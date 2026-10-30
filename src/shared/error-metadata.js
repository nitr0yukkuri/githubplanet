const ERROR_NAMES = new Set([
    'Error', 'AxiosError', 'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError',
    'URIError', 'EvalError', 'AbortError', 'AggregateError'
]);
const ERROR_CODES = new Set([
    'ECONNRESET', 'ECONNREFUSED', 'ECONNABORTED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN',
    'EPIPE', 'EHOSTUNREACH', 'ENETUNREACH', 'ABORT_ERR', 'ERR_CANCELED', 'ERR_NETWORK',
    'ERR_BAD_REQUEST', 'ERR_BAD_RESPONSE', 'ERR_INVALID_URL', 'ERR_INVALID_ARG_TYPE',
    'ERR_FR_TOO_MANY_REDIRECTS', 'ERR_DATABASE', 'ENOENT', 'EACCES', 'ENOSPC',
    '08000', '08001', '08003', '08006', '08004', '08007', '08P01', '22001', '22P02',
    '23502', '23503', '23505', '23514', '28000', '28P01', '40001', '40P01', '42501',
    '42601', '42703', '42P01', '53300', '53400', '55000', '57014', '57P01', '57P02', '57P03',
    'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'CERT_HAS_EXPIRED', 'ERR_TLS_CERT_ALTNAME_INVALID'
]);

export function safeErrorMetadata(error) {
    // message/stack/config/response本文には認証情報が入るため、伏字処理ではなく許可した診断値だけを返す。
    const fallback = { errorName: 'Error', errorCode: 'unknown' };
    try {
        const name = error?.name;
        const code = error?.code;
        const errorName = ERROR_NAMES.has(name) ? name : 'Error';
        const errorCode = ERROR_CODES.has(code) ? code : 'unknown';
        const status = error?.response?.status ?? error?.status ?? error?.statusCode;
        return {
            errorName,
            errorCode,
            ...(Number.isInteger(status) && status >= 100 && status <= 599 ? { status } : {})
        };
    } catch {
        return fallback;
    }
}
