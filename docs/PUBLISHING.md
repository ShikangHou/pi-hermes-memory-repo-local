# Publishing pi-context-memory

The maintained distribution publishes the npm package `pi-hermes-memory`. The
`pi-package` keyword and `pi.extensions` manifest in `package.json` make the
published package discoverable by Pi.

## Stable release prerequisites

1. Complete the release checklist in `docs/0.8/PLAN.md`.
2. Keep automatic recall disabled by default.
3. Merge the release PR into the default branch. GitHub only permits manual
   dispatch of `.github/workflows/publish.yml` after that workflow exists on
   the default branch.
4. Confirm `package.json` and `package-lock.json` contain the same stable
   version and that the version is not already present on npm.
5. Ensure the protected `publish` environment has a valid `NPM_TOKEN` secret
   authorized to publish `pi-hermes-memory`.

Do not publish a stable package directly from an unmerged Draft PR branch.

## Preflight

From the merged release commit:

```bash
npm install
npm run check
npm test
npm pack --dry-run
npm view pi-hermes-memory version dist-tags --json
git status --short
```

The working tree must be clean, the full native-SQLite suite must pass, and
the intended version must not already exist in the registry.

## GitHub Actions dry run

Run the `Publish to npm` workflow on the default branch with `dry_run=true`.
The workflow repeats installation, type checking, the full test suite, and
`npm publish --dry-run --access public` in the same environment used for the
real publication.

Using GitHub CLI after the workflow has been merged:

```bash
gh workflow run publish.yml --ref main -f dry_run=true
gh run watch --exit-status
```

Inspect the tarball file list and package version before continuing.

## Publish

Run the same workflow on the exact merged release commit with
`dry_run=false`:

```bash
gh workflow run publish.yml --ref main -f dry_run=false
gh run watch --exit-status
```

The `publish` environment may require maintainer approval. Do not bypass its
protection rules or publish from an unrelated local npm identity.

## Tag and GitHub Release

After npm publication succeeds, tag the same merged commit and create the
GitHub Release:

```bash
git tag -s v0.8.0 <merged-release-commit>
git push origin v0.8.0
gh release create v0.8.0 --verify-tag --generate-notes --title "v0.8.0"
```

If signed tags are unavailable, stop and obtain an explicit maintainer
decision before creating an unsigned release tag.

## Verification

```bash
npm view pi-hermes-memory@0.8.0 version dist.integrity --json
pi install npm:pi-hermes-memory@0.8.0
```

Also verify:

- the GitHub Release tag points to the merged release commit;
- `https://www.npmjs.com/package/pi-hermes-memory` shows `0.8.0` as `latest`;
- the package appears on `https://pi.dev/packages`;
- a clean install loads `src/index.ts` and keeps automatic recall off.

Only after these checks pass should `Stable release` be marked complete in
`docs/0.8/PLAN.md`.

## Release failure handling

- If verification fails, do not publish.
- If npm publication fails before accepting the version, fix the workflow and
  rerun it from the same commit.
- If npm accepted the version, never overwrite it. Prepare a patch release.
- If the npm package and Git tag point at different source, stop distribution
  and document the mismatch before taking corrective action.
