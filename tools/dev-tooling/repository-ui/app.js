const launchUrl = new URL(window.location.href);
const token = launchUrl.searchParams.get("token") ?? "";
launchUrl.searchParams.delete("token");
window.history.replaceState({}, "", launchUrl);

const state = {
  snapshot: null,
  selectedId: null,
  query: "",
  busy: false,
  error: null,
};

const app = document.querySelector("#app");

function element(tag, properties = {}, children = []) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(properties)) {
    if (name === "className") node.className = value;
    else if (name === "text") node.textContent = value;
    else if (name.startsWith("on") && typeof value === "function") {
      node.addEventListener(name.slice(2).toLowerCase(), value);
    } else if (value !== false && value !== null && value !== undefined) {
      node.setAttribute(name, value === true ? "" : String(value));
    }
  }
  for (const child of children) node.append(child);
  return node;
}

function repositoryName(root) {
  return root.split(/[\\/]/u).filter(Boolean).at(-1) ?? root;
}

function shortHash(value) {
  return value ? `${value.slice(0, 10)}...` : "Unavailable";
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (!response.ok) throw new Error(await response.text());
  return await response.json();
}

async function load() {
  await perform(async () => {
    state.snapshot = await request("/api/repositories");
    preserveSelection();
  });
}

function preserveSelection(preferredId = state.selectedId) {
  const repositories = state.snapshot?.repositories ?? [];
  state.selectedId = repositories.some((repository) => repository.id === preferredId)
    ? preferredId
    : repositories[0]?.id ?? null;
}

async function perform(action) {
  state.busy = true;
  state.error = null;
  render();
  try {
    await action();
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
  } finally {
    state.busy = false;
    render();
  }
}

async function registerRepository(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const input = form.elements.namedItem("root");
  const root = input.value.trim();
  if (!root) return;
  await perform(async () => {
    state.snapshot = await request("/api/repositories", {
      method: "POST",
      body: JSON.stringify({ root }),
    });
    const registered = state.snapshot.repositories.find((repository) => repository.root === root);
    preserveSelection(registered?.id);
    form.reset();
  });
}

async function syncSelected() {
  if (state.selectedId === null) return;
  await perform(async () => {
    const response = await request(`/api/repositories/${state.selectedId}/sync`, { method: "POST" });
    state.snapshot = response.snapshot;
    preserveSelection();
  });
}

async function syncAll() {
  await perform(async () => {
    const response = await request("/api/sync", { method: "POST" });
    state.snapshot = response.snapshot;
    preserveSelection();
  });
}

async function forgetSelected() {
  const repository = state.snapshot?.repositories.find((entry) => entry.id === state.selectedId);
  if (!repository) return;
  if (!window.confirm(`Forget ${repository.root}? The repository files will not be changed.`)) return;
  await perform(async () => {
    state.snapshot = await request(`/api/repositories/${repository.id}`, { method: "DELETE" });
    preserveSelection(null);
  });
}

function render() {
  app.replaceChildren();
  if (state.snapshot === null && state.busy) {
    app.append(element("p", { className: "boot-state", text: "Loading repositories..." }));
    return;
  }
  if (state.snapshot === null) {
    app.append(errorBanner(state.error ?? "Repository registry could not be loaded."));
    return;
  }
  const shell = element("div", { className: "shell" }, [renderSidebar(), renderMain()]);
  app.append(shell);
}

function renderSidebar() {
  const search = element("input", {
    className: "search",
    type: "search",
    placeholder: "Find a repository",
    "aria-label": "Search repositories",
    value: state.query,
    oninput: (event) => {
      state.query = event.currentTarget.value;
      render();
      document.querySelector(".search")?.focus();
    },
  });
  search.value = state.query;
  const repositories = state.snapshot.repositories.filter((repository) => {
    const query = state.query.toLocaleLowerCase();
    return repository.root.toLocaleLowerCase().includes(query) || repository.status.includes(query);
  });
  const list = element("nav", { className: "repository-list", "aria-label": "Registered repositories" });
  if (repositories.length === 0) {
    list.append(element("p", {
      className: "empty",
      text: state.snapshot.repositories.length === 0 ? "No repositories registered." : "No matching repositories.",
    }));
  } else {
    for (const repository of repositories) list.append(repositoryRow(repository));
  }
  const form = element("form", { className: "register-form", onsubmit: registerRepository }, [
    element("input", {
      className: "path-input",
      name: "root",
      placeholder: "Absolute repository path",
      "aria-label": "Repository path",
      disabled: state.busy,
    }),
    element("button", {
      className: "button primary",
      type: "submit",
      text: "Register repository",
      disabled: state.busy,
    }),
  ]);
  return element("aside", { className: "sidebar" }, [
    element("header", { className: "sidebar-header" }, [
      element("div", { className: "identity" }, [
        element("span", { className: "mark", text: "ACF", "aria-hidden": "true" }),
        element("div", {}, [
          element("h1", { text: "Repositories" }),
          element("p", { className: "eyeline", text: `registry ${state.snapshot.registryRevision}` }),
        ]),
      ]),
      search,
      element("div", { className: "toolbar" }, [
        element("button", { className: "button", type: "button", text: "Refresh", disabled: state.busy, onclick: load }),
        element("button", { className: "button", type: "button", text: "Sync all", disabled: state.busy || state.snapshot.repositories.length === 0, onclick: syncAll }),
      ]),
    ]),
    list,
    element("footer", { className: "sidebar-footer" }, [form]),
  ]);
}

