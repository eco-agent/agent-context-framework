# Headless Interface Evaluation: assistant turns

- Conversation ID: `6a855577-30f0-83ea-b649-a225ac1561d1`
- Source title: `Headless Interface Evaluation`
- Assistant turns: 4
- Order: oldest to newest

## Assistant turn 1

- Turn ID: `6079bfe6-3d6b-434c-9a47-61c2262130af`
- Message ID: `c9914e98-d07f-4466-babd-54602016cf87`
- Timestamp: `2026-08-19T07:08:59.504Z`

Yes. More specifically, you’re describing a **runtime visual credit-assignment system**: give every interface boundary an identity, observe it under controlled states, score it, then use that score to drive local code regeneration while keeping the application alive through HMR.

I think this fits extremely well with the reasoning-pressure work we were discussing.

### The architecture

```text
Source code
    │
    ▼
Compiler instrumentation
    │
    ├── DefinitionID
    ├── source location
    ├── component
    └── parent/child relationships
    │
    ▼
Vite dev server
    │
    ▼
Headless Chromium
    │
    ▼
Runtime boundary graph
    │
    ├── geometry
    ├── hierarchy
    ├── interaction states
    └── rendered instances
    │
    ▼
Screenshot corpus
    │
    ▼
Evaluator
    │
    ├── boundary score
    ├── contextual score
    └── critique
    │
    ▼
Agent edits source
    │
    ▼
Vite HMR / React Fast Refresh
    │
    ▼
Only affected boundaries re-evaluated
```

Almost every primitive already exists. Playwright can run Chromium headlessly, hover/focus elements, and capture screenshots clipped to individual elements. Chrome's DevTools Protocol exposes the DOM, box models and full DOM/layout snapshots; its Overlay domain can highlight nodes; and `CSS.forcePseudoState` can force CSS pseudo-classes on particular nodes. citeturn314580search13turn314580search2turn597408search2turn314580search0

The part we'd build is the **identity and orchestration layer**.

### Don't ID DOM nodes

I'd give every component two identities:

```ts
type BoundaryDefinition = {
  id: DefinitionID
  module: string
  symbol: string
  sourceSpan: SourceSpan
}

type BoundaryInstance = {
  id: InstanceID
  definitionId: DefinitionID

  parent?: InstanceID
  children: InstanceID[]

  rects: DOMRect[]
}
```

`DefinitionID` means **this piece of source code**.

`InstanceID` means **this particular rendering of that piece of source code**.

That distinction matters immediately:

```tsx
{products.map(product =>
  <ProductCard product={product} />
)}
```

There's one `ProductCard` definition but 50 rendered instances.

And components don't necessarily correspond 1:1 with DOM elements. React explicitly has its own render tree, distinct from the browser DOM structure. citeturn314580search28

So I'd instrument JSX at compilation time:

```text
ProductCard
    Definition UI-1241
        │
        ├── instance UI-1241:a
        ├── instance UI-1241:b
        └── instance UI-1241:c
```

The browser harness then associates each instance with one or more DOM rectangles.

For:

```tsx
function Toolbar() {
  return (
    <>
      <BackButton />
      <Title />
      <Menu />
    </>
  )
}
```

there's no `<Toolbar>` DOM box. That's fine:

```text
Toolbar UI-17
 ├─ rect(back)
 ├─ rect(title)
 └─ rect(menu)
```

I'd actually draw **multiple rectangles**, rather than inventing one giant bounding box that may encompass unrelated pixels.

### State becomes another dimension

A capture isn't:

```text
UI-1241.png
```

It's something closer to:

```text
Capture {
  boundary: UI-1241:a
  viewport: desktop
  state: hover
  route: /products
  fixture: default-products
}
```

giving:

```text
UI-1241:a
├─ default
├─ hover
├─ focus
├─ active
├─ disabled
└─ ...
```

But I wouldn't generate the Cartesian product of every possible state.

Discover relevant states from the interface.

A button might get:

```text
default
hover
keyboard-focus
pressed
disabled
```

A dialog:

```text
closed
open
open + focused-control
```

