import { useEffect, useMemo, useState } from "react";
import type {
  SetupComponentSummary,
  SetupInstallOutcome,
  SetupSnapshot,
} from "@agent-context/dev-tooling/setup-contract";

import { captureLaunchToken, fetchSetupSnapshot, installSetupComponents } from "./api.js";
import { Button } from "./components/Button.js";
import { Checkbox } from "./components/Checkbox.js";
import { SetupSidebar, type SetupSection } from "./SetupSidebar.js";

type AppState =
  | { readonly status: "loading" }
  | { readonly status: "load-error"; readonly message: string }
  | { readonly status: "ready"; readonly snapshot: SetupSnapshot }
  | { readonly status: "applying"; readonly snapshot: SetupSnapshot }
  | { readonly status: "request-error"; readonly snapshot: SetupSnapshot; readonly message: string }
  | {
      readonly status: "result";
      readonly snapshot: SetupSnapshot;
      readonly outcome: SetupInstallOutcome;
    };

const token = captureLaunchToken();

function ChevronIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="icon icon--chevron">
      <path d="m7.5 4.5 5.5 5.5-5.5 5.5" />
    </svg>
  );
}

function dependencyClosure(
  selected: ReadonlySet<string>,
  components: readonly SetupComponentSummary[],
): readonly string[] {
  const dependencies = new Map(components.map((component) => [component.name, component.dependencies]));
  const resolved = new Set<string>();
  const visit = (name: string) => {
    if (resolved.has(name)) return;
    for (const dependency of dependencies.get(name) ?? []) visit(dependency);
    resolved.add(name);
  };
  for (const name of selected) visit(name);
  return [...resolved];
}

function ComponentRow({
  component,
  installed,
  selected,
  disabled,
  onToggle,
}: {
  readonly component: SetupComponentSummary;
  readonly installed: boolean;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly onToggle: () => void;
}) {
  const id = `component-${component.name}`;
  const detail = component.dependencies.length > 0
    ? `Depends on ${component.dependencies.join(", ")}`
    : "No component dependencies";
  const moveFocus = (current: HTMLInputElement, direction: -1 | 1) => {
    const controls = [...document.querySelectorAll<HTMLInputElement>(
      ".component-row .checkbox:not(:disabled)",
    )];
    const index = controls.indexOf(current);
    if (index === -1 || controls.length === 0) return;
    const next = controls[(index + direction + controls.length) % controls.length];
    next?.focus();
  };
  return (
    <label className="component-row" data-selected={selected} data-installed={installed} htmlFor={id}>
      <Checkbox
        id={id}
        checked={installed || selected}
        disabled={installed || disabled}
        onChange={onToggle}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            moveFocus(event.currentTarget, event.key === "ArrowDown" ? 1 : -1);
          } else if (event.key === "Enter") {
            event.preventDefault();
            onToggle();
          }
        }}
      />
      <span className="component-row__body">
        <span className="component-row__title">
          <code>{component.name}</code>
          {installed ? <span className="installed-label">Installed</span> : null}
        </span>
        <span className="component-row__detail">{detail}</span>
      </span>
      <span className="component-row__meta">
        {component.capabilities.length} capabilities · {component.licenseCount} licenses
      </span>
      <ChevronIcon />
    </label>
  );
}

