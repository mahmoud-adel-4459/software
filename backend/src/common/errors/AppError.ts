/** Error that maps directly to an HTTP status and an Arabic user message. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Throws AppError(status, message) unless `condition` holds. */
export function requireValue(condition: unknown, message: string, status = 400): asserts condition {
  if (!condition) throw new AppError(status, message);
}

/** Always throws AppError(status, message). */
export function fail(message: string, status = 400): never {
  throw new AppError(status, message);
}
