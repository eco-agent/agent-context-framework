import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
import { ArrowsClockwiseIcon as ArrowsClockwise } from "@phosphor-icons/react/ArrowsClockwise";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/DownloadSimple";
import { FileCodeIcon as FileCode } from "@phosphor-icons/react/FileCode";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/WarningCircle";
import { XIcon as X } from "@phosphor-icons/react/X";
import type {
  SetupComponentArtifact,
  SetupComponentDetail,
  SetupComponentSummary,
  SetupInstallOutcome,
  SetupSelectionPreview,
  SetupSnapshot,
  SetupSourceOverride,
  SetupToolSummary,
} from "@agent-context/dev-tooling/setup-contract";

import {
  captureLaunchToken,
  fetchSetupComponentDetail,
  fetchSetupPlan,
  fetchSetupSnapshot,
  installSetupComponents,
} from "./api.js";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "./components/ui/alert.js";
import { Badge } from "./components/ui/badge.js";
import { Button } from "./components/ui/button.js";
import { ButtonGroup } from "./components/ui/button-group.js";
import { Checkbox } from "./components/ui/checkbox.js";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select.js";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs.js";
import { TooltipProvider } from "./components/ui/tooltip.js";
import { cn } from "./lib/utils.js";
import { MarkdownPreview } from "./markdown-preview.js";

const FormattedSource = lazy(async () => {
  const module = await import("./source-preview.js");
  return { default: module.FormattedSource };
});

type AppState =
  | { readonly status: "loading" }
  | { readonly status: "load-error"; readonly message: string }
  | { readonly status: "ready"; readonly snapshot: SetupSnapshot }
  | { readonly status: "applying"; readonly snapshot: SetupSnapshot }
  | { readonly status: "request-error"; readonly snapshot: SetupSnapshot; readonly message: string }
  | { readonly status: "result"; readonly snapshot: SetupSnapshot; readonly outcome: SetupInstallOutcome };

type PreviewState =
  | { readonly status: "loading"; readonly requestKey: string }
  | { readonly status: "error"; readonly requestKey: string; readonly message: string }
  | { readonly status: "ready"; readonly requestKey: string; readonly preview: SetupSelectionPreview };

type DetailState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "ready"; readonly detail: SetupComponentDetail };

interface SourceDraft {
  readonly componentName: string;
  readonly original: string;
  readonly content: string;
}

const token = captureLaunchToken();

function projectName(root: string): string {
  return root.split(/[\\/]/u).filter(Boolean).at(-1) ?? root;
}

function setupRequestKey(components: Iterable<string>, overrides: readonly SetupSourceOverride[]): string {
  return JSON.stringify({
    components: [...components].sort(),
    overrides: overrides.map((override) => [override.sourcePath, override.content]),
  });
}

function updateWithTransition(update: () => void): void {
  if (document.startViewTransition === undefined || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    update();
    return;
  }
  try {
    document.startViewTransition(() => flushSync(update));
  } catch {
    update();
  }
}

function resolvedSelection(snapshot: SetupSnapshot, selected: ReadonlySet<string>): ReadonlySet<string> {
  const byName = new Map(snapshot.components.map((component) => [component.name, component]));
  const resolved = new Set(snapshot.initialized
    ? [...snapshot.installedDirectComponents, ...selected]
    : ["core", ...selected]);
  const pending = [...resolved];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) continue;
    for (const dependency of byName.get(current)?.dependencies ?? []) {
      if (resolved.has(dependency)) continue;
      resolved.add(dependency);
      pending.push(dependency);
    }
  }
  return resolved;
}

function sourceOverrides(
  snapshot: SetupSnapshot,
  selected: ReadonlySet<string>,
  drafts: Readonly<Record<string, SourceDraft>>,
): readonly SetupSourceOverride[] {
  const resolved = resolvedSelection(snapshot, selected);
  return Object.entries(drafts)
    .filter(([, draft]) => resolved.has(draft.componentName) && draft.content !== draft.original)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([sourcePath, draft]) => ({ sourcePath, content: draft.content }));
}

