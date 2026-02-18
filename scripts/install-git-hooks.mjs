/**
 * Configures this repository to use tracked hooks from `.githooks/`.
 *
 * This sets:
 *   git config core.hooksPath .githooks
 *
 * It also marks hook files executable on Unix-like environments.
 */
import { execSync } from 'node:child_process';
import { chmodSync, existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const HOOKS_DIR = '.githooks';
const HOOK_FILES = ['pre-commit', 'pre-push'];

try {
    execSync(`git config core.hooksPath ${HOOKS_DIR}`, { stdio: 'inherit' });
} catch (error) {
    console.error('[hooks:install] Failed to set core.hooksPath to .githooks.');
    throw error;
}

for (const hookFile of HOOK_FILES) {
    const hookPath = path.join(process.cwd(), HOOKS_DIR, hookFile);
    if (!existsSync(hookPath)) {
        continue;
    }

    try {
        chmodSync(hookPath, 0o755);
    } catch (error) {
        console.warn(`[hooks:install] Could not chmod +x ${hookPath}`, error);
    }
}

console.log('[hooks:install] Git hooks installed from .githooks/');
