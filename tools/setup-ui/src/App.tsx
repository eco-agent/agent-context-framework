import { useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/DownloadSimple";
import { ListChecksIcon as ListChecks } from "@phosphor-icons/react/ListChecks";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { PackageIcon as Package } from "@phosphor-icons/react/Package";
import { ShieldCheckIcon as ShieldCheck } from "@phosphor-icons/react/ShieldCheck";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/WarningCircle";
import { XIcon as X } from "@phosphor-icons/react/X";
import type {
  SetupComponentSummary,
  SetupInstallOutcome,
  SetupSelectionPreview,
  SetupSnapshot,
} from "@agent-context/dev-tooling/setup-contract";

import { captureLaunchToken, fetchSetupPlan, fetchSetupSnapshot, installSetupComponents } from "./api.js";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "./components/ui/alert.js";
import { Badge } from "./components/ui/badge.js";
import { Button } from "./components/ui/button.js";
import { Checkbox } from "./components/ui/checkbox.js";
import { Input } from "./components/ui/input.js";
import { Skeleton } from "./components/ui/skeleton.js";
import { Spinner } from "./components/ui/spinner.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs.js";
import { cn } from "./lib/utils.js";

type AppState =
  | { readonly status: "loading" }
  | { readonly status: "load-error"; readonly message: string }
  | { readonly status: "ready"; readonly snapshot: SetupSnapshot }
  | { readonly status: "applying"; readonly snapshot: SetupSnapshot }
  | { readonly status: "request-error"; readonly snapshot: SetupSnapshot; readonly message: string }
  | { readonly status: "result"; readonly snapshot: SetupSnapshot; readonly outcome: SetupInstallOutcome };

type PreviewState =
  | { readonly status: "loading"; readonly selectionKey: string }
  | { readonly status: "error"; readonly selectionKey: string; readonly message: string }
  | { readonly status: "ready"; readonly selectionKey: string; readonly preview: SetupSelectionPreview };

type SetupSection = "components" | "review";

const token = captureLaunchToken();

function selectionKey(components: Iterable<string>): string {
  return JSON.stringify([...components].sort());
}

function updateWithTransition(update: () => void): void {
  if (
    document.startViewTransition === undefined ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    update();
    return;
  }
  try {
    document.startViewTransition(() => flushSync(update));
  } catch {
    update();
  }
}

function ComponentRow({
  component,
  installed,
  selected,
  disabled,
  idPrefix,
  onToggle,
}: {
  readonly component: SetupComponentSummary;
  readonly installed: boolean;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly idPrefix: string;
  readonly onToggle: () => void;
}) {
  const id = `${idPrefix}-${component.name}`;
  const detail = component.dependencies.length > 0
    ? `Depends on ${component.dependencies.join(", ")}`
    : "No component dependencies";

  const moveFocus = (current: HTMLElement, direction: -1 | 1) => {
    const list = current.closest("[data-component-list]");
    if (list === null) return;
    const controls = [...list.querySelectorAll<HTMLElement>(
      '[data-slot="checkbox"]:not([aria-disabled="true"])',
    )];
    const index = controls.indexOf(current);
    if (index === -1 || controls.length === 0) return;
    controls[(index + direction + controls.length) % controls.length]?.focus();
  };

  return (
    <div
      className="group grid min-h-18 grid-cols-[auto_minmax(0,1fr)] items-start gap-3 border-b border-border/70 px-1 py-3 transition-colors last:border-b-0 hover:bg-muted/40 data-[selected=true]:bg-muted/70 motion-reduce:transition-none sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"
      data-selected={selected}
      data-installed={installed}
    >
      <Checkbox
        id={id}
        checked={installed || selected}
        disabled={installed || disabled}
        onCheckedChange={onToggle}
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
      <label htmlFor={id} className={cn("min-w-0", installed ? "cursor-default" : "cursor-pointer")}>
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <code className="min-w-0 truncate text-xs font-semibold" title={component.name}>
            {component.name}
          </code>
          <Badge variant="outline">{component.kind}</Badge>
          {installed ? <Badge variant="secondary">Installed</Badge> : null}
        </span>
        <span className="mt-1 block truncate text-xs text-muted-foreground" title={detail}>
          {detail}
        </span>
      </label>
      <span className="col-start-2 text-[0.6875rem] leading-relaxed text-muted-foreground sm:col-start-3 sm:text-right">
        {component.capabilities.length} capabilities
        <span aria-hidden="true"> · </span>
        {component.licenseCount} licenses
        <span aria-hidden="true"> · </span>
        {component.artifactCount} artifacts
      </span>
    </div>
  );
}

function ComponentCatalogue({
  className,
  idPrefix,
  components,
  installed,
  selected,
  query,
  applying,
  onQueryChange,
  onToggle,
}: {
  readonly className?: string;
  readonly idPrefix: string;
  readonly components: readonly SetupComponentSummary[];
  readonly installed: ReadonlySet<string>;
  readonly selected: ReadonlySet<string>;
  readonly query: string;
  readonly applying: boolean;
  readonly onQueryChange: (query: string) => void;
  readonly onToggle: (name: string) => void;
}) {
  const focusFirstComponent = (input: HTMLInputElement) => {
    input
      .closest("[data-component-pane]")
      ?.querySelector<HTMLElement>('[data-slot="checkbox"]:not([aria-disabled="true"])')
      ?.focus();
  };

  return (
    <section className={cn("flex h-full min-h-0 flex-col", className)} data-component-pane>
      <div className="shrink-0 border-b px-4 py-4 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-heading text-sm font-semibold">Components</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Choose additions. Existing selections are preserved.
            </p>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">{components.length} shown</span>
        </div>
        <div className="relative mt-4">
          <MagnifyingGlass
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            data-setup-search
            type="search"
            value={query}
            placeholder="Search components"
            aria-label="Search components"
            className="h-10 pl-9 pr-11 text-sm md:text-sm"
            onChange={(event) => onQueryChange(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && query.length > 0) {
                event.preventDefault();
                onQueryChange("");
              } else if (event.key === "ArrowDown") {
                event.preventDefault();
                focusFirstComponent(event.currentTarget);
              }
            }}
          />
          <kbd className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[0.625rem] text-muted-foreground">
            /
          </kbd>
        </div>
      </div>

      <div
        className="fade-y min-h-0 flex-1 overflow-y-auto px-4 pb-5 sm:px-6"
        data-component-list
        aria-live="polite"
      >
        {components.length === 0 ? (
          <div className="grid min-h-48 place-items-center px-6 text-center text-xs text-muted-foreground">
            No components match this search.
          </div>
        ) : components.map((component) => (
          <ComponentRow
            key={component.name}
            component={component}
            installed={installed.has(component.name)}
            selected={selected.has(component.name)}
            disabled={applying}
            idPrefix={idPrefix}
            onToggle={() => onToggle(component.name)}
          />
        ))}
      </div>
    </section>
  );
}

