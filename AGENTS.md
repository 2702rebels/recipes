# AGENTS.md

Guidance for AI coding agents (and humans) working in this repository. Add a rule here whenever a review turns up a preference that should apply to future changes.

## Project

**Recipes for FRC**: Team 2702's reference site for best practices, tuning guides, and training material. It is a [Fumadocs](https://fumadocs.dev) site on Next.js, exported as static HTML and published to GitHub Pages at `https://recipes.2702rebels.com/` (a custom domain, so pages are served from the root).

## Commands

Package manager is **pnpm**. Node 24 or newer.

| Task                   | Command             |
| ---------------------- | ------------------- |
| Dev server (:3000)     | `pnpm dev`          |
| Static build to `out/` | `pnpm build`        |
| Lint + type-check      | `pnpm lint`         |
| Format code            | `pnpm format`       |
| Check formatting       | `pnpm format:check` |

There are no tests. `pnpm lint` and a successful `pnpm build` are the gates. Run both before calling work done.

The site is served from the domain root, so `pnpm build` locally matches production. The deploy workflow still passes the Pages base path through `PAGES_BASE_PATH`, which is empty with the custom domain. If the site ever moves back to a `github.io/<repo>` address, that variable makes the build work under `/<repo>/` without code changes. To test that locally, build with `PAGES_BASE_PATH=/recipes` (in Git Bash, also set `MSYS_NO_PATHCONV=1`, or the path gets rewritten into a Windows path).

