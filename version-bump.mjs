/**
 * Release helper used by `npm run version`.
 *
 * Purpose:
 * - Read the package version from `npm_package_version` (from `package.json`).
 * - Set `manifest.json.version` to that same version.
 * - Add/update the matching entry in `versions.json` using the current
 *   `manifest.json.minAppVersion`.
 *
 * This keeps Obsidian plugin metadata files aligned with `package.json`.
 */
import { readFileSync, writeFileSync } from 'fs';

const targetVersion = process.env.npm_package_version;

// read minAppVersion from manifest.json and bump version to target version
let manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync('manifest.json', JSON.stringify(manifest, null, '\t'));

// update versions.json with target version and minAppVersion from manifest.json
let versions = JSON.parse(readFileSync('versions.json', 'utf8'));
versions[targetVersion] = minAppVersion;
writeFileSync('versions.json', JSON.stringify(versions, null, '\t'));
