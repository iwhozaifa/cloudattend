# Git workflow

Use short-lived `feat/*`, `fix/*`, `docs/*`, or `chore/*` branches and Conventional Commit subjects such as `feat(api): add check-in`. Merge completed branches with `--no-ff`.

Before committing, inspect `git status` and `git diff --staged`, run applicable checks, and ensure no `.env`, credentials, builds, or `node_modules` are staged. If a secret is committed, revoke it immediately, remove it, and notify collaborators; a later deletion does not make it safe.

Release after checks with `git tag -a v1.0.0 -m "CloudAttend v1.0.0"`. To add a remote: `git remote add origin <repository-url> && git push -u origin main --tags`.
