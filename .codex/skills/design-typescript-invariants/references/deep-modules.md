# Deep modules

A deep module hides substantial complexity behind a small interface. Prefer depth over layers of wrappers, helpers, adapters, and forwarding types.

## Boundary tests

- Delete the proposed module mentally. If its complexity moves into callers, the boundary has value. If only forwarding code disappears, remove the module.
- Treat the public interface as the test surface. When tests are required, assert observable outcomes through that interface rather than internal state.
- One adapter is a hypothetical seam. Add a port when at least two adapters are justified, usually production and test.
- Keep internal seams private. Do not expose an implementation seam because a test uses it.
- Replace shallow paths and their tests when the deeper module owns the behavior. Do not layer the new boundary beside obsolete representations.

## Dependency placement

- Keep in-process dependencies inside the module.
- Wrap out-of-process dependencies owned by the project behind the module interface.
- Inject true external services through a narrow port.
- Keep deployment boundaries from dictating the domain interface.

Adapted from `engineering/codebase-design` in `mattpocock/skills` at revision `2ab958093e83e0ec752e6c1c5932da465bf23e0c` under the MIT license.
