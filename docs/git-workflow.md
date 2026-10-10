# Git workflow

Use short-lived `feat/*`, `fix/*`, `test/*`, `docs/*`, or `chore/*` branches cut from `main`, and Conventional Commit subjects such as `feat(api): add check-in`. Merge completed branches with `--no-ff` only after the gate passes on the branch:

```bash
npm run check:secrets && npm run lint && npm run typecheck && npm run test && npm run build && npm run cdk:synth
npm run test:e2e   # for UI or API changes
```

CI (`.github/workflows/ci.yml`) runs the same gate, plus the production-bundle check and `npm audit`, on pushes to `main` and on pull requests.

Before committing, inspect `git status` and `git diff --staged`, run applicable checks, and ensure no `.env`, credentials, builds, or `node_modules` are staged. If a secret is committed, revoke it immediately, remove it, and notify collaborators; a later deletion does not make it safe.

Release after checks with `git tag -a v1.0.0 -m "CloudAttend v1.0.0"`. To add a remote: `git remote add origin <repository-url> && git push -u origin main --tags`.
