import assert from "node:assert/strict";
import test from "node:test";
import {
  collectDependencyFacts,
  parsePackageSpec,
} from "../src/dependency-facts.js";

test("parses only exact npm package specifications", () => {
  assert.deepEqual(parsePackageSpec("jose@6.2.4"), {
    name: "jose",
    version: "6.2.4",
  });
  assert.deepEqual(parsePackageSpec("@effect/sql-pg@0.53.0"), {
    name: "@effect/sql-pg",
    version: "0.53.0",
  });
  assert.throws(() => parsePackageSpec("jose@latest"), /exact npm name and version/u);
  assert.throws(() => parsePackageSpec("jose"), /exact form/u);
});

test("decodes registry facts without inventing adoption decisions", async () => {
  const facts = await collectDependencyFacts(
    "jose@6.2.4",
    async () =>
      new Response(
        JSON.stringify({
          name: "jose",
          version: "6.2.4",
          license: "MIT",
          gitHead: "41dda37692f601ee8c7fd3d7118f06e957340a5b",
          repository: {
            type: "git",
            url: "git+https://github.com/panva/jose.git",
          },
          engines: { node: ">=20" },
          dependencies: {},
          dist: {
            integrity: "sha512-example",
            tarball: "https://registry.npmjs.org/jose/-/jose-6.2.4.tgz",
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
  );
  assert.equal(facts.name, "jose");
  assert.equal(facts.integrity, "sha512-example");
  assert.deepEqual(facts.source, {
    kind: "revision",
    repository: "https://github.com/panva/jose.git",
    gitHead: "41dda37692f601ee8c7fd3d7118f06e957340a5b",
    revisionUrl:
      "https://github.com/panva/jose/tree/41dda37692f601ee8c7fd3d7118f06e957340a5b",
  });
  assert.equal("purpose" in facts, false);
});
