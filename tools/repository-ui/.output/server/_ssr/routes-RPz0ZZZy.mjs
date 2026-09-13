import { __toESM } from "../_runtime.mjs";
import { ScrollAreaContent, ScrollAreaCorner, ScrollAreaRoot, ScrollAreaScrollbar, ScrollAreaThumb, ScrollAreaViewport, require_jsx_runtime, require_react } from "../_libs/@base-ui/react+[...].mjs";
import { clsx } from "../_libs/clsx.mjs";
import { twMerge } from "../_libs/tailwind-merge.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-RPz0ZZZy.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function Icon({ children, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
		"aria-hidden": "true",
		viewBox: "0 0 24 24",
		fill: "none",
		stroke: "currentColor",
		strokeWidth: "1.7",
		strokeLinecap: "round",
		strokeLinejoin: "round",
		...props,
		children
	});
}
function FolderIcon(props) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
		...props,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M3.5 6.5h6l2 2h9v9.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" })
	});
}
function RefreshIcon(props) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Icon, {
		...props,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M20 7v5h-5" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M18.2 16.5A8 8 0 1 1 19.5 9" })]
	});
}
function SearchIcon(props) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Icon, {
		...props,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
			cx: "11",
			cy: "11",
			r: "6.5"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "m16 16 4 4" })]
	});
}
function PlusIcon(props) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
		...props,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M12 5v14M5 12h14" })
	});
}
function SyncIcon(props) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Icon, {
		...props,
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M4 8a8 8 0 0 1 13.5-2L20 8.5" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M20 4v4.5h-4.5M20 16a8 8 0 0 1-13.5 2L4 15.5" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M4 20v-4.5h4.5" })
		]
	});
}
function TrashIcon(props) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
		...props,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M5 7h14M9 7V4.5h6V7M7.5 7l.7 12h7.6l.7-12M10 10.5v5M14 10.5v5" })
	});
}
function ChevronIcon(props) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
		...props,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "m9 6 6 6-6 6" })
	});
}
function cn(...inputs) {
	return twMerge(clsx(inputs));
}
var shapeMap = {
	pill: {
		variant: "pill",
		item: "rounded-[20px]",
		bg: "rounded-[20px]",
		focusRing: "rounded-[22px]",
		mergedBg: "rounded-2xl",
		container: "rounded-3xl",
		button: "rounded-[20px]",
		input: "rounded-[20px]",
		bgRadius: 20,
		mergedRadius: 16
	},
	rounded: {
		variant: "rounded",
		item: "rounded-lg",
		bg: "rounded-lg",
		focusRing: "rounded-[10px]",
		mergedBg: "rounded-lg",
		container: "rounded-xl",
		button: "rounded-lg",
		input: "rounded-lg",
		bgRadius: 8,
		mergedRadius: 8
	}
};
var ShapeContext = (0, import_react.createContext)(null);
function useShape() {
	const ctx = (0, import_react.useContext)(ShapeContext);
	if (!ctx) return shapeMap.rounded;
	return ctx.classes;
}
function useTouchPrimary() {
	const [isTouchPrimary, setIsTouchPrimary] = (0, import_react.useState)(false);
	(0, import_react.useEffect)(() => {
		if (typeof window === "undefined") return;
		const controller = new AbortController();
		const { signal } = controller;
		const handleTouch = () => {
			const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
			const prefersTouch = window.matchMedia("(pointer: coarse)").matches;
			setIsTouchPrimary(hasTouch && prefersTouch);
		};
		window.matchMedia("(pointer: coarse)").addEventListener("change", handleTouch, { signal });
		window.addEventListener("pointerdown", handleTouch, { signal });
		handleTouch();
		return () => controller.abort();
	}, []);
	return isTouchPrimary;
}
var ScrollAreaContext = (0, import_react.createContext)(false);
var ScrollArea$1 = (0, import_react.forwardRef)(({ className, children, viewportClassName, orientation = "vertical", ...props }, ref) => {
	const isTouch = useTouchPrimary();
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ScrollAreaContext.Provider, {
		value: isTouch,
		children: isTouch ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			ref,
			role: "group",
			"data-slot": "scroll-area",
			"aria-roledescription": "scroll area",
			className: cn("relative overflow-hidden", className),
			...props,
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				"data-slot": "scroll-area-viewport",
				className: cn("size-full rounded-[inherit]", orientation === "vertical" && "overflow-y-auto", orientation === "horizontal" && "overflow-x-auto", orientation === "both" && "overflow-auto", viewportClassName),
				tabIndex: 0,
				children
			})
		}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ScrollAreaRoot, {
			ref,
			"data-slot": "scroll-area",
			className: cn("relative overflow-hidden", className),
			...props,
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ScrollAreaViewport, {
					"data-slot": "scroll-area-viewport",
					className: cn("size-full rounded-[inherit]", viewportClassName),
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ScrollAreaContent, { children })
				}),
				orientation !== "horizontal" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ScrollBar, { orientation: "vertical" }),
				orientation !== "vertical" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ScrollBar, { orientation: "horizontal" }),
				orientation === "both" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ScrollAreaCorner, {})
			]
		})
	});
});
ScrollArea$1.displayName = "ScrollArea";
var ScrollBar = (0, import_react.forwardRef)(({ className, orientation = "vertical", ...props }, ref) => {
	const isTouch = (0, import_react.useContext)(ScrollAreaContext);
	const shape = useShape();
	if (isTouch) return null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ScrollAreaScrollbar, {
		ref,
		orientation,
		"data-slot": "scroll-area-scrollbar",
		className: cn("group/scrollbar absolute z-20 flex touch-none select-none", "opacity-0 transition-opacity duration-120 ease-out delay-160", "data-[hovering]:duration-160 data-[scrolling]:duration-160", "data-[hovering]:opacity-100 data-[scrolling]:opacity-100", "data-[hovering]:delay-0 data-[scrolling]:delay-0", orientation === "vertical" && "top-0 right-0 h-full w-2.5", orientation === "horizontal" && "bottom-0 left-0 h-2.5 w-full flex-col", className),
		...props,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ScrollAreaThumb, {
			"data-slot": "scroll-area-thumb",
			className: cn("relative bg-[rgb(var(--overlay)/0.08)] transition-[background-color,width,height] duration-160 ease-in-out", "group-hover/scrollbar:bg-[rgb(var(--overlay)/0.12)] active:!bg-[rgb(var(--overlay)/0.16)]", shape.bg, orientation === "vertical" && "mx-auto my-1 w-1 -translate-x-0.5 h-[var(--scroll-area-thumb-height)] group-hover/scrollbar:w-1.5", orientation === "horizontal" && "my-auto mx-1 h-1 -translate-y-0.5 w-[var(--scroll-area-thumb-width)] group-hover/scrollbar:h-1.5")
		})
	});
});
ScrollBar.displayName = "ScrollBar";
var SurfaceContext = (0, import_react.createContext)(1);
function useSurface() {
	return (0, import_react.useContext)(SurfaceContext);
}
function SurfaceProvider({ value, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SurfaceContext.Provider, {
		value: Math.max(1, Math.min(8, value)),
		children
	});
}
var SURFACE_BG = {
	1: "bg-surface-1",
	2: "bg-surface-2",
	3: "bg-surface-3",
	4: "bg-surface-4",
	5: "bg-surface-5",
	6: "bg-surface-6",
	7: "bg-surface-7",
	8: "bg-surface-8"
};
var SURFACE_SHADOW = {
	1: "shadow-surface-1",
	2: "shadow-surface-2",
	3: "shadow-surface-3",
	4: "shadow-surface-4",
	5: "shadow-surface-5",
	6: "shadow-surface-6",
	7: "shadow-surface-7",
	8: "shadow-surface-8"
};
function surfaceClasses(bgLevel, shadowLevel = bgLevel) {
	const bg = Math.round(Math.max(1, Math.min(8, bgLevel)));
	const shadow = Math.round(Math.max(1, Math.min(8, shadowLevel)));
	return `${SURFACE_BG[bg]} ${SURFACE_SHADOW[shadow]}`;
}
var Elevated = (0, import_react.forwardRef)(({ offset, shadowLevel, className, children, ...props }, ref) => {
	const substrate = useSurface();
	const level = Math.min(substrate + offset, 8);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SurfaceProvider, {
		value: level,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			ref,
			className: cn(surfaceClasses(level, shadowLevel ?? level), className),
			...props,
			children
		})
	});
});
Elevated.displayName = "Elevated";
var repositoryStatuses = [
	"missing",
	"invalid",
	"repack-required",
	"blocked",
	"sync-required",
	"current"
];
function parseRepositorySnapshot(value) {
	const snapshot = requireRecord(value, "Repository snapshot");
	const status = snapshot.status;
	if (status !== "current" && status !== "attention") fail("Repository snapshot status is invalid.");
	const repositories = requireArray(snapshot.repositories, "Repository snapshot repositories").map(parseRepositoryObservation);
	return {
		status,
		catalogRoot: requireString(snapshot.catalogRoot, "Repository snapshot catalog root"),
		registryRevision: requireString(snapshot.registryRevision, "Repository snapshot registry revision"),
		repositories
	};
}
function parseRepositoryObservation(value) {
	const observation = requireRecord(value, "Repository observation");
	const status = observation.status;
	if (!isRepositoryStatus(status)) fail("Repository observation status is invalid.");
	const base = {
		id: requireString(observation.id, "Repository id"),
		root: requireString(observation.root, "Repository root"),
		issues: requireStringArray(observation.issues, "Repository issues")
	};
	if (status === "missing" || status === "invalid") return {
		...base,
		status
	};
	return {
		...base,
		status,
		capsuleSha256: requireString(observation.capsuleSha256, "Capsule hash"),
		treeSha256: requireString(observation.treeSha256, "Tree hash"),
		frameworkRevision: requireString(observation.frameworkRevision, "Framework revision"),
		registryRevision: requireString(observation.registryRevision, "Registry revision"),
		directComponents: requireStringArray(observation.directComponents, "Direct components"),
		resolvedComponents: requireStringArray(observation.resolvedComponents, "Resolved components"),
		activationCount: requireNonNegativeInteger(observation.activationCount, "Activation count"),
		generatedFileCount: requireNonNegativeInteger(observation.generatedFileCount, "Generated file count")
	};
}
function isRepositoryStatus(value) {
	return typeof value === "string" && repositoryStatuses.some((status) => status === value);
}
function requireRecord(value, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object.`);
	return value;
}
function requireArray(value, label) {
	if (!Array.isArray(value)) fail(`${label} must be an array.`);
	return value;
}
function requireString(value, label) {
	if (typeof value !== "string" || value.length === 0) fail(`${label} must be a non-empty string.`);
	return value;
}
function requireStringArray(value, label) {
	return requireArray(value, label).map((entry) => requireString(entry, label));
}
function requireNonNegativeInteger(value, label) {
	if (typeof value !== "number" || !Number.isInteger(value) || value < 0) fail(`${label} must be a non-negative integer.`);
	return value;
}
function fail(message) {
	throw new Error(message);
}
function consumeLaunchToken() {
	const launchUrl = new URL(window.location.href);
	const token = launchUrl.searchParams.get("token") ?? "";
	launchUrl.searchParams.delete("token");
	window.history.replaceState({}, "", launchUrl);
	if (token.length === 0) throw new Error("The repository UI launch token is missing.");
	return token;
}
async function requestSnapshot(token, path, init = {}) {
	const response = await fetch(path, {
		...init,
		headers: {
			Authorization: `Bearer ${token}`,
			...init.body === void 0 ? {} : { "Content-Type": "application/json" },
			...init.headers
		}
	});
	if (!response.ok) throw new Error((await response.text()).trim() || `Request failed with ${response.status}.`);
	const payload = await response.json();
	if (isRecord(payload) && "snapshot" in payload) return parseRepositorySnapshot(payload.snapshot);
	return parseRepositorySnapshot(payload);
}
async function requestWallpaper(token, signal) {
	const response = await fetch("/api/wallpaper", {
		headers: { Authorization: `Bearer ${token}` },
		signal
	});
	if (response.status === 404) return void 0;
	if (!response.ok) throw new Error((await response.text()).trim() || "Desktop wallpaper could not be loaded.");
	return URL.createObjectURL(await response.blob());
}
function isRecord(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
function RepositoryManager() {
	const [token, setToken] = (0, import_react.useState)();
	const [snapshot, setSnapshot] = (0, import_react.useState)();
	const [selectedId, setSelectedId] = (0, import_react.useState)();
	const [query, setQuery] = (0, import_react.useState)("");
	const [busy, setBusy] = (0, import_react.useState)();
	const [error, setError] = (0, import_react.useState)();
	const [wallpaperUrl, setWallpaperUrl] = (0, import_react.useState)();
	const [registerOpen, setRegisterOpen] = (0, import_react.useState)(false);
	(0, import_react.useEffect)(() => {
		try {
			setToken(consumeLaunchToken());
		} catch (cause) {
			setError(errorMessage(cause));
		}
	}, []);
	const preserveSelection = (0, import_react.useCallback)((next, preferred = selectedId) => {
		setSelectedId(next.repositories.some((repository) => repository.id === preferred) ? preferred : next.repositories[0]?.id);
	}, [selectedId]);
	const perform = (0, import_react.useCallback)(async (action, operation, preferredId) => {
		setBusy(action);
		setError(void 0);
		try {
			const next = await operation();
			setSnapshot(next);
			preserveSelection(next, preferredId?.(next) ?? selectedId);
		} catch (cause) {
			setError(errorMessage(cause));
		} finally {
			setBusy(void 0);
		}
	}, [preserveSelection]);
	(0, import_react.useEffect)(() => {
		if (token === void 0) return;
		perform("load", async () => await requestSnapshot(token, "/api/repositories"));
		const controller = new AbortController();
		requestWallpaper(token, controller.signal).then(setWallpaperUrl).catch((cause) => {
			if (!controller.signal.aborted) setError(errorMessage(cause));
		});
		return () => {
			controller.abort();
			setWallpaperUrl((current) => {
				if (current !== void 0) URL.revokeObjectURL(current);
			});
		};
	}, [token]);
	const selected = snapshot?.repositories.find((repository) => repository.id === selectedId);
	const filtered = (0, import_react.useMemo)(() => {
		const normalized = query.trim().toLocaleLowerCase();
		return snapshot?.repositories.filter((repository) => normalized.length === 0 || repository.root.toLocaleLowerCase().includes(normalized) || repository.status.includes(normalized)) ?? [];
	}, [query, snapshot]);
	const isBusy = busy !== void 0;
	async function register(event) {
		event.preventDefault();
		if (token === void 0) return;
		const form = event.currentTarget;
		const root = new FormData(form).get("root");
		if (typeof root !== "string" || root.trim().length === 0) return;
		await perform("register", async () => {
			const next = await requestSnapshot(token, "/api/repositories", {
				method: "POST",
				body: JSON.stringify({ root: root.trim() })
			});
			setRegisterOpen(false);
			form.reset();
			return next;
		}, (next) => next.repositories.find((repository) => repository.root === root.trim())?.id);
	}
	const refresh = () => {
		if (token !== void 0) perform("load", async () => await requestSnapshot(token, "/api/repositories"));
	};
	const syncAll = () => {
		if (token !== void 0) perform("sync-all", async () => await requestSnapshot(token, "/api/sync", { method: "POST" }));
	};
	const syncSelected = () => {
		if (token !== void 0 && selected !== void 0) perform("sync-selected", async () => await requestSnapshot(token, `/api/repositories/${selected.id}/sync`, { method: "POST" }));
	};
	const forgetSelected = () => {
		if (token === void 0 || selected === void 0 || !window.confirm(`Forget ${selected.root}? Repository files will not be changed.`)) return;
		perform("forget", async () => await requestSnapshot(token, `/api/repositories/${selected.id}`, { method: "DELETE" }));
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "app-frame",
		children: [
			wallpaperUrl !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
				className: "wallpaper",
				src: wallpaperUrl,
				alt: "",
				"aria-hidden": "true"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "wallpaper-scrim",
				"aria-hidden": "true"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "product-shell",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
						className: "navigation",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "brand",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "brand-mark",
									children: "A"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "ACF" })]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("nav", {
								"aria-label": "Primary navigation",
								className: "nav-items",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("a", {
									"aria-current": "page",
									href: "#repositories",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(FolderIcon, {}), "Repositories"]
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "nav-foot",
								children: [
									"Local registry",
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("br", {}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: snapshot?.catalogRoot ?? "Loading catalog" })
								]
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
						className: "workspace",
						id: "repositories",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
								className: "hero",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", { children: "Repositories" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Inspect and update every registered ACF capsule." })] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "hero-actions",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
											className: "icon-button",
											type: "button",
											onClick: refresh,
											disabled: isBusy,
											"aria-label": "Refresh repositories",
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RefreshIcon, {})
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
											className: "action-button secondary",
											type: "button",
											onClick: syncAll,
											disabled: isBusy || !snapshot?.repositories.length,
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SyncIcon, {}), "Sync all"]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
											className: "action-button primary",
											type: "button",
											"aria-expanded": registerOpen,
											onClick: () => setRegisterOpen((open) => !open),
											disabled: isBusy,
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PlusIcon, {}), "Register"]
										})
									]
								})]
							}),
							registerOpen && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Elevated, {
								offset: 2,
								className: "register-panel",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
									onSubmit: register,
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Absolute repository path" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
										autoFocus: true,
										name: "root",
										placeholder: "D:\\dev\\my-project",
										disabled: isBusy
									})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "register-actions",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
											type: "button",
											className: "action-button secondary",
											onClick: () => setRegisterOpen(false),
											children: "Cancel"
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
											type: "submit",
											className: "action-button primary",
											disabled: isBusy,
											children: "Register repository"
										})]
									})]
								})
							}),
							error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Elevated, {
								offset: 2,
								role: "alert",
								className: "error-message",
								children: error
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Elevated, {
								offset: 0,
								shadowLevel: 1,
								className: "registry-surface",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "registry-toolbar",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
										className: "search-field",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SearchIcon, {}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "sr-only",
												children: "Search repositories"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
												type: "search",
												placeholder: "Find a repository",
												value: query,
												onChange: (event) => setQuery(event.currentTarget.value)
											})
										]
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
										className: "repository-count",
										children: [snapshot?.repositories.length ?? 0, " registered"]
									})]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ScrollArea$1, {
									orientation: "horizontal",
									viewportClassName: "scroll-fade-x",
									className: "registry-scroll",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "Repository" }),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "Status" }),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "Capsule" }),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "Files" }),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "sr-only",
												children: "Open"
											}) })
										] }) }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: filtered.map((repository) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
											className: repository.id === selectedId ? "selected" : void 0,
											onClick: () => setSelectedId(repository.id),
											children: [
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
													className: "repository-choice",
													type: "button",
													onClick: () => setSelectedId(repository.id),
													children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: repositoryName(repository.root) }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: repository.root })]
												}) }),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Status, { status: repository.status }) }),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
													className: "mono",
													children: "capsuleSha256" in repository ? shortHash(repository.capsuleSha256) : "Unavailable"
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: "generatedFileCount" in repository ? repository.generatedFileCount : "-" }),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronIcon, { className: "chevron" }) })
											]
										}, repository.id)) })] }),
										snapshot === void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "table-state",
											children: "Loading repositories..."
										}),
										snapshot !== void 0 && filtered.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "table-state",
											children: snapshot.repositories.length === 0 ? "No repositories registered." : "No repositories match this search."
										})
									]
								})]
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Elevated, {
						offset: 3,
						shadowLevel: 5,
						className: "inspector",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ScrollArea$1, {
							orientation: "vertical",
							viewportClassName: "scroll-fade",
							className: "inspector-scroll",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Inspector, {
								repository: selected,
								snapshot,
								busy: isBusy,
								onSync: syncSelected,
								onForget: forgetSelected
							})
						})
					})
				]
			})
		]
	});
}
function Inspector({ repository, snapshot, busy, onSync, onForget }) {
	if (repository === void 0) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "inspector-empty",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(FolderIcon, {}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Select a repository to inspect its capsule and generated files." })]
	});
	const canSync = repository.status !== "missing" && repository.status !== "invalid" && repository.status !== "repack-required";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "inspector-heading",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "section-label",
				children: "Selected repository"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: repositoryName(repository.root) })] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Status, { status: repository.status })]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "inspector-path",
			children: repository.root
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "inspector-actions",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
				className: "action-button primary",
				type: "button",
				disabled: busy || !canSync,
				onClick: onSync,
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SyncIcon, {}), repository.status === "current" ? "Check sync" : "Sync"]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				className: "icon-button danger",
				type: "button",
				disabled: busy,
				onClick: onForget,
				"aria-label": "Forget repository",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TrashIcon, {})
			})]
		}),
		"registryRevision" in repository && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DefinitionList, { items: [
				["Capsule", shortHash(repository.capsuleSha256)],
				["Registry", repository.registryRevision],
				["Activation files", String(repository.activationCount)],
				["Generated files", String(repository.generatedFileCount)]
			] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(InspectorSection, {
				title: "Direct components",
				values: repository.directComponents
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(InspectorSection, {
				title: "Resolved components",
				values: repository.resolvedComponents
			})
		] }),
		repository.issues.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
			className: "inspector-section issues",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: "Issues" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { children: repository.issues.map((issue) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: issue }, issue)) })]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
			className: "inspector-section",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: "Catalog identity" }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mono breakable",
					children: repository.id
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mono breakable muted",
					children: snapshot?.catalogRoot
				})
			]
		})
	] });
}
function DefinitionList({ items }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dl", {
		className: "definition-list",
		children: items.map(([label, value]) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", { children: label }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", {
			title: value,
			children: value
		})] }, label))
	});
}
function InspectorSection({ title, values }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "inspector-section",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: title }), values.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "muted",
			children: "None recorded."
		}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "component-list",
			children: values.map((value) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: value }, value))
		})]
	});
}
function Status({ status }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
		className: `status status-${status}`,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {}), status.replaceAll("-", " ")]
	});
}
function repositoryName(root) {
	return root.split(/[\\/]/u).filter(Boolean).at(-1) ?? root;
}
function shortHash(value) {
	return `${value.slice(0, 10)}...`;
}
function errorMessage(value) {
	return value instanceof Error ? value.message : String(value);
}
//#endregion
export { RepositoryManager as component };
