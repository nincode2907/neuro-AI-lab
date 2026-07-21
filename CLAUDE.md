# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Neuroevolution Lab** — a client-side web app that visualizes AI learning to play games via
neuroevolution (genetic algorithm + neural network, no backpropagation). Pure static
HTML/CSS/JS with ES modules — no build step, no bundler, no package.json, no test runner.

## Running it

There is no dev server or build command. Open `index.html` via a local static server (e.g.
VS Code "Open with Live Server") — it must be served over HTTP, not `file://`, because it
uses ES module imports. `xiangqi-test.html` is a standalone manual test page for the Xiangqi
(Chinese chess) engine, opened the same way.

There is no automated test suite, linter, or build/typecheck command. Verify changes by
loading the page in a browser and driving the UI (start a run, switch games, check the
console for errors).

## Architecture: 3 independent layers

```
index.html / style.css      UI shell (all controls, canvases, cards)
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