function SearchShortcut() {
  const { isMobile, setOpenMobile } = useSidebar();
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      event.preventDefault();
      const visible = document.querySelector<HTMLInputElement>("[data-setup-search]");
      if (visible?.offsetParent !== null) {
        visible?.focus();
        visible?.select();
        return;
      }
      if (!isMobile) return;
      setOpenMobile(true);
      window.setTimeout(() => document.querySelector<HTMLInputElement>("[data-setup-search]")?.focus(), 0);
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
  active,
  disabled,
  onToggle,
  onInspect,
}: {
  readonly component: SetupComponentSummary;
  readonly installed: boolean;
  readonly selected: boolean;
  readonly active: boolean;
  readonly disabled: boolean;
  readonly onToggle: () => void;
  readonly onInspect: () => void;
}) {
  return (
    <SidebarMenuItem className="flex min-w-0 items-center gap-1 px-1" data-selected={selected}>
      <Checkbox
        checked={installed || selected}
        disabled={installed || disabled}
        aria-label={`${selected ? "Deselect" : "Select"} ${component.displayName}`}
        className="ml-1 shrink-0"
        onCheckedChange={onToggle}
      />
      <SidebarMenuButton
        type="button"
        isActive={active}
        className="h-9 min-w-0 flex-1"
        title={`${component.displayName} (${component.name})`}
        onClick={onInspect}
      >
        <span className="min-w-0 flex-1 truncate">{component.displayName}</span>
        {installed ? <CheckCircle aria-label="Installed" className="shrink-0 text-muted-foreground" /> : null}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function SetupCatalogue({
  snapshot,
  components,
  installed,
  selected,
  activeName,
  query,
  applying,
  onQueryChange,
  onToggle,
  onInspect,
  onSelectAll,
  onSelectNone,
  onInvert,
}: {
  readonly snapshot: SetupSnapshot;
  readonly components: readonly SetupComponentSummary[];
  readonly installed: ReadonlySet<string>;
  readonly selected: ReadonlySet<string>;
  readonly activeName: string | null;
  readonly query: string;
  readonly applying: boolean;
  readonly onQueryChange: (query: string) => void;
  readonly onToggle: (name: string) => void;
  readonly onInspect: (name: string) => void;
  readonly onSelectAll: () => void;
  readonly onSelectNone: () => void;
  readonly onInvert: () => void;
}) {
  return (
    <Sidebar collapsible="offcanvas" data-component-pane>
      <SidebarHeader className="gap-3 p-3">
        <div className="flex min-w-0 items-center gap-2 px-1">
          <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-md bg-sidebar-primary font-heading text-[0.625rem] font-bold text-sidebar-primary-foreground">AC</span>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium" title={snapshot.projectRoot}>{projectName(snapshot.projectRoot)}</p>
            <p className="text-[0.625rem] text-sidebar-foreground/55">registry {snapshot.registryRevision}</p>
          </div>
        </div>
        <div className="relative">
          <MagnifyingGlass aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 z-10 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <SidebarInput
            data-setup-search
            type="search"
            value={query}
            placeholder="Find a component"
            aria-label="Search components"
            className="pl-8 pr-8"
            onChange={(event) => onQueryChange(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && query.length > 0) {
                event.preventDefault();
                onQueryChange("");
              }
            }}
          />
          <kbd className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 font-mono text-[0.625rem] text-muted-foreground">/</kbd>
        </div>
        <ButtonGroup className="w-full" aria-label="Bulk selection">
          <Button variant="outline" className="flex-1" disabled={applying} onClick={onSelectAll}>All</Button>
          <Button variant="outline" className="flex-1" disabled={applying || selected.size === 0} onClick={onSelectNone}>None</Button>
          <Button variant="outline" className="flex-1" disabled={applying} onClick={onInvert}><ArrowsClockwise data-icon="inline-start" />Invert</Button>
        </ButtonGroup>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent className="fade-y">
        <SidebarGroup className="py-2">
          <SidebarGroupContent>
            <SidebarMenu data-component-list>
              {components.length === 0 ? <li className="px-2 py-8 text-center text-xs text-sidebar-foreground/55">No matches</li> : components.map((component) => (
                <ComponentRow
                  key={component.name}
                  component={component}
                  installed={installed.has(component.name)}
                  selected={selected.has(component.name)}
                  active={activeName === component.name}
                  disabled={applying}
                  onToggle={() => onToggle(component.name)}
                  onInspect={() => onInspect(component.name)}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarSeparator />
      <SidebarFooter className="flex-row items-center justify-between px-3 py-2 text-[0.6875rem] text-sidebar-foreground/60"><span>{selected.size} selected</span><span>{installed.size} installed</span></SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function InspectorSkeleton() {
  return <div className="grid h-full content-start gap-4 p-4 sm:p-6"><Skeleton className="h-6 w-52" /><Skeleton className="h-8 w-44" /><Skeleton className="h-64 w-full" /></div>;
}

function FilePicker({
  artifacts,
  activePath,
  onChange,
}: {
  readonly artifacts: readonly SetupComponentArtifact[];
  readonly activePath: string;
  readonly onChange: (sourcePath: string) => void;
}) {
  return (
    <>
      <div className="hidden min-h-0 w-52 shrink-0 overflow-y-auto border-r p-2 fade-y md:block">
        <nav aria-label="Component files" className="grid gap-0.5">
          {artifacts.map((artifact) => (
            <Button
              key={artifact.sourcePath}
              type="button"
              variant={artifact.sourcePath === activePath ? "secondary" : "ghost"}
              className="h-auto min-w-0 justify-start px-2 py-1.5 text-left"
              title={artifact.sourcePath}
              onClick={() => onChange(artifact.sourcePath)}
            >
              <FileCode className="shrink-0" />
              <span className="truncate">{artifact.sourcePath.split("/").at(-1)}</span>
            </Button>
          ))}
        </nav>
      </div>
      <div className="border-b p-3 md:hidden">
        <Select value={activePath} onValueChange={(value) => { if (value !== null) onChange(value); }}>
          <SelectTrigger className="w-full" aria-label="Component file"><SelectValue>{activePath.split("/").at(-1)}</SelectValue></SelectTrigger>
          <SelectContent>
            {artifacts.map((artifact) => <SelectItem key={artifact.sourcePath} value={artifact.sourcePath}>{artifact.sourcePath.split("/").at(-1)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}

function SourceEditor({
  artifact,
  componentName,
  installed,
  draft,
  onEdit,
  onReset,
}: {
  readonly artifact: SetupComponentArtifact;
  readonly componentName: string;
  readonly installed: boolean;
  readonly draft: SourceDraft | undefined;
  readonly onEdit: (sourcePath: string, draft: SourceDraft) => void;
  readonly onReset: (sourcePath: string) => void;
}) {
  const content = draft?.content ?? artifact.content;
  const dirty = draft !== undefined && draft.content !== draft.original;
  const editable = artifact.editable && !installed;
  const isMarkdown = artifact.mediaType === "text/markdown";
  const [editorRevision, setEditorRevision] = useState(0);
  const handleChange = useCallback((nextContent: string) => {
    onEdit(artifact.sourcePath, { componentName, original: artifact.content, content: nextContent });
  }, [artifact.content, artifact.sourcePath, componentName, onEdit]);
  const handleReset = () => {
    setEditorRevision((current) => current + 1);
    onReset(artifact.sourcePath);
  };
  return (
    <Tabs defaultValue={isMarkdown ? "preview" : "source"} className="min-h-0 min-w-0 flex-1 gap-0">
      <div className="flex min-w-0 shrink-0 flex-col items-stretch gap-2 px-3 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3 sm:px-4">
        <div className="min-w-0 sm:self-center">
          <p className="truncate font-mono text-[0.6875rem]" title={artifact.sourcePath}>{artifact.sourcePath}</p>
          <p className="truncate text-[0.6875rem] text-muted-foreground" title={artifact.targetPath}>{artifact.targetPath}</p>
        </div>
        <div className="flex w-full items-center justify-end gap-1 sm:w-auto sm:shrink-0">
          {isMarkdown ? <TabsList className="w-full sm:w-fit" aria-label="Content view"><TabsTrigger value="preview">Preview</TabsTrigger><TabsTrigger value="source">Source</TabsTrigger></TabsList> : null}
          {dirty ? <Button variant="ghost" size="sm" onClick={handleReset}><ArrowCounterClockwise data-icon="inline-start" />Reset</Button> : null}
        </div>
      </div>
      {isMarkdown ? <TabsContent value="preview" className="min-h-0 overflow-hidden"><MarkdownPreview content={content} /></TabsContent> : null}
      <TabsContent value="source" className="min-h-0 overflow-hidden">
        <Suspense fallback={<div className="grid h-full place-items-center"><Spinner /></div>}>
          <FormattedSource key={editorRevision} artifact={artifact} content={content} editable={editable} onChange={handleChange} />
        </Suspense>
      </TabsContent>
    </Tabs>
  );
}

function ToolTable({ tool }: { readonly tool: SetupToolSummary }) {
  return (
    <section className="grid gap-4" aria-labelledby={`tool-${tool.name}`}>
      <div>
        <h3 id={`tool-${tool.name}`} className="font-mono text-sm font-semibold">{tool.name}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{tool.description}</p>
        <p className="mt-1 font-mono text-[0.6875rem] text-muted-foreground">{tool.sourcePath}</p>
      </div>
      {tool.modes.map((mode) => (
        <div key={mode.name} className="grid gap-2">
          <div><h4 className="font-mono text-xs font-medium">{mode.name}</h4><p className="text-xs text-muted-foreground">{mode.description}</p></div>
          <div className="max-w-full overflow-x-auto fade-x">
            <table className="w-full min-w-[38rem] border-separate border-spacing-0 text-left text-xs">
              <thead><tr className="text-muted-foreground"><th className="border-b px-2 py-2 font-medium">Argument</th><th className="border-b px-2 py-2 font-medium">Type</th><th className="border-b px-2 py-2 font-medium">Required</th><th className="border-b px-2 py-2 font-medium">Accepted values</th><th className="border-b px-2 py-2 font-medium">Description</th></tr></thead>
              <tbody>{mode.arguments.map((argument) => (
                <tr key={argument.name}><td className="border-b px-2 py-2 font-mono align-top">{argument.name}</td><td className="border-b px-2 py-2 font-mono align-top">{argument.type}</td><td className="border-b px-2 py-2 align-top">{argument.required ? "Yes" : "No"}</td><td className="border-b px-2 py-2 font-mono align-top">{argument.constraints.join(", ") || "Any"}</td><td className="border-b px-2 py-2 align-top text-muted-foreground">{argument.description}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      ))}
    </section>
  );
}

function ComponentInspector({
  activeName,
  detailState,
  installed,
  drafts,
  activeSourcePath,
  onSourceChange,
  onEdit,
  onReset,
  onInspectDependency,
}: {
  readonly activeName: string | null;
  readonly detailState: DetailState | null;
  readonly installed: boolean;
  readonly drafts: Readonly<Record<string, SourceDraft>>;
  readonly activeSourcePath: string | null;
  readonly onSourceChange: (sourcePath: string) => void;
  readonly onEdit: (sourcePath: string, draft: SourceDraft) => void;
  readonly onReset: (sourcePath: string) => void;
  readonly onInspectDependency: (name: string) => void;
}) {
  if (activeName === null) return <div className="grid h-full place-items-center p-6 text-sm text-muted-foreground">Choose a component to inspect.</div>;
  if (detailState === null || detailState.status === "loading") return <InspectorSkeleton />;
  if (detailState.status === "error") return <div className="p-4 sm:p-6"><Alert variant="destructive"><WarningCircle /><AlertTitle>Component unavailable</AlertTitle><AlertDescription>{detailState.message}</AlertDescription></Alert></div>;

  const detail = detailState.detail;
  const activeArtifact = detail.artifacts.find((artifact) => artifact.sourcePath === activeSourcePath) ?? detail.artifacts[0];
  return (
    <section className="flex min-h-0 flex-1 flex-col [view-transition-name:component-inspector]" aria-labelledby="component-heading">
      <div className="flex min-w-0 shrink-0 items-start justify-between gap-4 border-b px-4 py-3 sm:px-5">
        <div className="min-w-0"><div className="flex min-w-0 items-center gap-2"><h2 id="component-heading" className="truncate font-heading text-base font-semibold">{detail.displayName}</h2>{installed ? <Badge variant="secondary">Installed</Badge> : null}</div><p className="truncate font-mono text-[0.6875rem] text-muted-foreground" title={detail.name}>{detail.name}</p></div>
        {detail.dependencies.length > 0 ? <div className="hidden max-w-[45%] shrink-0 items-center gap-1 overflow-x-auto fade-x lg:flex">{detail.dependencies.map((dependency) => <Button key={dependency.name} variant="ghost" size="sm" onClick={() => onInspectDependency(dependency.name)}>{dependency.displayName}</Button>)}</div> : null}
      </div>
      <Tabs defaultValue="content" className="min-h-0 flex-1 gap-0">
        <div className="shrink-0 border-b px-4 py-1.5 sm:px-5"><TabsList variant="line"><TabsTrigger value="content">Content <Badge variant="secondary">{detail.artifacts.length}</Badge></TabsTrigger><TabsTrigger value="tools">Tools <Badge variant="secondary">{detail.tools.length}</Badge></TabsTrigger></TabsList></div>
        <TabsContent value="content" className="min-h-0 overflow-hidden">
          {detail.artifacts.length === 0 || activeArtifact === undefined ? (
            <div className="grid h-full content-center justify-items-center gap-3 p-6 text-center"><p className="text-sm font-medium">This bundle has no files of its own.</p>{detail.dependencies.length > 0 ? <div className="flex flex-wrap justify-center gap-1">{detail.dependencies.map((dependency) => <Button key={dependency.name} variant="outline" onClick={() => onInspectDependency(dependency.name)}>{dependency.displayName}</Button>)}</div> : null}</div>
          ) : (
            <div className="flex h-full min-h-0 min-w-0 flex-col md:flex-row">
              <FilePicker artifacts={detail.artifacts} activePath={activeArtifact.sourcePath} onChange={onSourceChange} />
              <SourceEditor key={activeArtifact.sourcePath} artifact={activeArtifact} componentName={detail.name} installed={installed} draft={drafts[activeArtifact.sourcePath]} onEdit={onEdit} onReset={onReset} />
            </div>
          )}
        </TabsContent>
        <TabsContent value="tools" className="min-h-0 overflow-y-auto p-4 fade-y sm:p-5">
          {detail.tools.length === 0 ? <div className="grid min-h-48 place-items-center text-center text-sm text-muted-foreground">This component does not expose an ACF-owned tool.</div> : <div className="grid gap-7">{detail.tools.map((tool) => <ToolTable key={tool.name} tool={tool} />)}</div>}
        </TabsContent>
      </Tabs>
    </section>
  );
}

function ResultNotice({ state, onDismiss }: { readonly state: AppState; readonly onDismiss: () => void }) {
  if (state.status !== "result" && state.status !== "request-error") return null;
  const applied = state.status === "result" && state.outcome.status === "applied";
  const title = applied ? "Installed" : state.status === "request-error" ? "Install failed" : "Install blocked";
  const description = state.status === "request-error" ? state.message : state.outcome.status === "applied" ? `${state.outcome.writtenPaths.length} paths written` : state.outcome.conflicts.map((conflict) => `${conflict.targetPath}: ${conflict.detail}`).join(" · ");
  return <Alert variant={applied ? "default" : "destructive"} role={applied ? "status" : "alert"} className="fixed right-4 bottom-20 z-50 w-[min(26rem,calc(100vw-2rem))] border-0 bg-popover p-4 text-popover-foreground smooth-shadow-ring-lg motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-200">{applied ? <CheckCircle /> : <WarningCircle />}<AlertTitle>{title}</AlertTitle><AlertDescription className="break-words">{description}</AlertDescription><AlertAction><Button variant="ghost" size="icon-sm" aria-label="Dismiss result" onClick={onDismiss}><X /></Button></AlertAction></Alert>;
}

function SetupLoading() {
  return <TooltipProvider><SidebarProvider className="h-dvh min-h-0 overflow-hidden"><Sidebar collapsible="offcanvas"><SidebarHeader className="gap-3 p-3"><div className="flex items-center gap-2"><Skeleton className="size-7" /><Skeleton className="h-3 w-32" /></div><Skeleton className="h-8 w-full" /><Skeleton className="h-7 w-full" /></SidebarHeader><SidebarSeparator /><SidebarContent><SidebarGroup><SidebarGroupContent><SidebarMenu>{Array.from({ length: 8 }, (_, index) => <SidebarMenuItem key={index}><SidebarMenuSkeleton showIcon /></SidebarMenuItem>)}</SidebarMenu></SidebarGroupContent></SidebarGroup></SidebarContent></Sidebar><SidebarInset className="h-full min-h-0 overflow-hidden"><header className="flex h-14 shrink-0 items-center gap-2 border-b px-4"><SidebarTrigger /><Separator orientation="vertical" className="data-vertical:h-4 data-vertical:self-auto" /><Skeleton className="h-3 w-40" /></header><InspectorSkeleton /></SidebarInset></SidebarProvider></TooltipProvider>;
}

function SetupLoadError({ message }: { readonly message: string }) {
  return <main className="grid h-dvh place-items-center bg-background p-6"><div className="grid w-full max-w-lg gap-4"><Alert variant="destructive"><WarningCircle /><AlertTitle>Setup could not load</AlertTitle><AlertDescription>{message}</AlertDescription></Alert><Button className="h-10 justify-self-start px-4" onClick={() => window.location.reload()}>Reload</Button></div></main>;
}

export function App() {
  const [state, setState] = useState<AppState>({ status: "loading" });
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [activeName, setActiveName] = useState<string | null>(null);
  const [details, setDetails] = useState<Readonly<Record<string, DetailState>>>({});
  const [activeSources, setActiveSources] = useState<Readonly<Record<string, string>>>({});
  const [drafts, setDrafts] = useState<Readonly<Record<string, SourceDraft>>>({});
  const [previewState, setPreviewState] = useState<PreviewState>({ status: "loading", requestKey: "" });

  useEffect(() => {
    void fetchSetupSnapshot(token).then(
      (snapshot) => updateWithTransition(() => {
        const installedComponents = new Set(snapshot.installedResolvedComponents);
        const defaults = snapshot.recommendedComponents.filter((name) => !installedComponents.has(name));
        setSelected(new Set(defaults));
        setActiveName(defaults[0] ?? snapshot.components[0]?.name ?? null);
        setState({ status: "ready", snapshot });
      }),
      (error: unknown) => updateWithTransition(() => setState({ status: "load-error", message: error instanceof Error ? error.message : String(error) })),
    );
  }, []);

  const snapshot = state.status === "loading" || state.status === "load-error" ? null : state.snapshot;
  const installed = useMemo(() => new Set(snapshot?.installedResolvedComponents ?? []), [snapshot?.installedResolvedComponents]);
  const visibleComponents = useMemo(() => {
    if (snapshot === null) return [];
    const normalized = query.trim().toLowerCase();
    return normalized.length === 0 ? snapshot.components : snapshot.components.filter((component) => component.displayName.toLowerCase().includes(normalized) || component.name.toLowerCase().includes(normalized));
  }, [query, snapshot]);
  const overrides = useMemo(() => snapshot === null ? [] : sourceOverrides(snapshot, selected, drafts), [drafts, selected, snapshot]);
  const currentRequestKey = setupRequestKey(selected, overrides);

  useEffect(() => {
    if (snapshot === null) return;
    const components = [...selected].sort();
    const nextRequestKey = setupRequestKey(components, overrides);
    let stale = false;
    const timer = window.setTimeout(() => {
      setPreviewState({ status: "loading", requestKey: nextRequestKey });
      void fetchSetupPlan(token, components, overrides).then(
        (preview) => { if (!stale) updateWithTransition(() => setPreviewState({ status: "ready", requestKey: nextRequestKey, preview })); },
        (error: unknown) => { if (!stale) updateWithTransition(() => setPreviewState({ status: "error", requestKey: nextRequestKey, message: error instanceof Error ? error.message : String(error) })); },
      );
    }, overrides.length > 0 ? 250 : 0);
    return () => { stale = true; window.clearTimeout(timer); };
  }, [currentRequestKey, snapshot]);

  useEffect(() => {
    if (activeName === null) return;
    setDetails((current) => ({ ...current, [activeName]: { status: "loading" } }));
    let stale = false;
    void fetchSetupComponentDetail(token, activeName).then(
      (detail) => {
        if (stale) return;
        setDetails((current) => ({ ...current, [activeName]: { status: "ready", detail } }));
        const preferred = detail.artifacts.find((artifact) => artifact.sourcePath.endsWith("/SKILL.md")) ?? detail.artifacts[0];
        if (preferred !== undefined) setActiveSources((current) => ({ ...current, [activeName]: current[activeName] ?? preferred.sourcePath }));
      },
      (error: unknown) => { if (!stale) setDetails((current) => ({ ...current, [activeName]: { status: "error", message: error instanceof Error ? error.message : String(error) } })); },
    );
    return () => { stale = true; };
  }, [activeName]);

  const edit = useCallback((sourcePath: string, draft: SourceDraft) => {
    setSelected((current) => current.has(draft.componentName) ? current : new Set([...current, draft.componentName]));
    setDrafts((current) => {
      const next = { ...current };
      if (draft.content === draft.original) delete next[sourcePath]; else next[sourcePath] = draft;
      return next;
    });
  }, []);
  const reset = useCallback((sourcePath: string) => setDrafts((current) => { const next = { ...current }; delete next[sourcePath]; return next; }), []);

  if (state.status === "loading") return <SetupLoading />;
  if (state.status === "load-error") return <SetupLoadError message={state.message} />;

  const applying = state.status === "applying";
  const displayedPreviewState: PreviewState = previewState.requestKey === currentRequestKey ? previewState : { status: "loading", requestKey: currentRequestKey };
  const preview = displayedPreviewState.status === "ready" ? displayedPreviewState.preview : null;
  const previewBlocked = preview?.status === "blocked";
  const installDisabled = selected.size === 0 || applying || preview === null || previewBlocked;
  const availableNames = state.snapshot.components.filter((component) => !installed.has(component.name)).map((component) => component.name);

  const toggle = (name: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });
  const inspect = (name: string) => updateWithTransition(() => setActiveName(name));
  const apply = async () => {
    if (installDisabled) return;
    setState({ status: "applying", snapshot: state.snapshot });
    try {
      const outcome = await installSetupComponents(token, [...selected].sort(), overrides);
      updateWithTransition(() => {
        setState({ status: "result", snapshot: outcome.snapshot, outcome });
        if (outcome.status === "applied") { setSelected(new Set()); setDrafts({}); }
      });
    } catch (error) {
      updateWithTransition(() => setState({ status: "request-error", snapshot: state.snapshot, message: error instanceof Error ? error.message : String(error) }));
    }
  };
  const dismissResult = () => {
    if (state.status !== "result" && state.status !== "request-error") return;
    updateWithTransition(() => setState({ status: "ready", snapshot: state.snapshot }));
  };
  const dirtyCount = Object.keys(drafts).length;
  const actionSummary = displayedPreviewState.status === "loading" ? "Checking changes" : displayedPreviewState.status === "error" ? "Plan unavailable" : previewBlocked ? preview?.drift.conflicts[0]?.detail ?? "Blocked by a file conflict" : `${selected.size} selected${dirtyCount > 0 ? `, ${dirtyCount} edited` : ""}`;

  return (
    <TooltipProvider>
      <SidebarProvider className="h-dvh min-h-0 overflow-hidden">
        <SearchShortcut />
        <SetupCatalogue
          snapshot={state.snapshot}
          components={visibleComponents}
          installed={installed}
          selected={selected}
          activeName={activeName}
          query={query}
          applying={applying}
          onQueryChange={setQuery}
          onToggle={toggle}
          onInspect={inspect}
          onSelectAll={() => setSelected(new Set(availableNames))}
          onSelectNone={() => setSelected(new Set())}
          onInvert={() => setSelected(new Set(availableNames.filter((name) => !selected.has(name))))}
        />
        <SidebarInset className="h-full min-h-0 min-w-0 max-w-full overflow-hidden" aria-label="Agent Context Setup">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4 sm:px-5"><SidebarTrigger className="-ml-1" /><Separator orientation="vertical" className="mr-1 data-vertical:h-4 data-vertical:self-auto" /><h1 className="min-w-0 flex-1 truncate text-sm font-medium" title={state.snapshot.projectRoot}>{projectName(state.snapshot.projectRoot)}</h1><Badge variant={state.snapshot.initialized ? "secondary" : "outline"} className="ml-auto hidden shrink-0 sm:inline-flex">{state.snapshot.initialized ? "Initialized" : "New"}</Badge></header>
          <ComponentInspector
            activeName={activeName}
            detailState={activeName === null ? null : details[activeName] ?? null}
            installed={activeName !== null && installed.has(activeName)}
            drafts={drafts}
            activeSourcePath={activeName === null ? null : activeSources[activeName] ?? null}
            onSourceChange={(sourcePath) => { if (activeName !== null) setActiveSources((current) => ({ ...current, [activeName]: sourcePath })); }}
            onEdit={edit}
            onReset={reset}
            onInspectDependency={inspect}
          />
          <footer className="flex h-16 shrink-0 items-center justify-between gap-4 border-t bg-background/95 px-4 backdrop-blur sm:px-5"><span className={cn("min-w-0 flex-1 truncate text-xs text-muted-foreground", previewBlocked && "text-destructive")}>{actionSummary}</span><Button size="lg" className="size-10 shrink-0 gap-2 p-0 sm:h-10 sm:w-auto sm:px-4" aria-label={applying ? "Installing" : "Install"} disabled={installDisabled} onClick={() => void apply()}>{applying ? <Spinner /> : <DownloadSimple data-icon="inline-start" />}<span className="hidden sm:inline">{applying ? "Installing…" : "Install"}</span></Button></footer>
        </SidebarInset>
        <ResultNotice state={state} onDismiss={dismissResult} />
      </SidebarProvider>
    </TooltipProvider>
  );
}
