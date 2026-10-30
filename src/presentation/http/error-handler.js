import { STATUS_CODES } from 'node:http';
import { safeErrorMetadata } from '../../shared/error-metadata.js';

export function createErrorHandler({ logger = console } = {}) {
    return function handleError(error, _req, res, _next) {
        const metadata = safeErrorMetadata(error);
        logger.error('[HTTP Error]', metadata);
        // Expressの既定処理へ元の例外を渡すとstackが記録されるため、送信済みなら接続だけを閉じる。
        if (res.headersSent) return res.destroy();
        const status = metadata.status >= 400 ? metadata.status : 500;
        return res.status(status).type('text/plain').send(STATUS_CODES[status] || 'Internal Server Error');
    };
}
