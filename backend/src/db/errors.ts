interface PostgresErrorLike {
  code?: unknown;
  constraint?: unknown;
}

function isPostgresErrorLike(error: unknown): error is PostgresErrorLike {
  return !!error && typeof error === "object" && "code" in error;
}

export function isUniqueViolation(error: unknown) {
  return isPostgresErrorLike(error) && error.code === "23505";
}

export function isConstraintViolation(error: unknown, constraint: string) {
  return isPostgresErrorLike(error) && error.code === "23505" && error.constraint === constraint;
}