A text input:

```text
empty
hover
focus
populated
invalid
disabled
```

And there's an important distinction between **CSS pseudo-state** and **application state**.

`CSS.forcePseudoState` can make CSS behave as though `:hover` applies. citeturn314580search0

But if this happens:

```tsx
onMouseEnter={() => setPreview(true)}
```

forcing CSS isn't sufficient.

So use real Playwright interactions wherever possible:

```text
mouse move
tab
focus
click
type
keyboard
pointer down
```

and CDP pseudo-state forcing for states where you specifically want CSS isolation.

### Then value each observation

Now your earlier reasoning-pressure idea becomes much more interesting.

Instead of assigning a value only to source:

\[
V(i)
\]

we can value an **interface instance under state**:

\[
V(i,s)
\]

and bound it:

\[
V(i,s)=\sigma(R(i,s))
\]

For example:

\[
R =
w_lL +
w_pP +
w_gG +
w_cC -
w_eE
\]

where loosely:

```text
L = local quality
P = relationship to parent
G = relationship to global interface
C = consistency with siblings/system
E = detected defects/regressions
```

Then:

```text
Button                          .91
├── default                     .96
├── hover                       .92
├── focus                       .63  ← suspicious
└── pressed                     .94
```

Now the agent doesn't receive:

> Improve this page.

It receives:

```text
Boundary: UI-1241
State: keyboard-focus

Value: 0.63

Parent:
  CheckoutActions       0.91

Siblings:
  CancelButton          0.89
  HelpButton            0.93

Page:
  Checkout              0.90

Relevant source:
  src/checkout/SubmitButton.tsx

Visual observations:
  [local crop]
  [parent crop]
  [page crop]
```

That is dramatically less ambiguous credit assignment.

### And yes, HMR closes the loop

There's one correction I'd make to the wording:

> Dynamically regenerate **source corresponding to an area**, then let HMR update the rendered area.

HMR itself operates on modules, not arbitrary rectangles.

The identity graph gives us:

```text
visual boundary
    ↓
component instance
    ↓
component definition
    ↓
source span
    ↓
module
```

so the agent changes the relevant source.

Vite already computes affected modules when a file changes, allows plugins to narrow affected modules, and exposes `vite:afterUpdate` after an HMR update is applied. Its React integration supports Fast Refresh so updates can preserve application state when the component remains refresh-compatible. citeturn827629search5turn827629search0turn597408search1

That gives us:

```text
agent edits UI-1241
       ↓
SubmitButton.tsx changes
       ↓
Vite HMR
       ↓
runtime says affected:
    UI-1241:a
    UI-1241:b
       ↓
recapture only those instances
       ↓
Vbefore = .63
Vafter  = .87
       ↓
accept/reject/iterate
```

You could even re-evaluate its ancestors:

```text
changed boundary
      ↑
parent
      ↑
section
      ↑
page
```

with diminishing evaluation pressure as distance increases.

Something like:

\[
P(d)=e^{-\lambda d}
\]

so changing a button causes:

```text
button       1.00 evaluation pressure
form         0.70
panel        0.49
page         0.34
app          0.24
```

rather than blindly re-running the entire visual analysis.

---

The genuinely hard problems are **stable identity across large rewrites, repeated component instances, portals/fragments, interaction-state discovery, and controlling nondeterminism**. Screenshotting, headless rendering, pseudo-states and HMR are comparatively solved infrastructure. Playwright even notes that visual output can vary with OS, browser version, hardware and environment, so the harness would want a tightly controlled Chromium environment. citeturn597408search14

For a first implementation, I wouldn't attempt framework independence. I'd build:

```text
React
+ Vite
+ custom Oxc/Vite JSX instrumentation
+ Playwright
+ raw CDP
+ boundary registry
+ evaluator
+ agent edit broker
```

That's enough to create a system where an agent can effectively **look at a running application as a recursively decomposable visual structure, decide exactly where quality is being lost, edit that structure, and immediately observe the consequences**.

That feels considerably more powerful than conventional screenshot-based agent evaluation because the screenshot stops being one giant undifferentiated reward signal.

