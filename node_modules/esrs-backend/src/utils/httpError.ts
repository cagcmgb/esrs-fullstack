export class HttpError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function badRequest(message: string, details?: unknown) {
  return new HttpError(400, message, details);
}

export function unauthorized(message: string = 'Unauthorized') {
  return new HttpError(401, message);
}

export function forbidden(message: string = 'Forbidden') {
  return new HttpError(403, message);
}

export function notFound(message: string = 'Not Found') {
  return new HttpError(404, message);
}
