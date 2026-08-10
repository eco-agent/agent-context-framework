# T3 Code live localhost reference

On 2026-08-10 the official npm package installed by `npx t3` was T3 Code `0.0.32`. npm's Windows exec shim exited with `The system cannot find the path specified`, so the exact binary materialized in npm's `_npx` installation was launched with:

```powershell
t3 start --no-browser --host 127.0.0.1 --port 3775 D:\dev\agent-context-framework-setup-ui
```

Its pairing URL opened successfully in the in-app browser. The authenticated local route `http://127.0.0.1:3775/settings/general` showed:

- a roughly 255-pixel dark sidebar;
- embedded settings search with a `/` key hint;
- a quiet filled treatment for the selected navigation row;
- a small `Settings` top bar with a restrained trailing action;
- one uninterrupted scrolling content surface;
- open settings rows without a containing card or bordered list.

The copied stylesheet was adjusted to remove the initial bordered component-list container and preserve the live open-row topology.

The pinned root `AGENTS.md` explicitly says T3 Code is open at the core and that a large number of users run forks. That confirms direct adaptation is consistent with the upstream project's stated development intent. The required legal footprint remains the MIT notice copied to `tools/setup-ui/LICENSE.t3code-upstream`.

The T3 Code reference server and the Agent Context smoke server were stopped after inspection by their exact verified PIDs. No server remains listening on the test ports.
