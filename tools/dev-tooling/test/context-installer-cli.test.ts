import assert from "node:assert/strict";
import test from "node:test";

import {
  CONTEXT_INSTALLER_HELP,
  parseContextInstallerArguments,
} from "../src/context-installer-cli.js";

test("CLI help is explicit and repository-independent", () => {
  assert.deepEqual(parseContextInstallerArguments(["--help"], "D:\\project"), {
    command: "help",
    projectRoot: "D:\\project",
    component: null,
    output: "text",
  });
  assert.equal(parseContextInstallerArguments(["add", "core", "-h"], "D:\\project").command, "help");
  assert.match(CONTEXT_INSTALLER_HELP, /inspect, plan, diff, and doctor are read-only/u);
  assert.match(CONTEXT_INSTALLER_HELP, /token-protected\s+loopback UI/u);
  assert.match(CONTEXT_INSTALLER_HELP, /--overwrite replaces only the\s+selected registry-owned scopes/u);
  assert.match(CONTEXT_INSTALLER_HELP, /never pushes or deploys/u);
});

test("CLI plan accepts zero or many unique component additions as read-only JSON", () => {
  assert.deepEqual(
    parseContextInstallerArguments(["plan", "codex-runtime", "repository-policy", "--json"], "D:\\project"),
    {
      command: "plan",
      projectRoot: "D:\\project",
      component: null,
      components: ["codex-runtime", "repository-policy"],
      output: "json",
    },
  );
  assert.deepEqual(parseContextInstallerArguments(["plan"], "D:\\project"), {
    command: "plan",
    projectRoot: "D:\\project",
    component: null,
    components: [],
    output: "text",
  });
  assert.throws(
    () => parseContextInstallerArguments(["plan", "core", "core"], "D:\\project"),
    /duplicate component core/u,
  );
});

test("CLI setup can close after a successful installation response", () => {
  assert.deepEqual(
    parseContextInstallerArguments(["setup", "--no-open", "--exit-after-install"], "D:\\project"),
    {
      command: "setup",
      projectRoot: "D:\\project",
      component: null,
      output: "text",
      port: 0,
      openBrowser: false,
      exitAfterInstall: true,
    },
  );
  assert.throws(
    () => parseContextInstallerArguments(["inspect", "--exit-after-install"], "D:\\project"),
    /valid only with agent-context setup/u,
  );
  assert.match(CONTEXT_INSTALLER_HELP, /closes setup after a successful installation response/u);
});
