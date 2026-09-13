import { parseRepositorySnapshot, type RepositorySnapshot } from "@/lib/repository-contract";

export function consumeLaunchToken(): string {
  const launchUrl = new URL(window.location.href);
  const token = launchUrl.searchParams.get("token") ?? "";
  launchUrl.searchParams.delete("token");
  window.history.replaceState({}, "", launchUrl);
  if (token.length === 0) throw new Error("The repository UI launch token is missing.");
  return token;
}

export async function requestSnapshot(token: string, path: string, init: RequestInit = {}): Promise<RepositorySnapshot> {
  const response = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...init.headers,
    },
  });
  if (!response.ok) throw new Error((await response.text()).trim() || `Request failed with ${response.status}.`);
  const payload: unknown = await response.json();
  if (isRecord(payload) && "snapshot" in payload) return parseRepositorySnapshot(payload.snapshot);
  return parseRepositorySnapshot(payload);
}

export async function requestWallpaper(token: string, signal: AbortSignal): Promise<string | undefined> {
  const response = await fetch("/api/wallpaper", {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error((await response.text()).trim() || "Desktop wallpaper could not be loaded.");
  return URL.createObjectURL(await response.blob());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
