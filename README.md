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

ACF is my personal Codex setup manifest. It packages the instructions, skills,
model roles, repository facts, and checks I now want available in every serious
codebase. It is source you can install, read, argue with, and alter to your taste.

## The difference in one paragraph

ACF makes GPT-5.6 behave like the version of Codex I wanted after 9.2 billion
tokens. It stops reaching for generic UI and prose priors, treats TypeScript as
domain design instead of autocomplete, investigates before it invents, and does
not call work finished until the repository can support the claim. Stock Codex
does not carry that accumulated project memory. A hand-written `AGENTS.md`
captures the reminders you thought to add, while skills made as you go remain
individual repairs. ACF joins those corrections into one opinionated, editable
default for how the model works inside a repository.

## Why this exists

I did not sit down and design a framework from first principles. I used Codex.
A lot.

Every time the model produced something I would not keep, I corrected it. When the
same correction came back, it became an instruction. When the instruction needed
real judgment, it became a skill. When the model could claim compliance without
proving anything, it became a check. When a rule mattered only for one kind of
task, I moved it out of the universal context and closer to that decision.

That process changed the code I got back. Frontend work stopped beginning with the
same generic composition. Writing stopped sounding like a committee of chatbots.
TypeScript changes started from the domain and its invalid states. Bug fixes began
with a reproduction. New mechanisms had to justify themselves against what the
repository and maintained packages already provided.

None of those ideas is shocking. The value is that I no longer have to remember
which correction to paste into which chat. The repository carries the setup, and
the relevant part is already there when GPT-5.6 reaches the decision.

## Built for GPT-5.6

ACF currently supports GPT-5.6. It is not calibrated for an abstract "AI agent"
or promised to work equally well with every model.

The checked-in Codex configuration uses `gpt-5.6-sol` for the default role and
`gpt-5.6-luna` for scout and worker roles. The instructions target the strengths,
priors, and recurring failure modes I have observed in that family. Another model
may follow them. That is not the same as being supported.

[OpenAI's GPT-5.6 guidance](https://developers.openai.com/api/docs/guides/latest-model)
recommends lean prompts, stating each instruction once, and retaining style guidance
when it encodes a product requirement or corrects a measured gap. ACF follows the
same shape. Universal rules live once in the baseline. Detailed judgment loads only
for the work that needs it.

## What ACF believes

**Code is cheap now. Judgment is not.** GPT-5.6 can produce more code than I can
sensibly review. The job is no longer to maximize output. It is to preserve a
system that remains understandable, operable, and worth changing later.

**A rule that arrives after the edit is dead.** Context has to appear before the
decision it is meant to change. Repeating the same warning in more files creates
noise, drift, and several copies nobody can trust.

**Generic taste is still generic.** Better model priors do not know the product I
am building. ACF is deliberately opinionated about representation, writing,
TypeScript, verification, and the kinds of abstractions that deserve to exist.

**A boundary without evidence is a wish.** "Be careful" does not protect a
codebase. A useful rule says who decides, what the agent may change, how the result
is observed, and what happens when the normal path is blocked.

**The repository must remain in charge.** ACF provides my defaults. The project
owns its facts, names its contracts, and can impose stricter rules. When local truth
and generic guidance disagree, local truth wins unless it would weaken the protected
framework baseline.

## Why not skills.sh, Matt Pocock's skills, or pstack?

Use them if they fit you better. [`skills.sh`](https://skills.sh/) helps people
find and install agent skills. [`mattpocock/skills`](https://github.com/mattpocock/skills)
and [`pstack`](https://github.com/cursor/plugins/tree/main/pstack) publish the
engineering judgment of people whose work I respect. ACF includes pinned,
licensed adaptations from both. It does not pretend those ideas appeared here
first.

The difference is the unit of adoption. ACF is not a directory of capabilities or
a mode I remember to invoke. It is the complete GPT-5.6 setup I use for a
repository, including the boring baseline rules and checks that have to apply even
when nobody remembers them. If my taste is close to yours, ACF gives you a starting
point shaped by 9.2 billion tokens instead of an empty folder. If it is not, take
the parts that earned their place and replace the rest.

## Make it yours

This is a personal setup manifest, not a claim that my preferences are universal.
You may hate some of them. Good. The source is visible because disagreement should
end in an edit, not another layer of exceptions pasted over rules you never wanted.

Fork it. Change the voice. Remove a skill. Add the contract your repository keeps
violating. Replace my frontend taste with yours. Keep only the rules that continue
to earn attention.

The point is not to preserve ACF untouched. The point is to stop rebuilding a
serious agent setup from zero.

## What ACF cannot promise

ACF cannot make GPT-5.6 smarter. It cannot guarantee that the model attended to
every instruction, and it does not inspect the model's private context. It cannot
replace a maintainer's taste or prove that my 9.2 billion tokens resemble your
workload.

It can make the defaults explicit. It can put hard-won corrections where the model
can use them. It can make the agent show evidence for claims I got tired of taking
on faith.

That is a smaller promise than autonomous software engineering. It is the one I
actually care about.

## Try it

ACF currently runs from a source checkout and requires Node.js `24.14.0` with pnpm
`10.22.0`.

```powershell
git clone https://github.com/Lungren2/agent-context-framework.git
cd agent-context-framework
pnpm install --frozen-lockfile
pnpm agent-context setup --cwd D:\path\to\your-project
```

The source, attribution, and component registry live in [`registry`](registry).
The architecture notes live in [`docs`](docs/README.md). Project-authored
distributable source is MIT licensed, and adapted source keeps its upstream
revision, attribution, license, and notices.
