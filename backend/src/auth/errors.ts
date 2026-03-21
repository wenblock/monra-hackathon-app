export class InvalidAccessTokenError extends Error {
  constructor(message?: string, options?: ErrorOptions) {
    super(message ?? "Invalid or expired CDP access token.", options);
    this.name = "InvalidAccessTokenError";
  }
}

export function isInvalidAccessTokenError(error: unknown): error is InvalidAccessTokenError {
  return error instanceof InvalidAccessTokenError;
}
