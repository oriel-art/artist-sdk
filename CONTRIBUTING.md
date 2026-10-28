# Contributing to artist-sdk

Keep changes focused and use a pull request for every change to `main`.
For substantial features or breaking changes, open an issue to discuss the
approach before implementing it. Bug reports should include reproduction steps,
expected behavior, and actual behavior.

## Branches

`main` is the default branch and the only permanent development branch. Keep it
reviewed, tested, and releasable. There is no separate `develop` branch.

Create a short-lived branch from the latest `main` for each change:

| Pattern | Purpose | Example |
| --- | --- | --- |
| `feat/<name>` | New functionality | `feat/preview-api` |
| `fix/<name>` | Bug fixes | `fix/seed-handling` |
| `docs/<name>` | Documentation | `docs/getting-started` |
| `chore/<name>` | Dependencies, tooling, and CI | `chore/add-ci` |

Use descriptive, lowercase names with hyphens. Do not create empty placeholder
branches. Delete change branches after their pull requests are merged.

## Start a change

Contributors with write access can clone the repository directly:

```sh
git clone https://github.com/oriel-art/artist-sdk.git
cd artist-sdk
git switch main
git pull --ff-only origin main
git switch -c feat/your-change
```

Contributors without write access should fork the repository when access and
repository policy allow it, clone their fork, and add the original as `upstream`:

```sh
git clone https://github.com/YOUR-USERNAME/artist-sdk.git
cd artist-sdk
git remote add upstream https://github.com/oriel-art/artist-sdk.git
git fetch upstream
git switch -c feat/your-change upstream/main
```

Replace the example branch with the appropriate name. In both workflows,
`origin` is the repository you can push to.

## Pull request workflow

1. Make one focused change. Update relevant documentation and add or update
   meaningful tests when changing executable behavior.
2. Run `npm ci` and the checks appropriate to your change: `npm test` for the
   core, `npm run test:browser` for browser/renderer/bridge behavior, and
   `npm run size` for runtime changes. The browser suite uses installed Chrome
   on macOS; elsewhere run `npx playwright install chromium` first. See the
   [pilot guide](docs/pilot-guide.md) for environment details. Inspect your diff
   and document manual visual checks or any untested browser/device limits.
3. Commit the intended files and push your branch:

   ```sh
   git add <changed-files>
   git commit -m "Describe the change"
   git push -u origin HEAD
   ```

4. Open a PR against `oriel-art/artist-sdk` with `main` as the base. Explain the
   problem, resulting behavior, validation, and any compatibility impact. Link
   related issues. Use a draft PR while work is still in progress.
5. Address review feedback and resolve discussions. If `main` advances, fetch
   and merge the latest `origin/main` (or `upstream/main` for a fork) into your
   change branch, resolve conflicts, and repeat relevant validation.
6. A maintainer reviews the diff and validation before merging. Prefer a squash
   merge so each PR becomes one commit on `main`. Obtain another maintainer's
   review when available; GitHub does not let authors approve their own PRs.
7. After merging, run `git switch main`, then update it with
   `git pull --ff-only origin main` (use `upstream` for a fork).
   GitHub automatically deletes merged branches in
   the main repository. Contributors should also clean up their local and fork
   branches after verifying that the changes were merged.

## Main branch policy and enforcement

Do not push directly to `main`, force-push it, or delete it. Use PRs and resolve
review discussions before merging. All applicable CI checks must pass before merge.

These rules apply regardless of the repository's visibility or configured
GitHub protections. Maintainers should configure branch protection requiring PRs and resolved
conversations, blocking force pushes and deletion, and applying the rules to
administrators. Require CI checks once those checks exist and have run
successfully; do not configure nonexistent checks. Require an approving review
once another maintainer is available to review author-created PRs.

## Releases

Maintainers publish releases from tested commits on `main`, using version tags
such as `v0.1.0` and `v0.2.0` and release notes describing changes and migrations.
A normal release does not need a permanent release branch.

Create a maintenance branch such as `release/1.x` only when an older major
version needs fixes while `main` develops the next major version. Base fixes
for that version on its maintenance branch and target that branch in the PR.
Port applicable fixes to `main` through a separate PR. Feature development
continues on `main`.
