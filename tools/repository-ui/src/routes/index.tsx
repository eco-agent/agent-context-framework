import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { ChevronIcon, FolderIcon, PlusIcon, RefreshIcon, SearchIcon, SyncIcon, TrashIcon } from "@/components/icons";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Elevated } from "@/lib/elevated";
import { consumeLaunchToken, requestSnapshot, requestWallpaper } from "@/lib/repository-client";
import type { RepositoryObservation, RepositorySnapshot, RepositoryStatus } from "@/lib/repository-contract";

export const Route = createFileRoute("/")({ component: RepositoryManager });

type BusyAction = "load" | "register" | "sync-all" | "sync-selected" | "forget";

function RepositoryManager() {
  const [token, setToken] = useState<string>();
  const [snapshot, setSnapshot] = useState<RepositorySnapshot>();
  const [selectedId, setSelectedId] = useState<string>();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<BusyAction>();
  const [error, setError] = useState<string>();
  const [wallpaperUrl, setWallpaperUrl] = useState<string>();
  const [registerOpen, setRegisterOpen] = useState(false);

  useEffect(() => {
    try { setToken(consumeLaunchToken()); }
    catch (cause) { setError(errorMessage(cause)); }
  }, []);

  const preserveSelection = useCallback((next: RepositorySnapshot, preferred = selectedId) => {
    setSelectedId(next.repositories.some((repository) => repository.id === preferred)
      ? preferred
      : next.repositories[0]?.id);
  }, [selectedId]);

  const perform = useCallback(async (
    action: BusyAction,
    operation: () => Promise<RepositorySnapshot>,
    preferredId?: (snapshot: RepositorySnapshot) => string | undefined,
  ) => {
    setBusy(action);
    setError(undefined);
    try {
      const next = await operation();
      setSnapshot(next);
      preserveSelection(next, preferredId?.(next) ?? selectedId);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(undefined);
    }
  }, [preserveSelection]);

  useEffect(() => {
    if (token === undefined) return;
    void perform("load", async () => await requestSnapshot(token, "/api/repositories"));
    const controller = new AbortController();
    void requestWallpaper(token, controller.signal).then(setWallpaperUrl).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(errorMessage(cause));
    });
    return () => {
      controller.abort();
      setWallpaperUrl((current) => { if (current !== undefined) URL.revokeObjectURL(current); return undefined; });
    };
  }, [token]);

  const selected = snapshot?.repositories.find((repository) => repository.id === selectedId);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return snapshot?.repositories.filter((repository) => normalized.length === 0 ||
      repository.root.toLocaleLowerCase().includes(normalized) || repository.status.includes(normalized)) ?? [];
  }, [query, snapshot]);
  const isBusy = busy !== undefined;

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (token === undefined) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const root = data.get("root");
    if (typeof root !== "string" || root.trim().length === 0) return;
    await perform("register", async () => {
      const next = await requestSnapshot(token, "/api/repositories", { method: "POST", body: JSON.stringify({ root: root.trim() }) });
      setRegisterOpen(false);
      form.reset();
      return next;
    }, (next) => next.repositories.find((repository) => repository.root === root.trim())?.id);
  }

  const refresh = (): void => { if (token !== undefined) void perform("load", async () => await requestSnapshot(token, "/api/repositories")); };
  const syncAll = (): void => { if (token !== undefined) void perform("sync-all", async () => await requestSnapshot(token, "/api/sync", { method: "POST" })); };
  const syncSelected = (): void => {
    if (token !== undefined && selected !== undefined) void perform("sync-selected", async () =>
      await requestSnapshot(token, `/api/repositories/${selected.id}/sync`, { method: "POST" }));
  };
  const forgetSelected = () => {
    if (token === undefined || selected === undefined || !window.confirm(`Forget ${selected.root}? Repository files will not be changed.`)) return;
    void perform("forget", async () => await requestSnapshot(token, `/api/repositories/${selected.id}`, { method: "DELETE" }));
  };

  return (
    <div className="app-frame">
      {wallpaperUrl !== undefined && <img className="wallpaper" src={wallpaperUrl} alt="" aria-hidden="true" />}
      <div className="wallpaper-scrim" aria-hidden="true" />
      <div className="product-shell">
        <aside className="navigation">
          <div className="brand"><span className="brand-mark">A</span><span>ACF</span></div>
          <nav aria-label="Primary navigation" className="nav-items">
            <a aria-current="page" href="#repositories"><FolderIcon />Repositories</a>
          </nav>
          <div className="nav-foot">Local registry<br /><span>{snapshot?.catalogRoot ?? "Loading catalog"}</span></div>
        </aside>

        <main className="workspace" id="repositories">
          <header className="hero">
            <div><h1>Repositories</h1><p>Inspect and update every registered ACF capsule.</p></div>
            <div className="hero-actions">
              <button className="icon-button" type="button" onClick={refresh} disabled={isBusy} aria-label="Refresh repositories"><RefreshIcon /></button>
              <button className="action-button secondary" type="button" onClick={syncAll} disabled={isBusy || !snapshot?.repositories.length}><SyncIcon />Sync all</button>
              <button className="action-button primary" type="button" aria-expanded={registerOpen} onClick={() => setRegisterOpen((open) => !open)} disabled={isBusy}><PlusIcon />Register</button>
            </div>
          </header>

          {registerOpen && (
            <Elevated offset={2} className="register-panel">
              <form onSubmit={register}>
                <label><span>Absolute repository path</span><input autoFocus name="root" placeholder="D:\dev\my-project" disabled={isBusy} /></label>
                <div className="register-actions"><button type="button" className="action-button secondary" onClick={() => setRegisterOpen(false)}>Cancel</button><button type="submit" className="action-button primary" disabled={isBusy}>Register repository</button></div>
              </form>
            </Elevated>
          )}

          {error && <Elevated offset={2} role="alert" className="error-message">{error}</Elevated>}

          <Elevated offset={0} shadowLevel={1} className="registry-surface">
            <div className="registry-toolbar">
              <label className="search-field"><SearchIcon /><span className="sr-only">Search repositories</span><input type="search" placeholder="Find a repository" value={query} onChange={(event) => setQuery(event.currentTarget.value)} /></label>
              <span className="repository-count">{snapshot?.repositories.length ?? 0} registered</span>
            </div>
            <ScrollArea orientation="horizontal" viewportClassName="scroll-fade-x" className="registry-scroll">
              <table>
                <thead><tr><th>Repository</th><th>Status</th><th>Capsule</th><th>Files</th><th><span className="sr-only">Open</span></th></tr></thead>
                <tbody>
                  {filtered.map((repository) => (
                    <tr key={repository.id} className={repository.id === selectedId ? "selected" : undefined} onClick={() => setSelectedId(repository.id)}>
                      <td><button className="repository-choice" type="button" onClick={() => setSelectedId(repository.id)}><span>{repositoryName(repository.root)}</span><small>{repository.root}</small></button></td>
                      <td><Status status={repository.status} /></td>
                      <td className="mono">{"capsuleSha256" in repository ? shortHash(repository.capsuleSha256) : "Unavailable"}</td>
                      <td>{"generatedFileCount" in repository ? repository.generatedFileCount : "-"}</td>
                      <td><ChevronIcon className="chevron" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {snapshot === undefined && <div className="table-state">Loading repositories...</div>}
              {snapshot !== undefined && filtered.length === 0 && <div className="table-state">{snapshot.repositories.length === 0 ? "No repositories registered." : "No repositories match this search."}</div>}
            </ScrollArea>
          </Elevated>
        </main>

        <Elevated offset={3} shadowLevel={5} className="inspector">
          <ScrollArea orientation="vertical" viewportClassName="scroll-fade" className="inspector-scroll">
            <Inspector repository={selected} snapshot={snapshot} busy={isBusy} onSync={syncSelected} onForget={forgetSelected} />
          </ScrollArea>
        </Elevated>
      </div>

    </div>
  );
}

function Inspector({ repository, snapshot, busy, onSync, onForget }: { readonly repository: RepositoryObservation | undefined; readonly snapshot: RepositorySnapshot | undefined; readonly busy: boolean; readonly onSync: () => void; readonly onForget: () => void }) {
  if (repository === undefined) return <div className="inspector-empty"><FolderIcon /><p>Select a repository to inspect its capsule and generated files.</p></div>;
  const canSync = repository.status !== "missing" && repository.status !== "invalid" && repository.status !== "repack-required";
  return <>
    <div className="inspector-heading"><div><p className="section-label">Selected repository</p><h2>{repositoryName(repository.root)}</h2></div><Status status={repository.status} /></div>
    <p className="inspector-path">{repository.root}</p>
    <div className="inspector-actions"><button className="action-button primary" type="button" disabled={busy || !canSync} onClick={onSync}><SyncIcon />{repository.status === "current" ? "Check sync" : "Sync"}</button><button className="icon-button danger" type="button" disabled={busy} onClick={onForget} aria-label="Forget repository"><TrashIcon /></button></div>
    {"registryRevision" in repository && <>
      <DefinitionList items={[["Capsule", shortHash(repository.capsuleSha256)], ["Registry", repository.registryRevision], ["Activation files", String(repository.activationCount)], ["Generated files", String(repository.generatedFileCount)]]} />
      <InspectorSection title="Direct components" values={repository.directComponents} />
      <InspectorSection title="Resolved components" values={repository.resolvedComponents} />
    </>}
    {repository.issues.length > 0 && <section className="inspector-section issues"><h3>Issues</h3><ul>{repository.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></section>}
    <section className="inspector-section"><h3>Catalog identity</h3><p className="mono breakable">{repository.id}</p><p className="mono breakable muted">{snapshot?.catalogRoot}</p></section>
  </>;
}

function DefinitionList({ items }: { readonly items: readonly (readonly [string, string])[] }) { return <dl className="definition-list">{items.map(([label, value]) => <div key={label}><dt>{label}</dt><dd title={value}>{value}</dd></div>)}</dl>; }
function InspectorSection({ title, values }: { readonly title: string; readonly values: readonly string[] }) { return <section className="inspector-section"><h3>{title}</h3>{values.length === 0 ? <p className="muted">None recorded.</p> : <div className="component-list">{values.map((value) => <code key={value}>{value}</code>)}</div>}</section>; }
function Status({ status }: { readonly status: RepositoryStatus }) { return <span className={`status status-${status}`}><span />{status.replaceAll("-", " ")}</span>; }
function repositoryName(root: string): string { return root.split(/[\\/]/u).filter(Boolean).at(-1) ?? root; }
function shortHash(value: string): string { return `${value.slice(0, 10)}...`; }
function errorMessage(value: unknown): string { return value instanceof Error ? value.message : String(value); }