---

## Assistant turn 2

- Turn ID: `5e370524-5054-44e9-af86-7c9669b77b77`
- Message ID: `30a5ce31-b7fd-41ef-acdd-c129a3a88731`
- Timestamp: `2026-08-19T07:28:20.888Z`

My interpretation: this file is the **mathematical core**. For TanStack Start + Vite+, the next job is to make the running application continuously produce this graph, then use the graph to choose **how much UI an agent should see and reason about at once**.

The implementation is sound. I compiled it under strict TypeScript and ran the example; both decomposition invariants pass. Your `introducedInteraction` decomposition is particularly useful because every state-weighted pair gets attributed exactly once to the composition boundary where it enters. fileciteturn0file0L321-L359 fileciteturn0file0L493-L550

There is one place I'd change before building upward.

## Don't reduce couplings to a number yet

Currently:

```ts
total += from.states * to.states * weight
```

and ultimately:

```ts
explicitCouplings: number
```

fileciteturn0file0L363-L393

That's correct for reporting pressure, but **lossy for reasoning-resolution selection**.

The partitioner needs to know:

```text
A ──layout──────► B
A ──:has────────► Parent
C ──responsive──► D
```

because partition quality depends on which edges cross the proposed boundary.

I'd therefore make coupling analysis return both:

```ts
interface CouplingMetric extends Coupling {
  rawInteraction: number
}

interface CouplingAnalysis {
  edges: CouplingMetric[]
  total: number
}
```

Your current `total` remains a derived metric.

---

# Optimal resolution is a graph-partition problem

A useful reasoning context shouldn't correspond to an arbitrary subtree depth.

Let a partition be:

\[
\Pi=\{C_1,C_2,\ldots,C_k\}
\]

where each \(C_i\) is a region an agent can reason about independently.

For each region, calculate:

\[
R_{\text{local}}(C)
\]

from the same interaction mathematics you already have.

But then calculate the relationships crossing its boundary:

\[
R_{\text{boundary}}(C)
=
\sum_{\substack{e=(u,v)\\u\in C,v\notin C}}
q(u)q(v)w_e
\]

Now the effective reasoning requirement becomes approximately:

\[
R_C
=
R_{\text{local}}(C)
+
R_{\text{boundary}}(C)
\]

and:

\[
P_C=P(R_C)
\]

The obvious objective isn't minimizing total pressure.

That would encourage pathological fragmentation.

What we care about is something closer to:

\[
\boxed{
J(\Pi)=
\max_{C\in\Pi}P_C
+
\lambda B(\Pi)
+
\mu |\Pi|
}
\]

where:

- `max P_C` = worst simultaneous reasoning burden
- `B(Π)` = information that must cross partitions
- `|Π|` = context-switching/coordination cost
- `λ`, `μ` = penalties

Now the optimizer has competing pressures:

```text
one context
────────────────────────
few boundaries
huge reasoning pressure


many tiny contexts
────────────────────────
tiny local pressure
huge coordination pressure
```

The optimum sits somewhere between them.

That's your **optimal reasoning resolution**.

---

## But there's a deeper abstraction available

I don't think a collapsed subtree should expose its full `stateMass`.

Suppose:

```text
Form subtree
stateMass = 47
```

Internally it might contain hundreds of meaningful combinations.

From outside, however, perhaps only these outcomes matter:

```text
normal
invalid
submitting
success
```

Its **external state mass is 4**, not 47.

That's the mathematical representation of abstraction.

Define:

\[
O(C)
\]

as the set of materially distinct observations a subtree can expose across its boundary.

Then:

\[
\boxed{b(C)=|O(C)|}
\]

is its **boundary mass**.

When expanded:

\[
Q(C)=47
\]

When collapsed:

\[
b(C)=4
\]

So a parent shouldn't reason about every internal state combination. It reasons about the child's **observable contract**.

That's where your screenshot harness and the pressure model suddenly become one system.

## Screenshots can discover \(b(C)\)

Run the component through reachable states:

