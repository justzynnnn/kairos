import { mobileConfig } from "./config";

export async function apiRequest<T>(
  path: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15_000);
  let response: Response;
  try {
    response = await fetch(mobileConfig.apiOrigin + path, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        Authorization: "Bearer " + accessToken,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
  } catch (reason) {
    if (controller.signal.aborted)
      throw new Error("Kairos took too long to respond. Try again.");
    throw new Error("Kairos could not reach the mobile server.", {
      cause: reason,
    });
  } finally {
    window.clearTimeout(timeout);
  }
  if (response.headers.get("x-vercel-mitigated") === "challenge")
    throw new Error(
      "The Kairos deployment is blocking mobile requests. Disable Vercel Challenge Mode, then retry.",
    );
  if (response.status === 404)
    throw new Error(
      "The mobile API is not deployed yet. Deploy the current Kairos backend, then retry.",
    );
  const body = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!response.ok && response.status !== 207)
    throw new Error(body?.error || "Kairos could not reach the server.");
  if (!body) throw new Error("Kairos received an empty response.");
  return body;
}
