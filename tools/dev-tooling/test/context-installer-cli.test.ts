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
  assert.match(CONTEXT_INSTALLER_HELP, /inspect, diff, and doctor are read-only/u);
  assert.match(CONTEXT_INSTALLER_HELP, /token-protected\s+loopback UI/u);
  assert.match(CONTEXT_INSTALLER_HELP, /--overwrite replaces only the\s+selected registry-owned scopes/u);
  assert.match(CONTEXT_INSTALLER_HELP, /never pushes or deploys/u);
});