```text
Form
├─ empty
├─ field focused
├─ invalid name
├─ checkbox hover
├─ select open
├─ submitting
├─ submitted
└─ ...
```

Capture the boundary plus externally affected regions.

Then cluster states that are observationally equivalent.

Perhaps:

```text
empty
field focused
checkbox hover
select closed
         ↓
 externally equivalent
         ↓
NORMAL
```

while:

```text
invalid name → INVALID
submitting   → BUSY
submitted    → SUCCESS
```

You've empirically discovered:

\[
b(\text{Form})=4
\]

rather than assuming its abstraction cost.

This is extremely interesting because it gives us a measurable definition of a **good component boundary**:

\[
\boxed{
\text{Compression}(C)=
\frac{Q(C)}{b(C)}
}
\]

A component with:

```text
internal mass = 80
boundary mass = 3
```

is an excellent abstraction.

A component with:

```text
internal mass = 80
boundary mass = 67
```

barely contains its complexity at all.

That metric could become more useful than component size.

---

# This changes how I'd build the tool

I'd separate it into four layers:

```text
@reasoning-pressure/core
    current mathematics
    graph
    partitioning
    optimization

@reasoning-pressure/vite
    source instrumentation
    DefinitionID assignment
    source maps
    module graph
    HMR invalidation

@reasoning-pressure/react
    runtime component instances
    component hierarchy
    DOM geometry projection
    state discovery

@reasoning-pressure/runner
    Chromium/Playwright
    interaction exploration
    screenshots
    visual scoring
    coupling discovery
```

Then a thin:

```text
@reasoning-pressure/tanstack-start
```

adds route semantics.

TanStack Start is particularly convenient here because its Router remains the application-level route tree while Start adds the server/rendering layer. That gives us a useful semantic hierarchy above the component hierarchy: route → layout → component → element. citeturn935873search5turn935873search8

And Vite+ doesn't fight this architecture: `vp dev` currently runs the standard Vite development server and continues to use normal `vite.config.ts` plugins. citeturn541253search0turn541253search5

So:

```ts
export default defineConfig({
  plugins: [
    tanstackStart(),

    reasoningPressure({
      instrumentation: true,
      runtime: true,
    }),

    viteReact(),
  ],
})
```

is roughly the shape I'd want. TanStack's current Vite setup similarly puts its Start plugin before the React plugin. citeturn935873search1

---

## HMR should become part of the graph

A source edit gives:

```text
changed module
      │
      ▼
changed DefinitionIDs
      │
      ▼
runtime InstanceIDs
      │
      ▼
directly affected regions
      │
      ├── containment propagation
      └── coupling propagation
              │
              ▼
        recapture frontier
```

Vite's newer environment-aware `hotUpdate` hook is especially relevant because TanStack Start has browser/server concerns rather than one homogeneous module graph. Vite invokes HMR processing per environment, so the harness can distinguish a browser component update from a server-side change that indirectly changes rendered output. citeturn541253search2turn541253search13

That means don't simply do:

```text
file changed → screenshot page
```

Do:

```text
file changed
  ↓
definitions invalidated
  ↓
instances invalidated
  ↓
walk causal graph
  ↓
smallest sufficient reasoning frontier
  ↓
recapture
```

---

# And I'd discover many couplings dynamically

Static analysis can tell us:

```css
.card:has(input:checked)
```

is a selector dependency.

But determining the actual blast radius of:

```text
intrinsic sizing
grid reflow
container queries
font changes
scrollbars
responsive composition
```

statically gets ugly.

The browser can answer it experimentally.

Intervene on `A`:

```text
A:hover
A:focus
A value change
A width change
viewport change affecting A
```

then record which other boundary observations change:

```text
A changed
├── B geometry changed      → layout coupling
├── Parent style changed    → :has coupling
├── C disappeared           → responsive coupling
└── D unchanged
```

You begin constructing a **causal UI graph**, not merely inferring one from CSS.

Then `weight` stops being arbitrary too.

It can eventually incorporate observed:

```text
effect frequency
pixel delta
geometry delta
state reachability
number of affected descendants
evaluation-score delta
```