export function App() {
  const [state, setState] = useState<AppState>({ status: "loading" });
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<SetupSection>("components");
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    void fetchSetupSnapshot(token).then(
      (snapshot) => setState({ status: "ready", snapshot }),
      (error: unknown) => setState({
        status: "load-error",
        message: error instanceof Error ? error.message : String(error),
      }),
    );
  }, []);

  const snapshot = state.status === "loading" || state.status === "load-error"
    ? null
    : state.snapshot;
  const installed = useMemo(
    () => new Set(snapshot?.selectedComponents ?? []),
    [snapshot?.selectedComponents],
  );
  const visibleComponents = useMemo(() => {
    if (snapshot === null) return [];
    const normalized = query.trim().toLowerCase();
    const components = section === "review"
      ? snapshot.components.filter((component) => selected.has(component.name))
      : snapshot.components;
    return normalized.length === 0
      ? components
      : components.filter((component) =>
          component.name.toLowerCase().includes(normalized) ||
          component.dependencies.some((dependency) => dependency.toLowerCase().includes(normalized))
        );
  }, [query, section, selected, snapshot]);
  const closure = useMemo(
    () => snapshot === null ? [] : dependencyClosure(selected, snapshot.components),
    [selected, snapshot],
  );
  const applying = state.status === "applying";

  const toggle = (name: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const apply = async () => {
    if (snapshot === null || selected.size === 0 || applying) return;
    setState({ status: "applying", snapshot });
    try {
      const outcome = await installSetupComponents(token, [...selected]);
      setState({ status: "result", snapshot: outcome.snapshot, outcome });
      if (outcome.status === "applied") setSelected(new Set());
    } catch (error) {
      setState({
        status: "request-error",
        snapshot,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  if (state.status === "loading") {
    return <main className="center-state"><div className="spinner" aria-hidden="true" /><p>Loading setup…</p></main>;
  }

  if (state.status === "load-error") {
    return (
      <main className="center-state" role="alert">
        <h1>Setup could not load</h1>
        <p>{state.message}</p>
        <Button variant="ghost" onClick={() => window.location.reload()}>Reload</Button>
      </main>
    );
  }

  const renderSnapshot = state.snapshot;

  return (
    <div className="app-shell">
      <SetupSidebar
        activeSection={section}
        query={query}
        selectedCount={selected.size}
        onQueryChange={setQuery}
        onSectionChange={setSection}
      />

      <main className="primary-surface">
        <header className="topbar">
          <div>
            <h1>Agent Context Setup</h1>
            <p className="repository-path" title={renderSnapshot.projectRoot}>{renderSnapshot.projectRoot}</p>
          </div>
          <div className="registry-meta">
            <span>{renderSnapshot.initialized ? "Initialized" : "Not initialized"}</span>
            <code>registry {renderSnapshot.registryRevision}</code>
          </div>
        </header>

        <section className="content" aria-labelledby="component-heading">
          <div className="section-heading">
            <div>
              <h2 id="component-heading">{section === "components" ? "Components" : "Selected components"}</h2>
              <p>
                {section === "components"
                  ? "Choose additions. Existing selections are preserved."
                  : "Review direct selections before installation."}
              </p>
            </div>
            <span>{visibleComponents.length} shown</span>
          </div>

          <div className="component-list" aria-live="polite">
            {visibleComponents.length === 0 ? (
              <p className="empty-state">
                {query.length > 0 ? "No components match this search." : "No components selected yet."}
              </p>
            ) : visibleComponents.map((component) => (
              <ComponentRow
                key={component.name}
                component={component}
                installed={installed.has(component.name)}
                selected={selected.has(component.name)}
                disabled={applying}
                onToggle={() => toggle(component.name)}
              />
            ))}
          </div>
        </section>

        <footer className="action-bar">
          <div className="action-bar__summary">
            <strong>{selected.size > 0 ? `${selected.size} selected` : "No additions selected"}</strong>
            <span>
              {closure.length > 0
                ? `Resolved closure: ${closure.join(", ")}`
                : "Choose at least one component to continue."}
            </span>
          </div>
          <Button disabled={selected.size === 0 || applying} onClick={() => void apply()}>
            {applying ? "Installing…" : "Install selected"}
          </Button>
        </footer>

        {state.status === "result" ? (
          <div
            className="result-toast"
            data-status={state.outcome.status}
            role={state.outcome.status === "blocked" ? "alert" : "status"}
          >
            <strong>{state.outcome.status === "applied" ? "Installation complete" : "Installation blocked"}</strong>
            <span>
              {state.outcome.status === "applied"
                ? `${state.outcome.writtenPaths.length} paths written.`
                : state.outcome.conflicts
                    .map((conflict) => `${conflict.targetPath}: ${conflict.detail}`)
                    .join(" · ")}
            </span>
            <button type="button" onClick={() => setState({ status: "ready", snapshot: state.outcome.snapshot })}>
              Dismiss
            </button>
          </div>
        ) : null}
        {state.status === "request-error" ? (
          <div className="result-toast" data-status="blocked" role="alert">
            <strong>Installation failed</strong>
            <span>{state.message}</span>
            <button type="button" onClick={() => setState({ status: "ready", snapshot: state.snapshot })}>
              Dismiss
            </button>
          </div>
        ) : null}
      </main>
    </div>
  );
}
