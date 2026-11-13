/** Error with a stable machine code; the HTTP layer maps it to a response. */
export class AppError extends Error {
  constructor(
    public code: string,
    public status = 400,
    public extra: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

export const notFound = () => new AppError("not_found", 404);
export const forbidden = (code = "forbidden") => new AppError(code, 403);
export const unauthorized = () => new AppError("unauthorized", 401);
export const tooMany = (retryAfterSec: number) => new AppError("rate_limited", 429, { retryAfterSec });
export const invalid = (field: string, problem = "invalid") => new AppError("invalid_input", 400, { field, problem });