---

So I'd now think of the complete system as:

\[
\boxed{
\text{Source}
\rightarrow
\text{Runtime Tree}
\rightarrow
\text{State Exploration}
\rightarrow
\text{Causal Graph}
\rightarrow
\text{Pressure}
\rightarrow
\text{Optimal Partition}
\rightarrow
\text{Agent Context}
\rightarrow
\text{Edit}
\rightarrow
\text{HMR}
\rightarrow
\text{Re-evaluation}
}
\]

The really powerful addition is **boundary mass**. Your current model tells us where complexity enters. Boundary mass tells us **where that complexity successfully stops propagating**.

Once we have both, an agent doesn't merely know that `Form` has pressure `86`. It can know:

> `Form` has very high internal pressure, but compresses 42 internal states into 3 externally relevant states. Stay inside it. Don't load the page.

Or:

> `GridItem` has only moderate internal pressure, but 74% of its interaction mass crosses into sibling layout and container-query edges. Reason about the grid, not the item.

That's the point where “zoom in / zoom out” becomes something we can actually calculate rather than prompt.

---

## Assistant turn 3

- Turn ID: `f0054599-1076-4db5-b425-679c16bd79d8`
- Message ID: `5ce7dc51-0901-427d-a882-b1aba616402e`
- Timestamp: `2026-08-19T07:56:23.735Z`

Yes. **I’d build it.** I found projects covering nearly every primitive, but not the combination you’re aiming at: **component-granular visual observation + automatic state exploration + relational-pressure attribution + selective re-evaluation after HMR.**

The landscape looks roughly like this:

| Project | Already solves | Missing from your idea |
|---|---|---|
| **Domscribe** | Stable build-time IDs, source↔DOM mapping, React Fiber state/props, HMR-stable identity | Automated boundary screenshots, state exploration, scoring, reasoning-pressure/partition model |
| **agent-browser** | Headless browser, screenshots, React tree, props/hooks/state/source, interaction | Source-stable visual boundaries, recursive capture/evaluation model |
| **agent-react-devtools** | React hierarchy, component inspection, profiling, Vite integration | Visual evaluation entirely |
| **Storybook** | Browser rendering, authored interaction states, visual tests, watch mode | Automatic discovery; whole-running-app hierarchy; agent reasoning scope |
| **Frontman / Agentation** | UI→source targeting and frontend editing; Frontman does hot reload | Mostly human-selected targets, not autonomous decomposition/evaluation |
| **frontend-visualqa** | Screenshot-driven visual verification for coding agents | Structural hierarchy/credit assignment |

Domscribe is *very* close to the infrastructure we independently arrived at: its Vite/build plugin assigns deterministic IDs through AST instrumentation and keeps them stable through HMR/Fast Refresh, then maps them back to source and runtime component state. citeturn956747view0 Vercel's `agent-browser` now has full React-tree inspection, Fiber source/state inspection and screenshots, and explicitly supports TanStack Start. citeturn956747view3 Callstack's agent React DevTools similarly exposes hierarchy/subtrees and ships a dev-only Vite plugin. citeturn956747view4

So **don't spend the weekend inventing browser automation or React introspection.**

Your actual contribution is this:

```text
existing tools

source ↔ component ↔ DOM ↔ screenshot
                    +
                 interaction
                    ↓

your layer

runtime interface graph
        ↓
boundary/state captures
        ↓
pressure attribution
        ↓
reasoning resolution
        ↓
affected frontier
        ↓
HMR re-evaluation
```

Your existing core already gives you the distinctive part: per-node introduced interaction, hierarchical/isolation pressure and explicit non-tree coupling pressure rather than one flat complexity score. fileciteturn0file0L77-L128 fileciteturn0file0L149-L190

### The weekend-sized project

Don't build the agent regeneration loop yet.

Build a CLI:

```bash
npx pressure-ui dev
```

against TanStack Start + Vite which emits:

