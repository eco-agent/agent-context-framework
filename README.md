# Agent Context Framework

> I have spent more than 9.2 billion tokens working with GPT-5.6. ACF is the setup
> that survived.

I built Agent Context Framework because I was fucking tired of correcting the
same things.

Tired of the little eyebrow above every heading. Tired of card grids pretending
to be product design. Tired of prose that used 600 polished words to say nothing.
Tired of TypeScript that compiled because every field was optional and every error
was somebody else's problem.

Tired of watching GPT-5.6 be brilliant and generic at exactly the same time.

ACF is my personal Codex setup manifest. You install its source into a repository,
then edit it until the result matches your taste.

## The difference in one paragraph

ACF makes GPT-5.6 behave like the version of Codex I wanted after 9.2 billion
tokens. It replaces the model's generic taste with mine and makes its claims answer
to the repository before it calls the work done. Stock Codex does not carry that
memory. A hand-written `AGENTS.md` captures the reminders you thought to add, while
skills made as you go repair failures one at a time. ACF joins those corrections
and makes them active together. Its source remains editable.

## Why this exists

I did not sit down and design a framework from first principles. I used Codex. A
lot.

At first I pasted corrections into `AGENTS.md`. That file grew until a rule about
debugging competed for attention during a typography change. I moved specialist
judgment into triggered skills. When prose could not prove a rule, I wrote a
checker. ACF is what survived 9.2 billion tokens of that cycle.

I now spend fewer opening turns telling the model not to reach for the same UI and
fewer closing turns arguing that a green check proved the wrong thing. The relevant
correction is already present before GPT-5.6 makes the decision.

## Built for GPT-5.6

ACF currently supports GPT-5.6. I have not calibrated it for other models.

The checked-in Codex configuration uses `gpt-5.6-sol` for the default role and
`gpt-5.6-luna` for scout and worker roles. I wrote the instructions after observing
what that family gets right and where I keep correcting it. Another model may follow
them. That is not the same as being supported.

[OpenAI's GPT-5.6 guidance](https://developers.openai.com/api/docs/guides/latest-model)
recommends stating each instruction once and keeping style guidance when it corrects
a measured gap. ACF follows that advice. Universal rules live once in the baseline.
Detailed judgment loads only for the work that needs it.

## What ACF believes

**Code is cheap now. Judgment is not.** GPT-5.6 can produce more code than I can
sensibly review. I want the resulting code to make the next change easier, not bury
it under another abstraction.

**A rule that arrives after the edit is dead.** Context has to appear before the
decision it is meant to change. If the same warning lives in four files, the next
edit leaves three stale copies behind.

```text
owner       docs/AGENTS.md  -> pnpm verify:profile docs
stale copy  README.md       -> pnpm verify
```

The stale copy now tells the agent to run the wrong check.

**Generic taste is still generic.** Better model priors do not know the product I
am building. ACF tells the model what I consider acceptable, down to whether a
heading gets an eyebrow and whether a TypeScript state can contradict itself.

```ts
type LooseJob = {
  status: "queued" | "done" | "failed";
  result?: Result;
  error?: JobError;
};

// The type accepts a finished job with no result and an unrelated error.
declare const timeout: JobError;
const impossible: LooseJob = { status: "done", error: timeout };

type Job =
  | { status: "queued" }
  | { status: "done"; result: Result }
  | { status: "failed"; error: JobError };
```

**A boundary without evidence is a wish.** "Be careful" does not protect a
codebase. A diff can show whether the agent touched user work. If ownership overlaps,
the agent has to stop and name the conflict.

```text
task owns  src/invite.ts
           test/invite.test.ts
diff adds  package.json

stop: package.json was already dirty
```

**The repository must remain in charge.** ACF provides my defaults. The project
policy names the contracts an agent must read. When one of those contracts disagrees
with generic guidance, the contract wins unless it would weaken the protected
framework baseline.

## Why not skills.sh, Matt Pocock's skills, or pstack?

Use them if they fit you better. [`skills.sh`](https://skills.sh/) helps people
find and install agent skills. [`mattpocock/skills`](https://github.com/mattpocock/skills)
and [`pstack`](https://github.com/cursor/plugins/tree/main/pstack) publish setups
built from how their authors work. I respect both. ACF includes pinned, licensed
adaptations from them and does not pretend those ideas appeared here first.

Installing one skill gives Codex one more procedure. ACF changes the default before
any skill fires. It includes the boring rules and checks that have to apply when
nobody remembers them. If my taste is close to yours, ACF gives you a starting
point containing corrections from 9.2 billion tokens. You do not have to discover
each one through your own bad runs. Otherwise, delete anything you would not defend.

## Make it yours

This is a personal setup manifest. My preferences are not universal. You may hate
some of them. Good. The source is visible because disagreement should end in an
edit, not another layer of exceptions pasted over rules you never wanted.

Fork it and rewrite whatever annoys you. Keep only the rules you would defend in a
code review. I want people to begin with a serious setup and edit it, instead of
reconstructing one after every bad run.

## What ACF cannot promise

Instructions do not make GPT-5.6 smarter or guarantee that it noticed every rule.
ACF cannot inspect the model's private context. My 9.2 billion tokens are experience,
not proof that this setup fits your workload.

ACF writes the defaults into the repository before the task starts. When a claim
can be checked, the agent has to show the evidence.

I do not need a promise of autonomous software engineering. I need Codex to stop
repeating mistakes I already paid to learn.

## Try it

ACF currently runs from a source checkout and requires Node.js `24.14.0` with pnpm
`10.22.0`.

```powershell
git clone https://github.com/Lungren2/agent-context-framework.git
cd agent-context-framework
pnpm install --frozen-lockfile
pnpm agent-context setup --cwd D:\path\to\your-project
```

[`registry`](registry) contains the components and records where adopted source came
from. [`docs`](docs/README.md) contains the architecture notes. Original ACF source
is MIT licensed. Adopted source keeps its upstream license and notice.
