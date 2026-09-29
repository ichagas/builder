import type { ApiError } from "@/lib/apiClient";

/** Never echoes a raw/unexpected error; falls back to a generic message. */
export function extractErrorMessage(error: unknown, fallback: string): string {
  const apiError = error as ApiError | undefined;
  if (!apiError) return fallback;
  const details = apiError.details as Record<string, unknown> | undefined;
  const detailMessage = details && typeof details.repositories === "string" ? details.repositories : undefined;
  if (detailMessage) return detailMessage;
  if (typeof apiError.message === "string" && apiError.message && apiError.statusCode !== 500) return apiError.message;
  return fallback;
}