```text
.pressure/
├─ graph.json
├─ captures/
│  ├─ root/
│  │  └─ default.png
│  ├─ header/
│  │  ├─ default.png
│  │  └─ search-focus.png
│  ├─ form/
│  │  ├─ default.png
│  │  └─ invalid.png
│  └─ submit-button/
│     ├─ default.png
│     ├─ hover.png
│     └─ focus.png
└─ analysis.json
```

with something like:

```json
{
  "id": "submit-button",
  "source": "src/components/SubmitButton.tsx:14",
  "parent": "form",
  "states": ["default", "hover", "focus"],
  "rect": {},
  "pressure": {
    "introduced": 18.2,
    "isolation": 41.7,
    "hierarchical": 56.3
  },
  "captures": {}
}
```

Then watch Vite.

```text
SubmitButton.tsx changes
        ↓
HMR
        ↓
identify affected IDs
        ↓
capture changed boundary
        ↓
capture coupling frontier
        ↓
recalculate pressure
```

That's an excellent weekend MVP.

### The killer demo

Don't demo it on a giant application.

Make one TanStack Start page:

```text
Page
├─ Header
│  ├─ Search
│  └─ AccountMenu
├─ Sidebar
└─ Content
   └─ Form
      ├─ Input
      ├─ Select
      ├─ Checkbox
      └─ Submit
```

Then run:

```bash
pressure-ui inspect
```

and produce an HTML report where hovering the hierarchy highlights corresponding numbered boundaries and lets you flip:

```text
default | hover | focus | active
```

for every captured component.

Show:

```text
Form
pressure: 71

├─ Input          27
├─ Select         31
├─ Checkbox       42
└─ Submit         36

Largest introduced pressure:
Checkbox → Form

Reason:
:has() + validation dependency
```

Then edit the checkbox CSS.

HMR fires and **only the affected captures refresh**.

That demo communicates the project immediately.

### Where I'd position it

Don't market it as another:

> AI coding agent with eyes.

That category is getting crowded: Domscribe, Agentation, Frontman, visual-QA tools, React Grab and browser-agent infrastructure are all attacking variants of source/runtime grounding. citeturn956747view1turn956747view2turn159138view4turn823089search0

Position it as something closer to:

> **Visual observability for coding agents.**

or even:

> **A runtime interface graph for agentic frontend development.**

The conceptual difference is strong.

Existing systems mostly answer:

> **What am I looking at, and what source produced it?**

Yours answers:

> **What must be considered together, at what resolution, and what needs re-evaluation after this changes?**

I couldn't find an existing project doing that combination in my search. There are recent research projects on hierarchical web-agent evaluation and visual/code feedback, which suggests the underlying problem is active rather than already settled. citeturn823089academia47turn823089academia45

**MIT it and put it on GitHub.** Keep `reasoning-pressure` as a dependency-free core, make TanStack Start/Vite the opinionated first runtime, and stop the first release at **observe → decompose → capture → score → invalidate**.

Agent-controlled regeneration can be `0.2`. That's where this goes from a neat DevTool to the feedback substrate we've actually been thinking about.

---

## Assistant turn 4

- Turn ID: `b8e541c1-e266-472a-96a9-0a3a0d4d5bd2`
- Message ID: `3fbbc7de-649e-4b37-ae8f-f397e7116ed6`
- Timestamp: `2026-08-19T08:03:38.250Z`

You’re asking what changes **in agent behavior** once the agent can see the interface as a stateful, scored dependency graph instead of as code + screenshots.

The biggest gain is **better credit assignment**.

Today, frontend agents are often forced into something like:

```text
request
  ↓
inspect code
  ↓
render page
  ↓
"something looks wrong"
  ↓
guess which code matters
  ↓
edit
  ↓
look at whole page again
```

Your system changes that to:

```text
observed defect
  ↓
affected boundary/state
  ↓
introduced relationships
  ↓
causal/coupled neighbourhood
  ↓
smallest sufficient source context
  ↓
edit
  ↓
re-evaluate affected frontier
```

Your current model already contains the important ingredients: per-node introduced interaction, isolation cost, hierarchical re-evaluation, and explicit non-tree dependencies. fileciteturn0file0L77-L128 fileciteturn0file0L149-L189

