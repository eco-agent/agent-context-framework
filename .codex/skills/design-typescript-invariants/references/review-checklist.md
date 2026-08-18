# Type architecture review

## State model

- Are valid states explicit?
- Can contradictory fields coexist?
- Does a discriminant control variant-specific data?
- Is each optional property semantically optional in this representation?
- Are construction, unloaded, absent, partial, and validated states distinguished?
- Are legal transitions visible?

## Boundaries

- Is every external input validated exactly where trust begins?
- Does uncertainty end after parsing?
- Are transport, persistence, and domain conversions explicit?
- Are runtime checks duplicated inside trusted code?
- Does a type assertion hide a missing conversion or validator?

## Failures

- Are expected outcomes typed where callers must branch?
- Are exceptions reserved for exceptional conditions or established framework boundaries?
- Does each catch recover, clean up, translate, or add meaningful context?
- Is useful error identity preserved?

## API design

- Are boolean parameters or mode flags hiding distinct operations?
- Is an all-optional options object permitting incoherent calls?
- Does every generic express a real relationship for callers?
- Are explicit annotations helping a public contract rather than obscuring inference?
- Are brands preventing demonstrated primitive confusion?

## Runtime branch audit

Classify each new branch:

- external validation
- expected domain outcome
- exceptional/invariant defense
- workaround for an under-specified type

Redesign the type for the fourth category and delete the branch.

## Change resilience

- Did a new requirement cause the model to be reconsidered?
- Did the patch add compatibility fog, duplicate schemas, or another normalizer?
- Are architectural decisions persisted for future agents?
- Do type tests or focused runtime tests protect the invariant?
- Do all public call sites receive the intended compiler pressure?
