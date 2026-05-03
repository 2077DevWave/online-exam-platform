export class DomainError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'DomainError';
    this.statusCode = statusCode;
  }
}

export function toErrorResponse(error: unknown): { statusCode: number; body: { error: string } } {
  if (error instanceof DomainError) {
    return { statusCode: error.statusCode, body: { error: error.message } };
  }
  return { statusCode: 500, body: { error: 'Internal server error' } };
}
