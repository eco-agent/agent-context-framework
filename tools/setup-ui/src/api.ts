import {
  decodeSetupComponentDetail,
  decodeSetupSelectionPreview,
  decodeSetupInstallOutcome,
  decodeSetupSnapshot,
  type SetupComponentDetail,
  type SetupInstallOutcome,
  type SetupSelectionPreview,
  type SetupSourceOverride,
  type SetupSnapshot,
} from "@agent-context/dev-tooling/setup-contract";

const TOKEN_STORAGE_KEY = "agent-context-setup-token";

export function captureLaunchToken(): string {
  const url = new URL(window.location.href);
  const queryToken = url.searchParams.get("token");
  if (queryToken !== null && queryToken.length > 0) {
    window.sessionStorage.setItem(TOKEN_STORAGE_KEY, queryToken);
    url.searchParams.delete("token");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    return queryToken;
  }
  return window.sessionStorage.getItem(TOKEN_STORAGE_KEY) ?? "";
}

export async function fetchSetupSnapshot(token: string): Promise<SetupSnapshot> {
  const response = await setupFetch(token, "/api/setup", { method: "GET" });
  return decodeSetupSnapshot(await response.json());
}

export async function fetchSetupComponentDetail(
  token: string,
  componentName: string,
): Promise<SetupComponentDetail> {
  const response = await setupFetch(
    token,
    `/api/components/${encodeURIComponent(componentName)}`,
    { method: "GET" },
  );
  return decodeSetupComponentDetail(await response.json());
}

export async function fetchSetupPlan(
  token: string,
  components: readonly string[],
  overrides: readonly SetupSourceOverride[],
): Promise<SetupSelectionPreview> {
  const response = await setupFetch(token, "/api/plan", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ components, overrides }),
  });
  return decodeSetupSelectionPreview(await response.json());
}

export async function installSetupComponents(
  token: string,
  components: readonly string[],
  overrides: readonly SetupSourceOverride[],
): Promise<SetupInstallOutcome> {
  const response = await setupFetch(token, "/api/install", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ components, overrides }),
  });
  return decodeSetupInstallOutcome(await response.json());
}

async function setupFetch(token: string, resource: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("x-agent-context-token", token);
  const response = await fetch(resource, { ...init, headers });
  if (!response.ok && response.status !== 409) {
    const detail = await response.text();
    throw new Error(detail || `Setup request failed with HTTP ${response.status}.`);
  }
  return response;
}
