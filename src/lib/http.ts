// Curated errors reach the client verbatim; anything else is logged server-side
// and replaced with a generic message so driver, SQL, and stack detail never leak.
export class AppError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "AppError";
    this.status = status;
  }
}
export function userMessage(error: unknown, fallback: string): string {
  if (error instanceof AppError) return error.message;
  console.error(error);
  return fallback;
}
export function errorStatus(error: unknown, fallback = 500): number {
  return error instanceof AppError ? error.status : fallback;
}