That enables several things agents are currently quite bad at:

- **Choose the right reasoning scope.** Instead of opening an entire page or arbitrarily editing one component, the harness can tell the agent: “reason about this form plus these two coupled siblings.” Your isolation and hierarchical metrics already quantify the cost of choosing the wrong resolution. fileciteturn0file0L117-L128
- **Know where a visual problem originates.** A bad header layout might actually be caused by a search field's intrinsic width, a container query, or `:has()` three levels down. Explicit coupling edges let the agent follow effects rather than DOM proximity.
- **Reason about interaction, not screenshots.** `hover`, `focus`, checked, invalid, open, disabled, responsive states become first-class observations. Your state-mass model explicitly makes a five-state control more consequential than a static wrapper. fileciteturn0file0L12-L25
- **Make much smaller edits with confidence.** If HMR changes `SubmitButton`, the agent doesn't need to reassess the entire application. It can recapture the button, affected ancestors, and known coupling frontier.
- **Detect regressions it didn't explicitly anticipate.** Change a checkbox; the harness notices the form, grid geometry, or sibling state also changed. That's substantially stronger than checking whether the target screenshot improved.
- **Separate local quality from compositional quality.** A button can look excellent alone while being wrong in its parent. `introducedInteraction` gives you a natural place to attribute the extra reasoning burden introduced when components are composed. fileciteturn0file0L101-L114
- **Review at multiple resolutions automatically.** Component → section → route → shell can each be reconsidered, rather than expecting one agent context to hold everything simultaneously. Your `hierarchicalInteraction` metric directly models that repeated re-evaluation. fileciteturn0file0L159-L167

But I think the really consequential capability is **autonomous visual iteration without blind global context**.

Imagine the agent gets:

> Make this checkout flow feel polished.

Normally that's dangerously underspecified. The agent may inspect 30 files, change spacing everywhere, invent design intent, then drift.

With this harness it could instead:

```text
Checkout
pressure 89
│
├─ Summary         37
├─ PaymentForm     72
│  ├─ CardField    31
│  ├─ ErrorState   67  ← anomaly
│  └─ Submit       29
└─ Footer          18
```

It investigates `ErrorState`.

Then:

```text
default        score .91
focus          score .89
invalid        score .54
invalid+focus  score .48
```

The causal graph says:

```text
CardField.invalid
   ↓ validation
ErrorMessage
   ↓ layout
PaymentForm height
   ↓ layout
Submit position
```

So instead of “improve checkout,” its task becomes:

> Fix the invalid CardField state. Preserve default/focus behavior. Its error presentation affects PaymentForm geometry and Submit positioning, so evaluate those boundaries after modification.

That is a **radically better coding task**.

It also changes planning. An agent could rank work by something like:

\[
\text{priority}
=
\text{quality deficit}
\times
\text{introduced pressure}
\times
\text{blast radius}
\]

A visually mediocre but isolated icon gets ignored.

A mediocre input whose state propagates through a whole form gets attention first.

That gives frontend agents something they've mostly lacked: **a rational attention mechanism**.

And once you add the partitioning idea we discussed, it starts improving long-horizon behavior too. The harness can decide:

```text
Don't load:
entire dashboard

Load:
OrdersTable
+ FilterBar public states
+ Pagination public states
+ responsive coupling to Sidebar
```

So you reduce two common agent failures simultaneously:

**too little context** → locally correct, globally broken.

**too much context** → diluted attention, unnecessary rewrites, product-intent drift.

Your pressure metric becomes the mechanism for staying between those extremes.

The endgame, to me, is that an agent stops thinking of frontend code primarily as files and starts thinking in terms of:

\[
\boxed{
\text{observable boundary}
+
\text{states}
+
\text{relationships}
+
\text{causal effects}
+
\text{source ownership}
}
\]

Files become implementation detail.

That would make agents materially better at **UI debugging, responsive work, interaction design, regression prevention, refactoring, visual QA, code review, and autonomous iterative design**—but the common reason is the same: they finally know **what must remain coherent when they touch something**.

