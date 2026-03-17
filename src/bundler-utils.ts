/**
 * Pure utility functions extracted from bundler.ts for testability.
 * These have no dependency on Obsidian, Rollup, or Babel.
 */

const EMERA_VAULT_MODULE_PREFIX = 'emera://vault/';
const RUNTIME_EXTERNAL_IMPORT_PREFIXES = ['http://', 'https://'];

export function resolvePath(base: string, relative: string) {
    const stack = base.split('/');
    const parts = relative.split('/');
    stack.pop(); // remove current file name (or empty string)

    for (let i = 0; i < parts.length; i++) {
        if (parts[i] === '.') continue;
        if (parts[i] === '..') stack.pop();
        else stack.push(parts[i]);
    }
    const resolved = stack.join('/');
    if (resolved.startsWith('..') || resolved.startsWith('/')) {
        throw new Error(`Import path escapes vault root: ${relative}`);
    }
    return resolved;
}

export function isRuntimeExternalImport(moduleId: string): boolean {
    return RUNTIME_EXTERNAL_IMPORT_PREFIXES.some((prefix) => moduleId.startsWith(prefix));
}

export function toVaultModuleId(vaultPath: string): string {
    // normalizePath equivalent: replace backslashes with forward slashes
    const normalized = vaultPath.replace(/\\/g, '/').replace(/^\/+/, '');
    return `${EMERA_VAULT_MODULE_PREFIX}${normalized}`;
}

export function fromVaultModuleId(moduleId: string): string {
    if (!moduleId.startsWith(EMERA_VAULT_MODULE_PREFIX)) {
        return moduleId;
    }
    return moduleId.slice(EMERA_VAULT_MODULE_PREFIX.length);
}

export function truncateString(value: string, maxLength = 2000): string {
    if (value.length <= maxLength) {
        return value;
    }
    return `${value.slice(0, maxLength)}… [truncated ${value.length - maxLength} chars]`;
}

export function toSerializable(value: unknown, depth = 0): unknown {
    if (depth > 5) {
        return '[MaxDepth]';
    }

    if (value == null || typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }

    if (typeof value === 'string') {
        return truncateString(value);
    }

    if (typeof value === 'function') {
        return `[Function ${value.name || 'anonymous'}]`;
    }

    if (value instanceof Error) {
        const errorRecord: Record<string, unknown> = {
            name: value.name,
            message: value.message,
            stack: truncateString(value.stack ?? ''),
        };
        const cause = (value as Error & { cause?: unknown }).cause;
        if (cause !== undefined) {
            errorRecord.cause = toSerializable(cause, depth + 1);
        }
        return errorRecord;
    }

    if (Array.isArray(value)) {
        return value.slice(0, 200).map((item) => toSerializable(item, depth + 1));
    }

    if (typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>).slice(0, 200);
        const record: Record<string, unknown> = {};
        for (const [key, val] of entries) {
            record[key] = toSerializable(val, depth + 1);
        }
        return record;
    }

    return String(value);
}

export const formatErrorForNotice = (error: unknown): string => {
    if (error instanceof Error) {
        return error.message || error.toString();
    }

    if (typeof error === 'string') {
        return error;
    }

    if (error && typeof error === 'object') {
        const maybeRollup = error as {
            message?: string;
            plugin?: string;
            id?: string;
            loc?: { line?: number; column?: number; file?: string };
            frame?: string;
        };

        const parts: string[] = [];
        if (maybeRollup.message) parts.push(maybeRollup.message);
        if (maybeRollup.plugin) parts.push(`plugin: ${maybeRollup.plugin}`);
        if (maybeRollup.id) parts.push(`file: ${maybeRollup.id}`);
        if (maybeRollup.loc) {
            const file = maybeRollup.loc.file ? `${maybeRollup.loc.file}:` : '';
            const line = maybeRollup.loc.line ?? '?';
            const column = maybeRollup.loc.column ?? '?';
            parts.push(`loc: ${file}${line}:${column}`);
        }
        if (maybeRollup.frame) {
            const frameFirstLine = maybeRollup.frame.split('\n')[0];
            if (frameFirstLine) parts.push(`frame: ${frameFirstLine}`);
        }

        if (parts.length > 0) {
            return parts.join(' | ');
        }

        try {
            return JSON.stringify(error, Object.getOwnPropertyNames(error), 2);
        } catch {
            // no-op
        }
    }

    return String(error);
};
