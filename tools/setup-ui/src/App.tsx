import { useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/DownloadSimple";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
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
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./components/ui/accordion.js";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "./components/ui/alert.js";
import { Badge } from "./components/ui/badge.js";
import { Button } from "./components/ui/button.js";
import { Checkbox } from "./components/ui/checkbox.js";
import { Separator } from "./components/ui/separator.js";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "./components/ui/sidebar.js";
import { Skeleton } from "./components/ui/skeleton.js";
import { Spinner } from "./components/ui/spinner.js";
import { TooltipProvider } from "./components/ui/tooltip.js";
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

const token = captureLaunchToken();

function selectionKey(components: Iterable<string>): string {
  return JSON.stringify([...components].sort());
}

function projectName(root: string): string {
  return root.split(/[\\/]/u).filter(Boolean).at(-1) ?? root;
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

function SearchShortcut() {
  const { isMobile, setOpenMobile } = useSidebar();

  useEffect(() => {
    const focusSearch = () => {
      const input = document.querySelector<HTMLInputElement>("[data-setup-search]");
      if (input?.offsetParent !== null) {
        input?.focus();
        input?.select();
        return;
      }
      if (!isMobile) return;
      setOpenMobile(true);
      window.setTimeout(() => {
        const openedInput = document.querySelector<HTMLInputElement>("[data-setup-search]");
        openedInput?.focus();
        openedInput?.select();
      }, 0);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) return;
      event.preventDefault();
      focusSearch();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMobile, setOpenMobile]);

  return null;
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
    : component.name;

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
    <SidebarMenuItem data-selected={selected} data-installed={installed}>
      <SidebarMenuButton
        render={<label htmlFor={id} />}
        isActive={selected}
        className={cn(
          "h-9 cursor-pointer pr-8",
          installed && "cursor-default text-sidebar-foreground/55",
        )}
        title={detail}
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
        <span className="truncate font-mono" id={`${id}-label`}>
          {component.name}
        </span>
      </SidebarMenuButton>
      {installed ? (
        <SidebarMenuBadge aria-label="Installed" title="Installed">
          <CheckCircle className="size-3.5" />
        </SidebarMenuBadge>
      ) : null}
    </SidebarMenuItem>
  );
}

function SetupCatalogue({
  snapshot,
  components,
  installed,
  selected,
  query,
  applying,
  onQueryChange,
  onToggle,
}: {
  readonly snapshot: SetupSnapshot;
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
    <Sidebar collapsible="offcanvas" data-component-pane>
      <SidebarHeader className="gap-3 p-3">
        <div className="flex min-w-0 items-center gap-2 px-1">
          <span
            aria-hidden="true"
            className="grid size-7 shrink-0 place-items-center rounded-md bg-sidebar-primary font-heading text-[0.625rem] font-bold text-sidebar-primary-foreground"
          >
            AC
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium" title={snapshot.projectRoot}>
              {projectName(snapshot.projectRoot)}
            </p>
            <p className="text-[0.625rem] text-sidebar-foreground/55">
              registry {snapshot.registryRevision}
            </p>
          </div>
        </div>
        <div className="relative">
          <MagnifyingGlass
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 z-10 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <SidebarInput
            data-setup-search
            type="search"
            value={query}
            placeholder="Components"
            aria-label="Search components"
            className="pl-8 pr-8"
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
          <kbd className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 font-mono text-[0.625rem] text-muted-foreground">
            /
          </kbd>
        </div>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent className="fade-y">
        <SidebarGroup className="py-2">
          <SidebarGroupContent>
            <SidebarMenu data-component-list>
              {components.length === 0 ? (
                <li className="px-2 py-8 text-center text-xs text-sidebar-foreground/55">
                  No matches
                </li>
              ) : components.map((component) => (
                <ComponentRow
                  key={component.name}
                  component={component}
                  installed={installed.has(component.name)}
                  selected={selected.has(component.name)}
                  disabled={applying}
                  onToggle={() => onToggle(component.name)}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarSeparator />
      <SidebarFooter className="flex-row items-center justify-between px-3 py-2 text-[0.6875rem] text-sidebar-foreground/60">
        <span>{selected.size} selected</span>
        <span>{installed.size} installed</span>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function Metric({ value, label }: { readonly value: number; readonly label: string }) {
  return (
    <div className="min-w-0 text-center">
      <strong className="block font-heading text-xl font-semibold tabular-nums">{value}</strong>
      <span className="text-[0.6875rem] text-muted-foreground">{label}</span>
    </div>
  );
}

function DetailList({ values, empty = "None" }: { readonly values: readonly string[]; readonly empty?: string }) {
  if (values.length === 0) return <p className="text-muted-foreground">{empty}</p>;
  return (
    <ul className="grid gap-1.5">
      {values.map((value) => (
        <li key={value} className="break-words font-mono text-[0.6875rem]">{value}</li>
      ))}
    </ul>
  );
}

function PlanSkeleton() {
  return (
    <div className="grid gap-5">
      <Skeleton className="h-24 rounded-lg" />
      <Skeleton className="h-10 w-2/3" />
      <Skeleton className="h-32 rounded-md" />
    </div>
  );
}

function PlanPane({ previewState }: { readonly previewState: PreviewState }) {
  const preview = previewState.status === "ready" ? previewState.preview : null;
  const statusLabel = preview?.status === "changes-ready"
    ? "Ready"
    : preview?.status === "blocked"
      ? "Blocked"
      : preview?.status === "current"
        ? "Current"
        : "Planning";
  const statusVariant = preview?.status === "blocked"
    ? "destructive"
    : preview?.status === "current"
      ? "secondary"
      : "outline";

  return (
    <section
      className="fade-y min-h-0 flex-1 overflow-y-auto"
      aria-labelledby="installation-heading"
      aria-live="polite"
    >
      <div
        className="mx-auto grid w-full max-w-4xl gap-6 px-4 py-6 sm:px-6 lg:px-8"
        aria-busy={previewState.status === "loading"}
      >
        <div className="flex items-center justify-between gap-4">
          <h2 id="installation-heading" className="font-heading text-base font-semibold">Installation</h2>
          <Badge variant={statusVariant}>{statusLabel}</Badge>
        </div>

        <div className="min-h-72 [view-transition-name:selection-plan]">
          {previewState.status === "loading" ? (
            <div className="grid gap-5">
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Spinner aria-hidden="true" />
                Planning
              </p>
              <PlanSkeleton />
            </div>
          ) : null}

          {previewState.status === "error" ? (
            <Alert variant="destructive">
              <WarningCircle aria-hidden="true" />
              <AlertTitle>Plan failed</AlertTitle>
              <AlertDescription>{previewState.message}</AlertDescription>
            </Alert>
          ) : null}

          {preview !== null ? (
            <div className="grid gap-6 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">
              <div className="grid grid-cols-3 divide-x divide-border rounded-lg bg-muted/45 py-4">
                <Metric value={preview.footprint.componentCount} label="components" />
                <Metric value={preview.footprint.artifactCount} label="artifacts" />
                <Metric value={preview.footprint.targetCount} label="targets" />
              </div>

              <div className="grid gap-2">
                <h3 className="text-xs font-medium">
                  {preview.requestedComponents.length > 0 ? "Adding" : "No additions selected"}
                </h3>
                {preview.requestedComponents.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {preview.requestedComponents.map((component) => (
                      <Badge key={component} variant="secondary" className="font-mono">
                        {component}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>

              {preview.drift.conflicts.length > 0 ? (
                <Alert variant="destructive">
                  <WarningCircle aria-hidden="true" />
                  <AlertTitle>Ownership conflict</AlertTitle>
                  <AlertDescription className="grid gap-1">
                    {preview.drift.conflicts.map((conflict) => (
                      <span key={`${conflict.targetPath}-${conflict.status}`} className="break-words">
                        {conflict.targetPath}: {conflict.detail}
                      </span>
                    ))}
                  </AlertDescription>
                </Alert>
              ) : null}

              {preview.trustRequired ? (
                <Alert>
                  <ShieldCheck aria-hidden="true" />
                  <AlertTitle>Trust required</AlertTitle>
                  <AlertDescription>
                    Codex must trust this repository before loading project configuration.
                  </AlertDescription>
                </Alert>
              ) : null}

              <Accordion multiple>
                <AccordionItem value="components">
                  <AccordionTrigger>
                    <span>Components</span>
                    <Badge variant="secondary">{preview.resolvedComponents.length}</Badge>
                  </AccordionTrigger>
                  <AccordionContent className="grid gap-4">
                    <div className="grid gap-1">
                      <p className="font-medium">Direct</p>
                      <DetailList values={preview.directComponents} />
                    </div>
                    <div className="grid gap-1">
                      <p className="font-medium">Transitive</p>
                      <DetailList values={preview.transitiveComponents} />
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="capabilities">
                  <AccordionTrigger>
                    <span>Capabilities</span>
                    <Badge variant="secondary">{preview.capabilities.length}</Badge>
                  </AccordionTrigger>
                  <AccordionContent>
                    <DetailList
                      values={preview.capabilities.map((capability) =>
                        `${capability.requirement} ${capability.kind}:${capability.name}`)}
                    />
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="licenses">
                  <AccordionTrigger>
                    <span>Licenses</span>
                    <Badge variant="secondary">{preview.licenses.length}</Badge>
                  </AccordionTrigger>
                  <AccordionContent>
                    <DetailList
                      values={preview.licenses.map((license) => license.kind === "project"
                        ? `${license.spdx} · ${license.noticePath}`
                        : `${license.spdx} · ${license.source}@${license.revision}`)}
                    />
                  </AccordionContent>
                </AccordionItem>

                {preview.activations.length > 0 ? (
                  <AccordionItem value="activation">
                    <AccordionTrigger>
                      <span>Activation</span>
                      <Badge variant="secondary">{preview.activations.length}</Badge>
                    </AccordionTrigger>
                    <AccordionContent>
                      <ul className="grid gap-3">
                        {preview.activations.map((activation) => (
                          <li key={activation.id}>
                            <strong className="capitalize">{activation.status}</strong>
                            <p className="mt-0.5 text-muted-foreground">{activation.message}</p>
                          </li>
                        ))}
                      </ul>
                    </AccordionContent>
                  </AccordionItem>
                ) : null}
              </Accordion>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ResultNotice({ state, onDismiss }: { readonly state: AppState; readonly onDismiss: () => void }) {
  if (state.status !== "result" && state.status !== "request-error") return null;
  const applied = state.status === "result" && state.outcome.status === "applied";
  const title = applied
    ? "Installed"
    : state.status === "request-error"
      ? "Install failed"
      : "Install blocked";
  const description = state.status === "request-error"
    ? state.message
    : state.outcome.status === "applied"
      ? `${state.outcome.writtenPaths.length} paths written`
      : state.outcome.conflicts.map((conflict) => `${conflict.targetPath}: ${conflict.detail}`).join(" · ");

  return (
    <Alert
      variant={applied ? "default" : "destructive"}
      role={applied ? "status" : "alert"}
      className="fixed right-4 bottom-20 z-50 w-[min(26rem,calc(100vw-2rem))] border-0 bg-popover p-4 text-popover-foreground smooth-shadow-ring-lg [view-transition-name:result-notice] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-200"
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
    <TooltipProvider>
      <SidebarProvider className="h-dvh min-h-0 overflow-hidden">
        <Sidebar collapsible="offcanvas">
          <SidebarHeader className="gap-3 p-3">
            <div className="flex items-center gap-2">
              <Skeleton className="size-7" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-8 w-full" />
          </SidebarHeader>
          <SidebarSeparator />
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {Array.from({ length: 8 }, (_, index) => (
                    <SidebarMenuItem key={index}>
                      <SidebarMenuSkeleton showIcon />
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
        <SidebarInset className="h-full min-h-0 overflow-hidden">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger />
            <Separator orientation="vertical" className="data-vertical:h-4 data-vertical:self-auto" />
            <Skeleton className="h-3 w-40" />
          </header>
          <div className="grid flex-1 content-start gap-5 p-6">
            <Skeleton className="h-5 w-28" />
            <PlanSkeleton />
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
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
          component.kind.toLowerCase().includes(normalized) ||
          component.dependencies.some((dependency) => dependency.toLowerCase().includes(normalized)));
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
        if (!stale) {
          updateWithTransition(() => setPreviewState({
            status: "ready",
            selectionKey: requestedKey,
            preview,
          }));
        }
      },
      (error: unknown) => {
        if (!stale) {
          updateWithTransition(() => setPreviewState({
            status: "error",
            selectionKey: requestedKey,
            message: error instanceof Error ? error.message : String(error),
          }));
        }
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
  const installDisabled = selected.size === 0 || applying || preview === null || previewBlocked;

  const toggle = (name: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const apply = async () => {
    if (selected.size === 0 || applying || preview === null || previewBlocked) return;
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

  const actionSummary = displayedPreviewState.status === "loading"
    ? "Planning"
    : displayedPreviewState.status === "error"
      ? "Plan unavailable"
      : previewBlocked
        ? "Blocked"
        : selected.size === 0
          ? "No selection"
          : `${selected.size} selected · ${preview?.footprint.targetCount ?? 0} targets`;

  return (
    <TooltipProvider>
      <SidebarProvider className="h-dvh min-h-0 overflow-hidden">
        <SearchShortcut />
        <SetupCatalogue
          snapshot={state.snapshot}
          components={visibleComponents}
          installed={installed}
          selected={selected}
          query={query}
          applying={applying}
          onQueryChange={setQuery}
          onToggle={toggle}
        />

        <SidebarInset className="h-full min-h-0 overflow-hidden" aria-label="Agent Context Setup">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4 sm:px-5">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-1 data-vertical:h-4 data-vertical:self-auto"
            />
            <h1 className="min-w-0 truncate text-sm font-medium" title={state.snapshot.projectRoot}>
              {projectName(state.snapshot.projectRoot)}
            </h1>
            <Badge variant={state.snapshot.initialized ? "secondary" : "outline"} className="ml-auto">
              {state.snapshot.initialized ? "Initialized" : "New"}
            </Badge>
          </header>

          <PlanPane previewState={displayedPreviewState} />

          <footer className="flex h-16 shrink-0 items-center justify-between gap-4 border-t bg-background/95 px-4 backdrop-blur sm:px-5">
            <span className="truncate text-xs text-muted-foreground">{actionSummary}</span>
            <Button
              size="lg"
              className="h-10 shrink-0 gap-2 px-4"
              disabled={installDisabled}
              onClick={() => void apply()}
            >
              {applying ? <Spinner aria-hidden="true" /> : <DownloadSimple data-icon="inline-start" />}
              {applying ? "Installing…" : "Install"}
            </Button>
          </footer>
        </SidebarInset>

        <ResultNotice state={state} onDismiss={dismissResult} />
      </SidebarProvider>
    </TooltipProvider>
  );
}