function PreviewSkeleton() {
  return (
    <div className="grid gap-5" aria-hidden="true">
      <div className="grid grid-cols-2 gap-4">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
      <Skeleton className="h-12" />
      <Skeleton className="h-12" />
    </div>
  );
}

function PreviewDefinition({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="grid min-w-0 gap-1 py-3 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-xs font-medium">{label}</dt>
      <dd className="min-w-0 break-words text-xs leading-relaxed text-muted-foreground">{value}</dd>
    </div>
  );
}

function PlanPane({ className, previewState }: { readonly className?: string; readonly previewState: PreviewState }) {
  const preview = previewState.status === "ready" ? previewState.preview : null;
  const statusVariant = preview?.status === "blocked"
    ? "destructive"
    : preview?.status === "current"
      ? "secondary"
      : "outline";

  return (
    <section className={cn("flex h-full min-h-0 flex-col", className)} aria-labelledby="preview-heading">
      <div className="flex min-h-22 shrink-0 items-start justify-between gap-4 border-b px-4 py-4 sm:px-6">
        <div>
          <h2 id="preview-heading" className="font-heading text-sm font-semibold">Selection preview</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Server-owned plan from the real installer. No files are written.
          </p>
        </div>
        {preview === null ? <Badge variant="outline">Planning</Badge> : (
          <Badge variant={statusVariant}>{preview.status}</Badge>
        )}
      </div>

      <div className="fade-y min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6" aria-live="polite">
        <div className="min-h-72 [view-transition-name:selection-plan]" aria-busy={previewState.status === "loading"}>
          {previewState.status === "loading" ? (
            <div className="grid gap-4">
              <p className="flex min-h-6 items-center gap-2 text-xs text-muted-foreground">
                <Spinner aria-hidden="true" />
                Planning selection…
              </p>
              <PreviewSkeleton />
            </div>
          ) : null}

          {previewState.status === "error" ? (
            <Alert variant="destructive">
              <WarningCircle aria-hidden="true" />
              <AlertTitle>Selection preview failed</AlertTitle>
              <AlertDescription>{previewState.message}</AlertDescription>
            </Alert>
          ) : null}

          {preview !== null ? (
            <div className="grid gap-5 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">
              <dl className="divide-y divide-border/70">
                <PreviewDefinition label="Requested" value={preview.requestedComponents.join(", ") || "none"} />
                <PreviewDefinition label="Direct" value={preview.directComponents.join(", ") || "none"} />
                <PreviewDefinition label="Transitive" value={preview.transitiveComponents.join(", ") || "none"} />
                <PreviewDefinition
                  label="Footprint"
                  value={`${preview.footprint.componentCount} components · ${preview.footprint.artifactCount} artifacts · ${preview.footprint.targetCount} targets`}
                />
                <PreviewDefinition
                  label="Targets"
                  value={`${preview.footprint.skillTargetCount} skills · ${preview.footprint.runtimeTargetCount} runtime`}
                />
                <PreviewDefinition
                  label="Capabilities"
                  value={preview.capabilities.length === 0
                    ? "none"
                    : preview.capabilities.map((capability) =>
                        `${capability.requirement} ${capability.kind}:${capability.name}`
                      ).join(" · ")}
                />
                <PreviewDefinition
                  label="Licenses"
                  value={preview.licenses.length === 0
                    ? "none"
                    : preview.licenses.map((license) => license.kind === "project"
                      ? `${license.spdx} project notice`
                      : `${license.spdx} ${license.source}@${license.revision}`).join(" · ")}
                />
              </dl>

              {preview.trustRequired ? (
                <Alert>
                  <ShieldCheck aria-hidden="true" />
                  <AlertTitle>Repository trust required</AlertTitle>
                  <AlertDescription>
                    Trust this repository before Codex loads project configuration or skills.
                  </AlertDescription>
                </Alert>
              ) : null}

              {preview.activations.map((activation) => (
                <Alert key={activation.id}>
                  <AlertTitle className="capitalize">{activation.status}</AlertTitle>
                  <AlertDescription>{activation.message}</AlertDescription>
                </Alert>
              ))}

              {preview.drift.conflicts.length > 0 ? (
                <Alert variant="destructive">
                  <WarningCircle aria-hidden="true" />
                  <AlertTitle>Ownership conflicts</AlertTitle>
                  <AlertDescription className="grid gap-1">
                    {preview.drift.conflicts.map((conflict) => (
                      <span key={`${conflict.targetPath}-${conflict.status}`} className="break-words">
                        {conflict.targetPath}: {conflict.detail}
                      </span>
                    ))}
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function SetupHeader({ snapshot }: { readonly snapshot: SetupSnapshot }) {
  return (
    <header className="flex min-h-16 shrink-0 items-center justify-between gap-4 border-b px-4 py-3 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary font-heading text-[0.625rem] font-bold tracking-tight text-primary-foreground"
        >
          AC
        </span>
        <div className="min-w-0">
          <h1 className="font-heading text-sm font-semibold">Agent Context Setup</h1>
          <p className="truncate text-xs text-muted-foreground" title={snapshot.projectRoot}>
            {snapshot.projectRoot}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
        <Badge variant={snapshot.initialized ? "secondary" : "outline"}>
          {snapshot.initialized ? "Initialized" : "Not initialized"}
        </Badge>
        <code className="text-[0.625rem] text-muted-foreground">registry {snapshot.registryRevision}</code>
      </div>
    </header>
  );
}

function ResultNotice({ state, onDismiss }: { readonly state: AppState; readonly onDismiss: () => void }) {
  if (state.status !== "result" && state.status !== "request-error") return null;
  const applied = state.status === "result" && state.outcome.status === "applied";
  const title = applied
    ? "Installation complete"
    : state.status === "request-error"
      ? "Installation failed"
      : "Installation blocked";
  const description = state.status === "request-error"
    ? state.message
    : state.outcome.status === "applied"
      ? `${state.outcome.writtenPaths.length} paths written.`
      : state.outcome.conflicts.map((conflict) => `${conflict.targetPath}: ${conflict.detail}`).join(" · ");

  return (
    <Alert
      variant={applied ? "default" : "destructive"}
      role={applied ? "status" : "alert"}
      className="fixed right-4 bottom-24 z-20 w-[min(28rem,calc(100vw-2rem))] border-0 bg-popover p-4 text-popover-foreground smooth-shadow-ring-lg [view-transition-name:result-notice] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-200"
    >
      {applied ? <CheckCircle aria-hidden="true" /> : <WarningCircle aria-hidden="true" />}
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="break-words">{description}</AlertDescription>
      <AlertAction>
        <Button variant="ghost" size="icon-sm" aria-label="Dismiss result" onClick={onDismiss}>
          <X />
        </Button>
      </AlertAction>
    </Alert>
  );
}

function SetupLoading() {
  return (
    <div className="flex h-dvh min-h-0 flex-col bg-background" aria-busy="true" aria-label="Loading setup">
      <header className="flex min-h-16 shrink-0 items-center gap-3 border-b px-4 sm:px-6">
        <Skeleton className="size-8" />
        <div className="grid gap-2">
          <Skeleton className="h-3 w-36" />
          <Skeleton className="h-2.5 w-64 max-w-[60vw]" />
        </div>
      </header>
      <main className="grid min-h-0 flex-1 lg:grid-cols-[minmax(22rem,0.85fr)_minmax(28rem,1.15fr)]">
        <div className="hidden border-r p-6 lg:grid lg:content-start lg:gap-4">
          <Skeleton className="h-10" />
          {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-16" />)}
        </div>
        <div className="grid content-start gap-5 p-6">
          <Skeleton className="h-8 w-48" />
          <PreviewSkeleton />
        </div>
      </main>
      <footer className="min-h-20 shrink-0 border-t px-4 py-3 sm:px-6">
        <Skeleton className="ml-auto h-10 w-36" />
      </footer>
    </div>
  );
}

function SetupLoadError({ message }: { readonly message: string }) {
  return (
    <main className="grid h-dvh place-items-center bg-background p-6">
      <div className="grid w-full max-w-lg gap-4">
        <Alert variant="destructive">
          <WarningCircle aria-hidden="true" />
          <AlertTitle>Setup could not load</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
        <Button className="h-10 justify-self-start px-4" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </div>
    </main>
  );
}

export function App() {
  const [state, setState] = useState<AppState>({ status: "loading" });
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<SetupSection>("components");
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [previewState, setPreviewState] = useState<PreviewState>(() => ({
    status: "loading",
    selectionKey: selectionKey([]),
  }));

  useEffect(() => {
    void fetchSetupSnapshot(token).then(
      (snapshot) => updateWithTransition(() => setState({ status: "ready", snapshot })),
      (error: unknown) => updateWithTransition(() => setState({
        status: "load-error",
        message: error instanceof Error ? error.message : String(error),
      })),
    );
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) return;
      const visibleSearch = [...document.querySelectorAll<HTMLInputElement>("[data-setup-search]")]
        .find((input) => input.offsetParent !== null);
      if (visibleSearch === undefined) return;
      event.preventDefault();
      visibleSearch.focus();
      visibleSearch.select();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const snapshot = state.status === "loading" || state.status === "load-error" ? null : state.snapshot;
  const installed = useMemo(
    () => new Set(snapshot?.installedResolvedComponents ?? []),
    [snapshot?.installedResolvedComponents],
  );
  const visibleComponents = useMemo(() => {
    if (snapshot === null) return [];
    const normalized = query.trim().toLowerCase();
    return normalized.length === 0
      ? snapshot.components
      : snapshot.components.filter((component) =>
          component.name.toLowerCase().includes(normalized) ||
          component.dependencies.some((dependency) => dependency.toLowerCase().includes(normalized))
        );
  }, [query, snapshot]);

  const selectedKey = selectionKey(selected);
  useEffect(() => {
    if (snapshot === null) return;
    const requestedComponents = [...selected].sort();
    const requestedKey = selectionKey(requestedComponents);
    let stale = false;
    setPreviewState({ status: "loading", selectionKey: requestedKey });
    void fetchSetupPlan(token, requestedComponents).then(
      (preview) => {
        if (!stale) updateWithTransition(() => setPreviewState({ status: "ready", selectionKey: requestedKey, preview }));
      },
      (error: unknown) => {
        if (!stale) updateWithTransition(() => setPreviewState({
          status: "error",
          selectionKey: requestedKey,
          message: error instanceof Error ? error.message : String(error),
        }));
      },
    );
    return () => { stale = true; };
  }, [selectedKey, snapshot]);

  if (state.status === "loading") return <SetupLoading />;
  if (state.status === "load-error") return <SetupLoadError message={state.message} />;

  const applying = state.status === "applying";
  const displayedPreviewState: PreviewState = previewState.selectionKey === selectedKey
    ? previewState
    : { status: "loading", selectionKey: selectedKey };
  const preview = displayedPreviewState.status === "ready" ? displayedPreviewState.preview : null;
  const previewBlocked = preview?.status === "blocked";
  const previewMatchesSelection = preview !== null;
  const installDisabled = selected.size === 0 || applying || !previewMatchesSelection || previewBlocked;

  const toggle = (name: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const apply = async () => {
    if (selected.size === 0 || applying || !previewMatchesSelection || previewBlocked) return;
    setState({ status: "applying", snapshot: state.snapshot });
    try {
      const outcome = await installSetupComponents(token, [...selected].sort());
      updateWithTransition(() => {
        setState({ status: "result", snapshot: outcome.snapshot, outcome });
        if (outcome.status === "applied") setSelected(new Set());
      });
    } catch (error) {
      updateWithTransition(() => setState({
        status: "request-error",
        snapshot: state.snapshot,
        message: error instanceof Error ? error.message : String(error),
      }));
    }
  };

  const dismissResult = () => {
    if (state.status !== "result" && state.status !== "request-error") return;
    updateWithTransition(() => setState({ status: "ready", snapshot: state.snapshot }));
  };

  const actionDetail = displayedPreviewState.status === "loading"
    ? "Waiting for the server-owned selection preview…"
    : displayedPreviewState.status === "error"
      ? "Selection preview failed. Installation is disabled."
      : previewBlocked
        ? "Selection is blocked by an ownership conflict. Installation is disabled."
        : preview === null
          ? "Choose at least one component to continue."
          : `Resolved closure: ${preview.resolvedComponents.join(", ") || "none"}`;

  const catalogueProps = {
    components: visibleComponents,
    installed,
    selected,
    query,
    applying,
    onQueryChange: setQuery,
    onToggle: toggle,
  } as const;

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-background">
      <SetupHeader snapshot={state.snapshot} />

      <main className="min-h-0 flex-1 overflow-hidden">
        <div className="hidden h-full min-h-0 grid-cols-[minmax(22rem,0.85fr)_minmax(28rem,1.15fr)] lg:grid">
          <ComponentCatalogue {...catalogueProps} idPrefix="desktop-component" className="border-r" />
          <PlanPane previewState={displayedPreviewState} />
        </div>

        <Tabs
          value={section}
          onValueChange={(value) => updateWithTransition(() => setSection(value as SetupSection))}
          className="h-full min-h-0 gap-0 lg:hidden"
        >
          <div className="shrink-0 border-b px-4 py-2">
            <TabsList className="h-10 w-full" aria-label="Setup sections">
              <TabsTrigger value="components" className="h-full">
                <Package data-icon="inline-start" />
                Components
              </TabsTrigger>
              <TabsTrigger value="review" className="h-full">
                <ListChecks data-icon="inline-start" />
                Review
                {selected.size > 0 ? <Badge variant="secondary">{selected.size}</Badge> : null}
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="components" className="min-h-0 overflow-hidden [view-transition-name:setup-pane]">
            <ComponentCatalogue {...catalogueProps} idPrefix="mobile-component" />
          </TabsContent>
          <TabsContent value="review" className="min-h-0 overflow-hidden [view-transition-name:setup-pane]">
            <PlanPane previewState={displayedPreviewState} />
          </TabsContent>
        </Tabs>
      </main>

      <footer className="flex min-h-20 shrink-0 items-center justify-between gap-4 border-t bg-background/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="min-w-0">
          <strong className="block text-xs font-medium">
            {selected.size > 0 ? `${selected.size} selected` : "No additions selected"}
          </strong>
          <span className="mt-1 block truncate text-xs text-muted-foreground" title={actionDetail}>
            {actionDetail}
          </span>
        </div>
        <Button size="lg" className="h-10 shrink-0 gap-2 px-4" disabled={installDisabled} onClick={() => void apply()}>
          {applying ? <Spinner aria-hidden="true" /> : <DownloadSimple data-icon="inline-start" />}
          {applying ? "Installing…" : "Install selected"}
        </Button>
      </footer>

      <ResultNotice state={state} onDismiss={dismissResult} />
    </div>
  );
}
