# Contributing to AI Orchestrator

Thanks for your interest in contributing! 🎻 This project is **100% open source** and we
welcome issues, ideas, and pull requests.

## Code of Conduct

By participating you agree to uphold our [Code of Conduct](CODE_OF_CONDUCT.md).

## Development setup

```bash
nvm use            # Node 24 (see .nvmrc)
npm install        # install all workspaces
cp .env.example .env
npm run dev        # api + dashboard
```

You need a PostgreSQL/TimescaleDB instance. The easiest path is Docker:

```bash
docker compose up -d postgres
npm run db:migrate
```

## Branching model — GitFlow

We follow [GitFlow](https://nvie.com/posts/a-successful-git-branching-model/):

| Branch              | Purpose                                                       |
| ------------------- | ------------------------------------------------------------- |
| `main`              | Production-ready, tagged releases only                        |
| `develop`           | Integration branch for the next release                       |
| `feature/<name>`    | New work, branched from `develop`, merged back into `develop` |
| `release/<version>` | Stabilize a release, branched from `develop`                  |
| `hotfix/<name>`     | Urgent fix, branched from `main`                              |

Branch off `develop` for features:

```bash
git switch develop
git switch -c feature/my-feature
```

## Commit messages — Conventional Commits

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`.
Scopes we use: `api`, `dashboard`, `landing`, `shared`, `docker`, `docs`, `ci`, `deps`.

Examples:

```
feat(api): add least-latency load-balancing strategy
fix(dashboard): reconnect websocket after network drop
docs(wiki): document model-aware routing
```

## Before you open a PR

Run the full local gate — it must be green:

```bash
npm run format
npm run lint
npm run typecheck
npm test
npm run audit          # no high/critical advisories
```

For UI changes also run `npm run test:e2e` against a running stack.

## Dependency policy

This project is **security-first**. Before adding any dependency:

1. It must have a permissive license (MIT / Apache-2.0 / ISC / BSD / Unlicense).
2. It must be actively maintained and widely used.
3. It must have **no known high/critical advisories** (`npm audit`).
4. Prefer the standard library (`node:crypto`, `fetch`, …) over a new dependency.

Justify new dependencies in the PR description.

## Pull request checklist

- [ ] Branch follows GitFlow (`feature/*`, `fix/*`, …)
- [ ] Commits follow Conventional Commits
- [ ] Tests added/updated and passing
- [ ] `lint`, `typecheck`, `format:check`, `audit` all pass
- [ ] Docs updated when behavior changes

## License & attribution

By contributing you agree your contributions are licensed under the [MIT License](LICENSE).
