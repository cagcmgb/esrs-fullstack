import { HttpError } from '../utils/httpError.js';
export function errorHandler(err, _req, res, _next) {
    if (err instanceof HttpError) {
        // Don't print full error objects for expected client errors (401/403/4xx).
        // Log briefly for visibility, but avoid noisy stack traces in dev console.
        // eslint-disable-next-line no-console
        if (err.status >= 500)
            console.error(err);
        else
            console.warn(`${err.status} ${err.message}`);
        return res.status(err.status).json({
            error: err.message,
            details: err.details ?? null
        });
    }
    // Unexpected errors: log full details and return 500.
    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(500).json({
        error: 'Internal Server Error'
    });
}
