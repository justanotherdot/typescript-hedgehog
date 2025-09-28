# Release process

This document outlines the process for releasing new versions of typescript-hedgehog.

## Prerequisites

- All changes must be merged to the main branch
- CI must be passing
- All tests must pass locally

## Release steps

1. **Create a release branch**
   ```sh
   git checkout main
   git pull origin main
   git checkout -b release/X.Y.Z
   ```

2. **Run the release script**
   ```sh
   bin/release-version-bump {patch|minor|major}
   ```

   This script will:
   - Bump version in all workspace packages (root, hedgehog, hedgehog-splitmix-wasm)
   - Update dependency references between packages
   - Create a commit with message "Release X.Y.Z"

3. **Update the changelog**
   - Add release notes to CHANGELOG.md under the new version
   - Include sections for Added, Changed, Fixed as appropriate
   - Include the release date
   - Add the release link at the bottom
   - Commit these changes

4. **Push release branch and create PR**
   ```sh
   git push origin release/X.Y.Z
   ```
   - Create a PR from the release branch to main
   - Get the PR reviewed and approved
   - Merge to main

5. **Automatic tagging after merge**
   - After the release PR is merged to main, CI automatically:
     - Detects the `release/X.Y.Z` branch name pattern
     - Extracts the version from the branch name
     - Creates and pushes the git tag
     - Triggers the publish workflow

## Workspace structure

The project uses npm workspaces with these packages:
- Root workspace (typescript-hedgehog)
- `@justanotherdot/hedgehog` - Main TypeScript package
- `@justanotherdot/hedgehog-splitmix-wasm` - WebAssembly bindings

The release script ensures all packages stay in sync and dependency references are updated correctly.

## Git tag format

Tags use semantic version numbers without prefixes (e.g., `0.1.2`, not `v0.1.2`).

## CI and publishing

- CI runs on all pushes and PRs
- After release PRs are merged, CI automatically creates tags and publishes
- The publish workflow uses `npm publish --workspace=<package>` for each package
- Release detection happens via the `release/X.Y.Z` branch naming pattern