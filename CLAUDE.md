# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Neuroevolution Lab** — a client-side web app that visualizes AI learning to play games via
neuroevolution (genetic algorithm + neural network, no backpropagation). Pure static
HTML/CSS/JS with ES modules — no production build step or bundler. A dependency-free
Node test script verifies deterministic training and the public Brain format.

## Running it

Run `npm start` for the dependency-free Node server, including the Brain Hub API. A plain
static server still works for the training lab alone, but Hub login/publish/leaderboard then
will not. Never open via `file://` because the frontend uses ES module imports.

Run `npm test`, then verify UI changes by loading the page in a browser and driving the
three public games (start a run, switch modes, export/import a Brain, check the console).

## Architecture: 3 independent layers

```
index.html / style.css      UI shell (all controls, canvases, cards)
hub.html / server.mjs       Model Hub UI + auth/publish/verified-leaderboard API
js/
├── nn.js                   AGENT — feedforward neural network (tanh hidden, sigmoid output);
│                            genome = flat array of weights, no backprop
├── ga.js                   TRAINER — genetic algorithm (Trainer class): selection, crossover,
│                            mutation, elitism. Knows NOTHING about any specific game's rules
├── environments/*.js       GAME RULES — one class per game, all implementing the same interface
├── main.js                 wires UI ↔ Trainer ↔ Environment, runs the requestAnimationFrame loop
├── ui.js                   all DOM manipulation (huge file — stats, charts, rank table,
│                            history panel, tooltips, network/heatmap drawing)
├── storage.js               run-history persistence (localStorage)
├── brain.js                 versioned data-only Brain format
├── evaluator.js             deterministic server-side Brain evaluation
├── random.js                seeded RNG used by training and comparisons
├── analytics.js             local funnel counters + optional endpoint
├── analysis.js              post-run analysis + tuning suggestions for the summary modal
├── compare.js                "before vs after" side-by-side comparison runs
└── heatmap.js                policy-heatmap grid computation (for games that expose 2 axes)
```

These three layers never reach into each other's internals — `ga.js` drives any environment
purely through the interface below, and `nn.js` has no knowledge of `ga.js` or any game.

### Environment interface (required by every `js/environments/*.js` class)

Documented in detail in the header comment of `js/environments/flappy.js`. Every environment
must implement:

```js
static config = { name, inputs, outputs, ... }  // inputLabels/outputLabels/scoreLabel optional but expected
reset(seed)          // return to initial state; seed makes the run reproducible
getInputs()           // array of numbers normalized to 0..1 — the AI's "senses"
step(outputs)         // consume the raw NN output array, apply one tick, return { reward, done }
render(ctx, mode)     // mode 'full': draw the whole scene + one agent; 'agent': draw only the agent (overlaid)
```

Adding a new game requires **no changes to `ga.js`, `main.js`, or `ui.js`** — see the
step-by-step comment at the top of `js/environments/registry.js`:
1. Write a new environment class implementing the interface above.
2. Import it and add one line to the `registry` object in `registry.js`.

### Dynamic config (`configFor`)

Some environments accept options that change the genome length (input/output count), e.g.
Flappy's `lookahead` (how many pipes ahead the AI sees) or 2048's `searchDepth`/`strategies`
(expectimax mode + optional strategic features). These environments export a static
`configFor(opts)` in addition to `config`; `registry.js` and `main.js` (`resolveEnv`) prefer
`configFor` when present. Any option that changes genome length must also be threaded through
`js/storage.js` (`archOf`/`archId`) so run history correctly separates incompatible genomes —
see the extensive comments in `storage.js` for why this matters (loading a mismatched genome
into `NeuralNetwork.fromGenes` breaks).

### Trainer lifecycle (`ga.js`)

Each individual = `{ net, env, fitness, alive }`. Per generation: every individual's
`env.getInputs()` feeds `net.forward()`, whose output feeds `env.step()`, accumulating reward
into fitness. When all individuals in the population are dead (`stepAll()` returns 0),
`onGenerationEnd()` either replays with a new seed (if `seedsPerGen > 1`, to average out lucky
maps) or calls `evolve()`: rank by fitness → elitism + tournament selection + crossover +
mutation → new population. Mutation std anneals over generations (see `MUTATION_STD_START/END/
HALFLIFE` in `ga.js`).

Fairness detail: every individual in a generation is reset with the **same seed**, so they all
face an identical map/obstacle layout — this is why the canvas can overlay the whole population
on one scene and why fitness comparisons within a generation are meaningful.

### Run history (`storage.js`)

Up to 10 history entries per game in localStorage, keyed by an `archId` derived from every
option that affects genome length or game rules (`hiddenNodes`, `lookahead`, `searchDepth`,
`strategies`, `evalDepth`, `startLevel`, `seedsPerGen`). Re-running with the same config only
overwrites its entry if the new result is strictly better (`_isBetter`); a new config always
gets its own entry. `popSize` and `mutationRate` are the only settings NOT part of the identity
— they're free to change between runs of the same entry.

## Per-game documentation (`docs/`)

Each game has two markdown docs, matching a fixed template:
- `docs/introduce/<game>.md` — explains the game's *current* learning logic in depth (inputs,
  action interpretation, reward design, what's interesting to watch).
- `docs/improve/<game>.md` — numbered improvement proposals, each as **Hiện tại** (current
  limitation) / **Cải thiện** (proposal) / **Giá** (cost & risk).

Use `docs/introduce/flappy-bird.md` and `docs/improve/flappy-bird.md` as the canonical
templates. There is a project skill, **`add-game`** (`.claude/skills/add-game/`), that
automates plugging in a new game end-to-end (spec → similarity check against existing games →
environment file → registry entry → verify → both docs). Prefer it when adding a game.

## Language convention

All code comments, docstrings, UI strings, and the `docs/` markdown are written in Vietnamese.
Match this when editing existing files — comments explain *why*, not *what*, consistent with the
density of reasoning already present throughout `ga.js` and the `environments/` files (e.g. the
seeded-RNG fairness rationale, the Flappy pipe-spacing feasibility analysis, the 2048
action-masking rationale).