Local Windows builds show 404s for link-prefetch files (`__next.*.__PAGE__.txt`). This is a Next.js bug on Windows ([vercel/next.js#92339](https://github.com/vercel/next.js/issues/92339)). CI builds on Linux and is not affected. Ignore it locally.

## Layout

```
content/docs/            Pages as MDX. Folders are sidebar groups, meta.json sets order.
components/interactive/  Interactive widgets used in pages (client components).
components/diagrams/     Static SVG diagrams used in pages (server components).
components/mdx.tsx       Registers components available in every MDX page.
lib/motors.ts            Kraken motor constants. The single source for motor numbers.
lib/turret-sim.ts        Pure step-response simulation used by the tuning sandbox.
lib/procedures.ts        Index of tuning procedures (anchors) for the index page and jump links.
lib/vision.ts            Camera projection and PnP solver (homography + Levenberg-Marquardt) for the Vision pages.
lib/vision-sims.ts       Monte Carlo and sweep scenarios built on lib/vision.ts. lib/odometry-sim.ts is the drift sim.
app/                     Next.js routes: landing page, docs layout, search index.
source.config.ts         Global MDX plugins (remark-math, rehype-katex).
.github/workflows/       deploy.yml builds and publishes to GitHub Pages on push to main.
```

## Writing style

These rules apply to all prose: pages, callouts, component labels and captions, README, and doc comments.

- **Prefer periods to semicolons.** Split long sentences into shorter ones instead of joining clauses with `;`. A comma or a short list is also fine. Avoid semicolons in prose altogether.
- **Keep sentences short and direct.** Use the active voice and plain words. Write for a high-school student who is new to controls.
- **Lead with what the reader needs to do or know**, then the explanation. Put derivations after the practical summary.
- **Avoid jargon and filler.** No "dispositive", "genuinely", "it's worth noting". Define a term the first time it is used.
- **Say things once.** Link to the section that explains a concept rather than repeating it.
- **Use numbered steps with a bold lead-in** for procedures, and tables for decision rules.
- **Be precise about units.** State whether a gain is in Volts or Amps, and per mechanism or rotor rotation.

## Technical content

- **Kraken X60 and X44 only.** Don't mention or add data for Falcon 500 or other motors.
- **Verify Phoenix 6 API claims** (config names, defaults, behavior) against the current CTRE documentation or API reference before writing them. If something cannot be verified, leave it out or mark it clearly.
- **Keep numbers consistent.** Worked examples must use constants from `lib/motors.ts` / the Motor Constants page, and must be recomputed when those change. Say which commutation (FOC or trapezoidal) a number assumes.
- **Don't overstate torque-current mode.** It is still limited by supply voltage and back-EMF. Current limits apply in both output families.
- **Vision pages stay implementation-neutral.** Explain concepts and math, and don't document specific off-the-shelf vision products. The team's own pipeline is covered separately. WPILib and OpenCV APIs are fine to name.
- **Name the frame and axis convention.** Field and robot frames use WPILib axes (x forward, y left, z up). Camera frames use OpenCV axes (x right, y down, z forward). Vision numbers must come from `lib/vision.ts` and its `DEFAULT_CAMERA` (1280×800, 70°) and be recomputed if those change.
- **Say which current you mean.** Whenever a current, current limit, or current reading appears (in prose, tables, widget labels, readouts, axes, legends, and captions), state whether it is **stator** (motor winding) current or **supply** (battery) current, unless the context makes it unambiguous. Name the matching config where it helps: `StatorCurrentLimit`, `SupplyCurrentLimit`, or `PeakForwardTorqueCurrent` / `PeakReverseTorqueCurrent` (which cap stator current in torque-current mode). The two differ a lot at low speed, where supply current is much lower than stator current.

## MDX conventions

- Frontmatter needs `title` and `description`. The title is the page's `#` heading, so start sections at `##`.
- Add new pages to the folder's `meta.json`. A folder's `index.mdx` is its landing page and should not be listed in `pages`.
- Link between pages with absolute paths (`/docs/guides/ctre/voltage#23-arm-position`). They work unchanged if a base path is ever added.
- Math uses `$...$` inline and `$$...$$` on their own lines. Write plain LaTeX (`\,`, `\_`, `\%`), not the doubled backslashes GitHub's Markdown needs. Avoid Unicode such as `²` inside `\text{}`. Use `^2`.
- Outside code and math, `<` starts a component and `{` starts an expression. Write "less than" or `&lt;`.
- Wrap every tuning procedure body in `<Procedure mechanism="…" mode="voltage|torque">` (see `components/procedure.tsx`). Keep the heading outside the component and interactive widgets outside the panel.
- `lib/procedures.ts` lists every mechanism procedure by heading anchor. It feeds the Tuning Procedures index page and the `<ProcedureLinks>` row under each mechanism heading. When you add, rename, or renumber a procedure heading, update it there, and add `<ProcedureLinks mechanism="…" mode="…" />` under any new mechanism heading.
- Printing is always light mode. `components/print-light-mode.tsx` drops the `dark` class while printing, and `@media print` in `app/global.css` restates the light colors as a fallback. If you add or change a theme color in `:root`, update that fallback too.
- Procedure colors mean output family everywhere: teal for voltage, violet for torque-current, slate for general. Don't reuse them for anything else.
- Prettier does not format `content/` (it mangles math and tables). Keep MDX tidy by hand.

## Interactive components

- Put widgets in `components/interactive/` as client components (`"use client"`), and register them in `components/mdx.tsx`.
- Build them from the shared parts: `Widget`, `Slider`, `Segmented`, `Readout` (`controls.tsx`) and `LinePlot` (`plot.tsx`).
- Take motor data from `lib/motors.ts`, including helpers such as `maxCurrentAt`.
- Keep simulations in pure functions under `lib/` (e.g. `lib/turret-sim.ts`), separate from React. Before wiring a simulation into a page, run it for the page's worked example and check that the result matches the text (for example with `node` on a small script that imports it by `file:///` URL). Modules that import other `lib/` files without extensions can be run with `node_modules/.bin/jiti script.ts`.
- Leave `Readout`'s `emphasis` off when the readouts are peers. Use it only for what the widget exists to produce: the number its page text is built around, or the values the reader enters into a config (for example kG and kS from the bracketing test).
- Use `MotorPicker`, `ActionButton`, and `fmt` from `controls.tsx` rather than rebuilding them. `LinePlot` supports negative ranges (`yMin`) and reference lines (`markers`).
- List every new widget in the table on the Contributing page.
- Use theme tokens only: `fd-*` Tailwind classes for UI and `var(--color-plot-*)` from `app/global.css` for plots. Never hardcode palette colors, so light and dark themes both work.
- Default values should reproduce a worked example on the same page. State what the model ignores (friction, current limits, and so on).

## Code conventions

- Prettier is authoritative: 120 columns, double quotes, semicolons, ES5 trailing commas, `bracketSameLine`, `singleAttributePerLine`. Tailwind classes are sorted by `prettier-plugin-tailwindcss`.
- Use `cn()` from `lib/cn.ts` for conditional classes.
- Components are arrow-function consts. Public types, props, and exported helpers get `/** ... */` doc comments.
- TypeScript is pinned to 6 because typescript-eslint does not support 7 yet.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