function repositoryRow(repository) {
  return element("button", {
    className: "repo-row",
    type: "button",
    "aria-current": repository.id === state.selectedId ? "true" : "false",
    onclick: () => { state.selectedId = repository.id; render(); },
  }, [
    element("span", { className: "repo-copy" }, [
      element("span", { className: "repo-name", text: repositoryName(repository.root) }),
      element("span", { className: "repo-path", text: repository.root, title: repository.root }),
    ]),
    status(repository.status),
  ]);
}

function status(value) {
  return element("span", {
    className: `status status-${value}`,
    text: value.replaceAll("-", " "),
  });
}

function renderMain() {
  const repository = state.snapshot.repositories.find((entry) => entry.id === state.selectedId);
  if (!repository) {
    return element("main", { className: "main empty-state" }, [
      element("p", {
        text: "Register an ACF repository to see its capsule, generated projections, and issues here.",
      }),
    ]);
  }
  const actions = element("div", { className: "toolbar" }, [
    element("button", {
      className: "button primary",
      type: "button",
      text: repository.status === "current" ? "Check sync" : "Sync repository",
      disabled: state.busy || repository.status === "missing" || repository.status === "invalid" || repository.status === "repack-required",
      onclick: syncSelected,
    }),
    element("button", {
      className: "button danger",
      type: "button",
      text: "Forget",
      disabled: state.busy,
      onclick: forgetSelected,
    }),
  ]);
  const main = element("main", { className: "main" }, [
    element("header", { className: "main-header" }, [
      element("div", {}, [
        element("h2", { text: repositoryName(repository.root) }),
        element("p", { className: "path", text: repository.root }),
      ]),
      actions,
    ]),
  ]);
  const content = element("div", { className: "content" });
  if (state.error) content.append(errorBanner(state.error));
  content.append(element("div", { className: "section" }, [status(repository.status)]));
  if ("registryRevision" in repository) {
    content.append(summary(repository));
    content.append(section("Direct components", repository.directComponents.length === 0
      ? [element("p", { className: "empty", text: "No direct components recorded." })]
      : [componentList(repository.directComponents)]));
    content.append(section("Resolved components", [componentList(repository.resolvedComponents)]));
  }
  if (repository.issues.length > 0) {
    const issues = element("ul", { className: "issues" });
    for (const issue of repository.issues) issues.append(element("li", { text: issue }));
    content.append(section("Issues", [issues]));
  }
  content.append(section("Catalog identity", [
    element("p", { className: "meta", text: repository.id }),
    element("p", { className: "meta", text: state.snapshot.catalogRoot }),
  ]));
  main.append(content);
  return main;
}

function summary(repository) {
  const values = [
    ["Capsule", shortHash(repository.capsuleSha256)],
    ["Registry", repository.registryRevision],
    ["Activation files", String(repository.activationCount)],
    ["Generated files", String(repository.generatedFileCount)],
  ];
  const list = element("dl", { className: "summary" });
  for (const [label, value] of values) {
    list.append(element("div", { className: "metric" }, [
      element("dt", { text: label }),
      element("dd", { text: value, title: value }),
    ]));
  }
  return list;
}

function section(title, children) {
  return element("section", { className: "section" }, [
    element("h3", { text: title }),
    ...children,
  ]);
}

function componentList(components) {
  const list = element("div", { className: "component-list" });
  for (const component of components) {
    list.append(element("span", { className: "component", text: component }));
  }
  return list;
}

function errorBanner(message) {
  return element("div", { className: "error-banner", role: "alert", text: message });
}

void load();
