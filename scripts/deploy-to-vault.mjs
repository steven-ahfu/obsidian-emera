/**
 * Syncs built Emera plugin artifacts from this repository into a local Obsidian vault.
 *
 * Purpose:
 * - Speed up local development by copying production outputs directly to
 *   <vault>/.obsidian/plugins/<plugin-id>.
 * - Include all required runtime files (`main.js`, `manifest.json`, `styles.css`,
 *   and Rollup's `bindings_wasm_bg.wasm`) so refresh and bundling work in-vault.
 *
 * Configuration:
 * - `EMERA_VAULT_PATH` (required): vault root path.
 * - `EMERA_PLUGIN_ID` (optional): plugin folder name, defaults to `emera`.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const BUILD_ARTIFACTS = [
    { source: 'main.js', destination: 'main.js' },
    { source: 'manifest.json', destination: 'manifest.json' },
    { source: 'styles.css', destination: 'styles.css' },
    {
        source: 'node_modules/@rollup/browser/dist/bindings_wasm_bg.wasm',
        destination: 'bindings_wasm_bg.wasm',
    },
];

function normalizeVaultPath(rawVaultPath) {
    const trimmed = rawVaultPath.trim();

    // When running in WSL/Linux, convert Windows-style paths into /mnt/<drive>/...
    if (process.platform !== 'win32' && /^[A-Za-z]:[\\/]/.test(trimmed)) {
        const drive = trimmed[0].toLowerCase();
        const rest = trimmed.slice(2).replace(/\\/g, '/');
        return `/mnt/${drive}${rest.startsWith('/') ? rest : `/${rest}`}`;
    }

    return trimmed;
}

function fail(message) {
    console.error(`[deploy:vault] ${message}`);
    process.exit(1);
}

const rawVaultPath = process.env.EMERA_VAULT_PATH;
const pluginId = (process.env.EMERA_PLUGIN_ID ?? 'emera').trim();

if (!rawVaultPath) {
    fail('EMERA_VAULT_PATH is missing. Copy .env.example to .env.local and set your vault path.');
}

if (!pluginId) {
    fail('EMERA_PLUGIN_ID cannot be empty.');
}

const vaultPath = path.resolve(normalizeVaultPath(rawVaultPath));
if (!existsSync(vaultPath)) {
    fail(`Vault path does not exist: ${vaultPath}`);
}

const pluginDir = path.join(vaultPath, '.obsidian', 'plugins', pluginId);
mkdirSync(pluginDir, { recursive: true });

for (const artifact of BUILD_ARTIFACTS) {
    const source = path.resolve(artifact.source);
    if (!existsSync(source)) {
        fail(`Required artifact is missing: ${source}. Run yarn install and yarn build first.`);
    }

    const destination = path.join(pluginDir, artifact.destination);
    copyFileSync(source, destination);
}

console.log(
    `[deploy:vault] Synced ${BUILD_ARTIFACTS.map(({ destination }) => destination).join(', ')} to ${pluginDir}`,
);
