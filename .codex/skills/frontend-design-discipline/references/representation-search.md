# Representation search

Use this reference when meaningful data or behavior has no approved interface
representation.

## Prefer observed product state

Use evidence in this order when it is available:

1. Actual rendered product states.
2. Actual or representative runtime data.
3. User tasks and observed behavior.
4. Existing interaction conventions.
5. Nearby product surfaces.
6. Accepted screenshots or reference interfaces.
7. Written requirements.
8. Type definitions.
9. Database and schema names.

Lower-ranked evidence remains important for correctness. It should not dominate the
design merely because it is easy to inspect.

Inspect representative values, minima and maxima, typical distributions, missing
states, long strings, repeated records, state transitions, update frequency,
correlated fields, failure states, and realistic combinations. A clean field label
does not reveal which differences matter or how awkward reality behaves.

## Generate competing mappings

Determine what the user needs to perceive before choosing how to encode it. Explore
materially different mappings such as:

```text
literal        source value is shown directly
instrumental   a gauge, dial, or other instrument exposes it
semantic       useful regimes replace raw magnitude
ambient        light, texture, sound, or motion carries the state
behavioral     relevant actions or features change prominence
environmental  the represented world changes
narrative      the input moves between meaningful product situations
```

At least one candidate must not display the source value at all. An alternative is
not materially different when only palette, typography, spacing, border radius, or
component arrangement changes while its representation and interaction thesis stay
the same.

Evaluate candidates against importance, glanceability, space cost, visual noise,
accessibility, neighboring information, observed values, and the user's task. Prefer
changing an existing surface over adding another widget. Keep the quietest
representation that communicates the relevant state.

## Resist premature completion

The first technically valid design is a draft, not the implementation target.
Render or materialize it, then remove or replace one major decision and attempt a
materially different solution. Keep the first only after direct comparison.

Do not satisfy this requirement with ceremonial variants. The comparison exists to
test the representation thesis, not to generate a fixed number of cosmetic themes.
