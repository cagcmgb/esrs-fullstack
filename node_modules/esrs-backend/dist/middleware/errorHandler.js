import { HttpError } from '../utils/httpError.js';
export function errorHandler(err, _req, res, _next) {
    // eslint-disable-next-line no-console
    console.error(err);
    if (err instanceof HttpError) {
        return res.status(err.status).json({
            error: err.message,
            details: err.details ?? null
        });
    }
    return res.status(500).json({
        error: 'Internal Server Error'
    });
}
