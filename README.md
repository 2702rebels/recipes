# 💎 Recipes for FRC 🤖

Best practices, tuning guides, and training material from FRC Team 2702. Not all practices are universal, as some are specific to 2702's needs, but many are general enough to benefit everyone.

**Read it at [recipes.2702rebels.com](https://recipes.2702rebels.com/).**

## What's inside

- **Software Practices** — how we approach robot software.
- **CTRE Control Modes** — closed-loop tuning of Kraken X60/X44 motors on Phoenix 6, in voltage and torque-current modes, with interactive explorers.
- **Training** — guided material for new members (work in progress).

## Working on the site

The site is built with [Fumadocs](https://fumadocs.dev) on Next.js and deployed to GitHub Pages by `.github/workflows/deploy.yml` on every push to `main`.

```bash
pnpm install
pnpm dev     # http://localhost:3000
pnpm lint    # eslint + type-check
pnpm build   # static export to out/
```

| Path                      | What it holds                                                 |
| ------------------------- | ------------------------------------------------------------- |
| `content/docs/`           | The pages, as MDX. Folders and `meta.json` drive the sidebar. |
| `components/interactive/` | Interactive widgets used inside pages.                        |
| `lib/motors.ts`           | Kraken motor constants shared by all widgets.                 |
| `app/`                    | Next.js routes: landing page, docs layout, search index.      |

See the [Contributing](https://recipes.2702rebels.com/docs/contributing) page for how to add pages, math, and components.
