# Repository settings

These need a repository admin. Branch protection cannot be set from a PR.

## Protect `main`

GitHub: Settings, Branches, Add branch ruleset (or classic branch protection rule) for `main`.

1. Require a pull request before merging.
2. Require 1 approval, and enable "Require review from Code Owners" (owners are in `.github/CODEOWNERS`).
3. Require status checks to pass before merging, and select the checks `ci / build` and `ci / docker` (the jobs `build` and `docker` of the workflow `ci`). It appears in the list only after the workflow has run once.
4. Require branches to be up to date before merging.
5. Block force pushes and deletions.

## Other settings

- Issues: enabled (the issue forms in `.github/ISSUE_TEMPLATE` rely on it; blank issues are off).
- Actions: allow read and write permission for the `link-check` workflow's issue (it requests `issues: write` itself).
- Dependabot alerts: enable.
