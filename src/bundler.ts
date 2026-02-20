import { rollup, type OutputChunk, type Plugin as RollupPlugin } from '@rollup/browser';
import { normalizePath, Notice } from 'obsidian';
import * as Babel from '@babel/standalone';
import { ReactNode } from 'react';
import type { EmeraPlugin } from './plugin';
import { EMERA_GET_SCOPE, EMERA_MODULES } from './consts';
import { getScope, ScopeNode } from './scope';
import { createLogger } from './logger';

// @ts-ignore not included in package types, but it's there!
const t = Babel.packages.types;

const someGlobalVars = new Set([
    'window',
    'self',
    'globalThis',
    'document',
    'console',
    'app',

    // Not really globals, but due to how Babel works, our plugin might replace those
    // before react plugin will add related imports, so we explicitly ignore them
    '_jsx',
    '_Fragment',
    '_jsxs',
]);

function resolvePath(base: string, relative: string) {
    const stack = base.split('/');
    const parts = relative.split('/');
    stack.pop(); // remove current file name (or empty string)

    for (let i = 0; i < parts.length; i++) {
        if (parts[i] === '.') continue;
        if (parts[i] === '..') stack.pop();
        else stack.push(parts[i]);
    }
    return stack.join('/');
}

const EMERA_VAULT_MODULE_PREFIX = 'emera://vault/';
export const EMERA_DEBUG_LOG_PATH = '.obsidian/plugins/emera/last-error.json';
const ROLLUP_WASM_FILE_PATH = '.obsidian/plugins/emera/bindings_wasm_bg.wasm';
const MAX_DEBUG_EVENTS = 5000;
const RUNTIME_EXTERNAL_IMPORT_PREFIXES = ['http://', 'https://'];

function isRuntimeExternalImport(moduleId: string): boolean {
    return RUNTIME_EXTERNAL_IMPORT_PREFIXES.some((prefix) => moduleId.startsWith(prefix));
}

function toVaultModuleId(vaultPath: string): string {
    const normalized = normalizePath(vaultPath).replace(/^\/+/, '');
    return `${EMERA_VAULT_MODULE_PREFIX}${normalized}`;
}

function fromVaultModuleId(moduleId: string): string {
    if (!moduleId.startsWith(EMERA_VAULT_MODULE_PREFIX)) {
        return moduleId;
    }
    return moduleId.slice(EMERA_VAULT_MODULE_PREFIX.length);
}

function importRewriter() {
    return {
        visitor: {
            ImportDeclaration(path: any) {
                const source = path.node.source.value;

                const ignoredPrefixes = ['.', 'http://', 'https://'];
                if (!ignoredPrefixes.some((p) => source.startsWith(p))) {
                    const specifiers = path.node.specifiers;

                    const properties = specifiers.map((specifier: any) => {
                        if (t.isImportSpecifier(specifier)) {
                            const importedName = t.isIdentifier(specifier.imported)
                                ? specifier.imported.name
                                : specifier.imported.value;
                            const importedKey = t.isValidIdentifier(importedName)
                                ? t.identifier(importedName)
                                : t.stringLiteral(importedName);
                            if (importedName === specifier.local.name) {
                                return t.objectProperty(
                                    importedKey,
                                    t.identifier(specifier.local.name),
                                    false,
                                    true,
                                );
                            } else {
                                return t.objectProperty(
                                    importedKey,
                                    t.identifier(specifier.local.name),
                                );
                            }
                        } else if (t.isImportDefaultSpecifier(specifier)) {
                            return t.objectProperty(
                                t.identifier('default'),
                                t.identifier(specifier.local.name),
                            );
                        }
                    });

                    const destructuring = t.variableDeclaration('const', [
                        t.variableDeclarator(
                            t.objectPattern(properties),
                            t.memberExpression(
                                t.memberExpression(
                                    t.identifier('window'),
                                    t.identifier(EMERA_MODULES),
                                ),
                                t.stringLiteral(source),
                                true,
                            ),
                        ),
                    ]);

                    path.replaceWith(destructuring);
                }
            },
        },
    };
}
Babel.registerPlugin('importRewriter', importRewriter);

function scopeRewriter() {
    function isStandaloneOrFirstInChain(path: any) {
        const parent = path.parent;

        if (t.isMemberExpression(parent)) {
            return parent.object === path.node;
        }

        if (t.isOptionalMemberExpression(parent)) {
            return parent.object === path.node;
        }

        return true;
    }

    function isPartOfObjectPattern(path: any) {
        const scopeBlock = path.scope.block;
        if (t.isProgram(scopeBlock) || t.isBlockStatement(scopeBlock)) {
            for (const statement of scopeBlock.body) {
                if (t.isVariableDeclaration(statement)) {
                    for (const declarator of statement.declarations) {
                        if (t.isObjectPattern(declarator.id)) {
                            for (const property of declarator.id.properties) {
                                if (
                                    t.isObjectProperty(property) &&
                                    t.isIdentifier(property.key) &&
                                    property.key.name === path.node.name &&
                                    t.isIdentifier(property.value) &&
                                    property.value.name !== path.node.name
                                ) {
                                    return true;
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    function isIdentifierReExported(path: any): boolean {
        const program = path.findParent((p: any) => p.isProgram());

        if (!program) return false;

        return program.node.body.some((node: any) => {
            if (t.isExportNamedDeclaration(node) && node.source) {
                return node.specifiers.some((specifier: any) => {
                    if (t.isExportSpecifier(specifier)) {
                        return (
                            (t.isIdentifier(specifier.exported) &&
                                specifier.exported.name === path.node.name) ||
                            (t.isIdentifier(specifier.local) &&
                                specifier.local.name === path.node.name)
                        );
                    }
                    return false;
                });
            }
            return false;
        });
    }

    function isObjectKey(identifierPath: any): boolean {
        const parent = identifierPath.parentPath;

        if (parent.isObjectProperty()) {
            return parent.node.key === identifierPath.node && !parent.node.computed;
        }

        return false;
    }

    function isPartOfTypeofUndefinedCheck(nodePath: any) {
        const path = nodePath.type ? nodePath : nodePath.get('expression');

        // Check if it's not an Identifier
        if (path.node.type !== 'Identifier') {
            return false;
        }

        let parentPath = path.parentPath;

        // Check if it's the operand of a typeof operator
        if (parentPath && parentPath.isUnaryExpression({ operator: 'typeof' })) {
            return true;
        }

        // Check if it's the alternate of a ConditionalExpression (ternary)
        if (
            parentPath &&
            parentPath.isConditionalExpression() &&
            parentPath.node.alternate === path.node
        ) {
            const test = parentPath.node.test;
            if (
                !test ||
                test.type !== 'BinaryExpression' ||
                (test.operator !== '===' && test.operator !== '==')
            )
                return false;
            const isUnary = (node: any) =>
                node.type === 'UnaryExpression' &&
                node.operator === 'typeof' &&
                node.argument.type === 'Identifier' &&
                node.argument.name === path.node.name;
            const isUndefined = (node: any) =>
                node.type === 'StringLiteral' && node.value === 'undefined';

            return (
                (isUnary(test.left) && isUndefined(test.right)) ||
                (isUnary(test.right) && isUndefined(test.left))
            );
        }

        return false;
    }

    function isPartOfScopeHasCheck(path: any, identifierName: string) {
        // Check if the identifier is part of a conditional expression
        const conditionalExpression = path.findParent((p: any) => p.isConditionalExpression());
        if (!conditionalExpression) return false;

        // Check the structure of the test part of the conditional
        const test = conditionalExpression.get('test');
        if (!test.isCallExpression()) return false;

        const callee = test.get('callee');
        if (!callee.isMemberExpression()) return false;

        // Check if it matches window._emeraGetScope("test").has("<identifier>")
        if (
            callee.get('object').get('callee').matchesPattern(`window.${EMERA_GET_SCOPE}`) &&
            callee.get('property').isIdentifier({ name: 'has' }) &&
            test.get('arguments')[0].isStringLiteral({ value: identifierName })
        ) {
            const consequent = conditionalExpression.get('consequent');
            if (
                consequent.isCallExpression() &&
                consequent.get('callee').isMemberExpression() &&
                consequent
                    .get('callee')
                    .get('object')
                    .get('callee')
                    .matchesPattern('window._emeraGetScope') &&
                consequent.get('callee').get('property').isIdentifier({ name: 'get' }) &&
                consequent.get('arguments')[0].isStringLiteral({ value: identifierName })
            ) {
                // Check the alternate part
                const alternate = conditionalExpression.get('alternate');
                return alternate.isIdentifier({ name: identifierName });
            }
        }

        return false;
    }

    return {
        // Need to run this last

        visitor: {
            Identifier(path: any, state: any) {
                const scope = state.opts.scope as ScopeNode;

                const name = path.node.name;

                const firstIdentifier = isStandaloneOrFirstInChain(path);
                if (!firstIdentifier) return;
                if (!path.isReferencedIdentifier()) return;
                if (someGlobalVars.has(name)) return;

                const binding = path.scope.getBinding(name);
                if (binding) return;

                if (isPartOfObjectPattern(path)) return;
                if (isIdentifierReExported(path)) return;
                if (isObjectKey(path)) return;
                if (isPartOfTypeofUndefinedCheck(path)) return;
                if (isPartOfScopeHasCheck(path, name)) return;

                const replacement = t.parenthesizedExpression(
                    t.conditionalExpression(
                        t.callExpression(
                            t.memberExpression(
                                t.callExpression(
                                    t.memberExpression(
                                        t.identifier('window'),
                                        t.identifier(EMERA_GET_SCOPE),
                                    ),
                                    [t.stringLiteral(scope.id)],
                                ),
                                t.identifier('has'),
                            ),
                            [t.stringLiteral(name)],
                        ),
                        t.callExpression(
                            t.memberExpression(
                                t.callExpression(
                                    t.memberExpression(
                                        t.identifier('window'),
                                        t.identifier(EMERA_GET_SCOPE),
                                    ),
                                    [t.stringLiteral(scope.id)],
                                ),
                                t.identifier('get'),
                            ),
                            [t.stringLiteral(name)],
                        ),
                        t.identifier(name),
                    ),
                );

                // console.log('Replacing node with');
                // @ts-ignore
                // console.log(Babel.packages.generator.default(replacement).code);

                path.replaceWith(replacement);
            },
        },
    };
}
Babel.registerPlugin('scopeRewriter', scopeRewriter);

type TranspileCodeOptions = {
    rewriteImports?: boolean;
    scope?: ScopeNode;
};

type DebugRecorder = (stage: string, data?: unknown) => void;

export type LoadTrigger = 'startup' | 'refresh' | 'auto-refresh';

function truncateString(value: string, maxLength = 2000): string {
    if (value.length <= maxLength) {
        return value;
    }
    return `${value.slice(0, maxLength)}… [truncated ${value.length - maxLength} chars]`;
}

function toSerializable(value: unknown, depth = 0): unknown {
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

function createDebugRecorder(
    trace: Array<{ at: string; stage: string; data: unknown }>,
): DebugRecorder {
    return (stage: string, data: unknown = {}) => {
        if (trace.length >= MAX_DEBUG_EVENTS) {
            return;
        }
        trace.push({
            at: new Date().toISOString(),
            stage,
            data: toSerializable(data),
        });
    };
}

const formatErrorForNotice = (error: unknown): string => {
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

const writeDebugLog = async (
    plugin: EmeraPlugin,
    payload: Record<string, unknown>,
): Promise<string | null> => {
    const logger = createLogger(plugin, 'bundler');
    try {
        await plugin.app.vault.adapter.write(
            EMERA_DEBUG_LOG_PATH,
            JSON.stringify(payload, null, 2),
        );
        return EMERA_DEBUG_LOG_PATH;
    } catch (writeError) {
        logger.error('Failed to write debug error file', writeError);
        return null;
    }
};

const withRollupWasmUrlPatch = async <T>(
    plugin: EmeraPlugin,
    recordDebug: DebugRecorder,
    run: () => Promise<T>,
): Promise<T> => {
    const originalURL = globalThis.URL;
    if (typeof originalURL !== 'function') {
        recordDebug('bundle.rollup.urlPatch.skipped.noUrlConstructor');
        return run();
    }

    const wasmExists = await plugin.app.vault.adapter.exists(ROLLUP_WASM_FILE_PATH);
    if (!wasmExists) {
        recordDebug('bundle.rollup.urlPatch.skipped.noWasmFile', {
            wasmPath: ROLLUP_WASM_FILE_PATH,
        });
        throw new Error(
            `Missing Rollup WASM runtime at "${ROLLUP_WASM_FILE_PATH}". Re-deploy the plugin so "bindings_wasm_bg.wasm" is copied.`,
        );
    }

    const wasmBinary = await plugin.app.vault.adapter.readBinary(ROLLUP_WASM_FILE_PATH);
    const wasmBlobUrl = originalURL.createObjectURL(
        new Blob([wasmBinary], { type: 'application/wasm' }),
    );

    recordDebug('bundle.rollup.urlPatch.prepared', {
        wasmPath: ROLLUP_WASM_FILE_PATH,
        wasmSize: wasmBinary.byteLength,
        wasmBlobUrl,
    });

    class PatchedURL extends originalURL {
        constructor(url: string | URL, base?: string | URL) {
            const urlString = typeof url === 'string' ? url : String(url);
            const isRollupWasmRequest = urlString.endsWith('bindings_wasm_bg.wasm');

            if (isRollupWasmRequest) {
                try {
                    super(url, base);
                    return;
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    if (message.includes('Invalid URL')) {
                        super(wasmBlobUrl);
                        return;
                    }
                    throw error;
                }
            }

            super(url, base);
        }
    }

    Object.defineProperty(globalThis, 'URL', {
        configurable: true,
        writable: true,
        value: PatchedURL,
    });
    recordDebug('bundle.rollup.urlPatch.enabled');

    try {
        return await run();
    } finally {
        Object.defineProperty(globalThis, 'URL', {
            configurable: true,
            writable: true,
            value: originalURL,
        });
        originalURL.revokeObjectURL(wasmBlobUrl);
        recordDebug('bundle.rollup.urlPatch.restored');
    }
};

export const transpileCode = (
    code: string,
    { rewriteImports = true, scope }: TranspileCodeOptions = {},
) => {
    const transpiled = Babel.transform(code, {
        sourceType: 'unambiguous',
        presets: [
            [
                Babel.availablePresets['react'],
                {
                    runtime: 'automatic',
                },
            ],
            [
                Babel.availablePresets['typescript'],
                {
                    onlyRemoveTypeImports: true,
                    allExtensions: true,
                    isTSX: true,
                },
            ],
        ],
        plugins: [
            ...(rewriteImports ? [Babel.availablePlugins['importRewriter']] : []),
            [Babel.availablePlugins['scopeRewriter'], { scope: scope ?? getScope('root') }],
        ],
    }).code;
    if (!transpiled) {
        throw new Error('Babel failed :(');
    }
    // console.log('Original', code);
    // console.log(transpiled);
    return transpiled;
};

// @ts-ignore
window.transpileCode = transpileCode;

const rollupVirtualFsPlugin = (
    plugin: EmeraPlugin,
    path: string,
    recordDebug?: DebugRecorder,
): RollupPlugin => ({
    name: 'virtualFs',
    async resolveId(source, importer) {
        recordDebug?.('rollup.resolveId.call', { source, importer });
        if (source === path || source === toVaultModuleId(path)) {
            const moduleId = toVaultModuleId(path);
            recordDebug?.('rollup.resolveId.entry', { source, moduleId });
            return moduleId;
        }

        if (isRuntimeExternalImport(source)) {
            recordDebug?.('rollup.resolveId.external-runtime-url', { source, importer });
            return {
                id: source,
                external: true,
            };
        }

        if (importer && (source.startsWith('./') || source.startsWith('../'))) {
            const importerPath = fromVaultModuleId(importer);
            const resolvedPath = resolvePath(importerPath, source);
            const extensions = ['.js', '.jsx', '.ts', '.tsx', '.css'];
            recordDebug?.('rollup.resolveId.relative', { source, importerPath, resolvedPath });

            if (extensions.some((ext) => resolvedPath.endsWith(ext))) {
                const exists = await plugin.app.vault.adapter.exists(resolvedPath);
                recordDebug?.('rollup.resolveId.check', { candidate: resolvedPath, exists });
                if (exists) {
                    const resolvedModuleId = toVaultModuleId(resolvedPath);
                    recordDebug?.('rollup.resolveId.hit', {
                        source,
                        importerPath,
                        resolvedPath,
                        resolvedModuleId,
                    });
                    return resolvedModuleId;
                }
            }

            for (const ext of extensions) {
                const pathWithExt = `${resolvedPath}${ext}`;
                const exists = await plugin.app.vault.adapter.exists(pathWithExt);
                recordDebug?.('rollup.resolveId.check', { candidate: pathWithExt, exists });
                if (exists) {
                    const resolvedModuleId = toVaultModuleId(pathWithExt);
                    recordDebug?.('rollup.resolveId.hit', {
                        source,
                        importerPath,
                        resolvedPath: pathWithExt,
                        resolvedModuleId,
                    });
                    return resolvedModuleId;
                }
            }

            recordDebug?.('rollup.resolveId.miss', { source, importerPath, resolvedPath });
            throw new Error(
                `Unable to resolve import "${source}" from "${importerPath}". Tried "${resolvedPath}" and ${extensions
                    .map((ext) => `"${resolvedPath}${ext}"`)
                    .join(', ')}.`,
            );
        }

        recordDebug?.('rollup.resolveId.external-or-unhandled', { source, importer });
        return null;
    },
    async load(id) {
        const vaultPath = fromVaultModuleId(id);
        const exists = await plugin.app.vault.adapter.exists(vaultPath);
        recordDebug?.('rollup.load', { id, vaultPath, exists });
        if (!exists) {
            return null;
        }
        const content = await plugin.app.vault.adapter.read(vaultPath);
        recordDebug?.('rollup.load.success', { id, vaultPath, contentLength: content.length });
        return content;
    },
});

const rollupBabelPlugin = (_plugin: EmeraPlugin, recordDebug?: DebugRecorder): RollupPlugin => ({
    name: 'babel-plugin',
    transform(code, id) {
        recordDebug?.('rollup.transform.babel', { id, inputLength: code.length });
        return { code: transpileCode(code) };
    },
});

const rollupCssPlugin = (_plugin: EmeraPlugin, recordDebug?: DebugRecorder): RollupPlugin => ({
    name: 'emera-styles',
    transform(code, id) {
        if (!id.endsWith('.css')) return;
        recordDebug?.('rollup.transform.css', { id, inputLength: code.length });

        const injectionCode = `
          (function() {
            var style = document.createElement('style');
            style.textContent = ${JSON.stringify(code)};
            document.head.appendChild(style);
          })();
        `;

        return { code: injectionCode };
    },
});

export const bundleFile = async (
    plugin: EmeraPlugin,
    path: string,
    recordDebug?: DebugRecorder,
) => {
    const logger = createLogger(plugin, 'bundler');
    const debug = recordDebug ?? (() => undefined);
    logger.debug('Bundling entry file', { path });
    const entryId = toVaultModuleId(path);
    debug('bundle.start', { path, entryId });

    const bundle = await withRollupWasmUrlPatch(plugin, debug, () =>
        rollup({
            input: entryId,
            plugins: [
                rollupVirtualFsPlugin(plugin, path, recordDebug),
                rollupCssPlugin(plugin, recordDebug),
                rollupBabelPlugin(plugin, recordDebug),
            ],
        }),
    );
    debug('bundle.rollup.created', { path, entryId });

    const { output } = await bundle.generate({
        format: 'es',
        // Keep a single module string so runtime import works from Blob URL.
        inlineDynamicImports: true,
    });
    debug('bundle.generate.done', {
        outputCount: output.length,
        outputTypes: output.map((file) => file.type),
    });

    const chunks = output.filter((file): file is OutputChunk => file.type === 'chunk');
    if (chunks.length !== 1) {
        debug('bundle.error.chunk-count', { chunksLength: chunks.length });
        throw new Error(`Expected a single bundled chunk for "${path}", but got ${chunks.length}.`);
    }

    const [entryChunk] = chunks;
    debug('bundle.chunk.entry', {
        fileName: entryChunk.fileName,
        codeLength: entryChunk.code.length,
        imports: entryChunk.imports,
        dynamicImports: entryChunk.dynamicImports,
    });
    const unresolvedImports = entryChunk.imports.filter(
        (moduleId) => !isRuntimeExternalImport(moduleId),
    );
    const unresolvedDynamicImports = entryChunk.dynamicImports.filter(
        (moduleId) => !isRuntimeExternalImport(moduleId),
    );

    if (entryChunk.imports.length > 0 || entryChunk.dynamicImports.length > 0) {
        debug('bundle.chunk.runtime-imports', {
            imports: entryChunk.imports,
            dynamicImports: entryChunk.dynamicImports,
            unresolvedImports,
            unresolvedDynamicImports,
        });
    }

    if (unresolvedImports.length > 0 || unresolvedDynamicImports.length > 0) {
        debug('bundle.error.chunk-imports', {
            imports: unresolvedImports,
            dynamicImports: unresolvedDynamicImports,
        });
        throw new Error(
            `Bundled chunk still contains unresolved imports (imports: ${
                unresolvedImports.join(', ') || 'none'
            }, dynamicImports: ${unresolvedDynamicImports.join(', ') || 'none'}).`,
        );
    }

    await bundle.close();
    debug('bundle.complete', { codeLength: entryChunk.code.length });
    return entryChunk.code;
};

export const importFromString = async (
    code: string,
    ignoreCache = true,
    recordDebug?: DebugRecorder,
) => {
    recordDebug?.('importFromString.start', { ignoreCache, inputLength: code.length });
    if (ignoreCache) {
        code = `// Cache buster: ${Math.random()}\n\n` + code;
        recordDebug?.('importFromString.cache-busted', { outputLength: code.length });
    }

    // Blob URLs are resilient for large generated modules and avoid data URL length limits.
    const blob = new Blob([code], { type: 'text/javascript' });
    recordDebug?.('importFromString.blob-created', { size: blob.size, type: blob.type });
    const blobUrl = URL.createObjectURL(blob);
    recordDebug?.('importFromString.blob-url', { blobUrl });
    try {
        const imported = await import(blobUrl);
        recordDebug?.('importFromString.success', {
            exportKeys: Object.keys(imported).slice(0, 100),
            exportCount: Object.keys(imported).length,
        });
        return imported;
    } catch (error) {
        recordDebug?.('importFromString.error', { error: toSerializable(error) });
        console.error('[Emera] Failed to import generated module from Blob URL', error);
        throw error;
    } finally {
        URL.revokeObjectURL(blobUrl);
        recordDebug?.('importFromString.blob-url-revoked', { blobUrl });
    }
};

export const compileJsxIntoFactory = async (
    jsx: string,
    scope?: ScopeNode,
): Promise<() => ReactNode> => {
    const source = `export default () => {
        return (<>${jsx}</>);
    };`;
    // console.log('====== Scope', scope);
    // console.log('====== Original JSX');
    // console.log(jsx);
    const transpiled = transpileCode(source, {
        scope,
    });
    // console.log('====== Compiled JSX code');
    // console.log(transpiled);
    const { default: factory } = await importFromString(transpiled);
    return factory;
};

export type LoadUserModuleResult = {
    registry: Record<string, any>;
    ok: boolean;
};

export const loadUserModule = async (
    plugin: EmeraPlugin,
    trigger: LoadTrigger = 'refresh',
): Promise<LoadUserModuleResult> => {
    const logger = createLogger(plugin, 'bundler');
    const timeline: Array<{ at: string; stage: string; data: unknown }> = [];
    const recordDebug = createDebugRecorder(timeline);

    const finalize = async ({
        ok,
        phase,
        error,
        context,
        registry,
    }: {
        ok: boolean;
        phase: 'bundle' | 'import' | 'success';
        error?: unknown;
        context: Record<string, unknown>;
        registry: Record<string, unknown>;
    }): Promise<LoadUserModuleResult & { debugPath: string | null }> => {
        const errorText = error ? formatErrorForNotice(error) : null;
        const errorStack =
            error instanceof Error
                ? truncateString(error.stack ?? '')
                : error &&
                    typeof error === 'object' &&
                    'stack' in (error as Record<string, unknown>)
                  ? toSerializable((error as Record<string, unknown>).stack)
                  : null;

        const debugPath = await writeDebugLog(plugin, {
            phase,
            trigger,
            ok,
            occurredAt: new Date().toISOString(),
            errorText,
            errorStack,
            error: error ? toSerializable(error) : null,
            context: toSerializable(context),
            timeline,
        });

        return {
            registry,
            ok,
            debugPath,
        };
    };

    recordDebug('loadUserModule.start', {
        trigger,
        componentsFolder: plugin.settings.componentsFolder,
        pluginVersion: plugin.manifest.version,
    });

    const extensions = ['js', 'jsx', 'ts', 'tsx'];
    let indexFile: string | null = null;
    for (const ext of extensions) {
        const path = normalizePath(`${plugin.settings.componentsFolder}/index.${ext}`);
        const exists = await plugin.app.vault.adapter.exists(path);
        recordDebug('loadUserModule.indexCandidate', { path, exists });
        if (exists) {
            indexFile = path;
            break;
        }
    }

    if (!indexFile) {
        const error = new Error(
            `Index file not found in "${plugin.settings.componentsFolder}" (tried: ${extensions
                .map((ext) => `index.${ext}`)
                .join(', ')})`,
        );
        recordDebug('loadUserModule.error.noIndex', { error: toSerializable(error) });
        const { registry, ok, debugPath } = await finalize({
            ok: false,
            phase: 'bundle',
            error,
            context: {
                componentsFolder: plugin.settings.componentsFolder,
                attemptedExtensions: extensions,
            },
            registry: {},
        });
        new Notice('Error happened while bundling components: ' + error.message);
        if (debugPath) {
            new Notice(`Emera debug details written to ${debugPath}`);
        }
        return { registry, ok };
    }

    recordDebug('loadUserModule.indexSelected', { indexFile });
    logger.debug('Loading index file', { indexFile });

    let bundledCode = '';
    try {
        bundledCode = await bundleFile(plugin, indexFile, recordDebug);
        recordDebug('loadUserModule.bundleSuccess', { bundledCodeLength: bundledCode.length });
    } catch (err) {
        recordDebug('loadUserModule.bundleError', { error: toSerializable(err) });
        const { registry, ok, debugPath } = await finalize({
            ok: false,
            phase: 'bundle',
            error: err,
            context: {
                indexFile,
            },
            registry: {},
        });
        const details = formatErrorForNotice(err);
        logger.error('Failed to bundle user module', {
            indexFile,
            error: err,
        });
        new Notice('Error happened while bundling components: ' + details);
        if (debugPath) {
            new Notice(`Emera debug details written to ${debugPath}`);
        }
        return { registry, ok };
    }

    try {
        const registry = await importFromString(bundledCode, true, recordDebug);
        recordDebug('loadUserModule.importSuccess', {
            exportCount: Object.keys(registry).length,
            exportKeysPreview: Object.keys(registry).slice(0, 100),
        });
        const result = await finalize({
            ok: true,
            phase: 'success',
            context: {
                indexFile,
                bundledCodeLength: bundledCode.length,
                exportCount: Object.keys(registry).length,
            },
            registry,
        });
        return {
            registry: result.registry,
            ok: result.ok,
        };
    } catch (err) {
        recordDebug('loadUserModule.importError', { error: toSerializable(err) });
        const { registry, ok, debugPath } = await finalize({
            ok: false,
            phase: 'import',
            error: err,
            context: {
                indexFile,
                bundledCodeLength: bundledCode.length,
                bundledCodePreview: bundledCode.slice(0, 1200),
            },
            registry: {},
        });
        const details = formatErrorForNotice(err);
        logger.error('Failed to import bundled user module', {
            indexFile,
            bundledCodeLength: bundledCode.length,
            bundledCodePreview: bundledCode.slice(0, 800),
            error: err,
        });
        new Notice('Error happened while loading components: ' + details);
        if (debugPath) {
            new Notice(`Emera debug details written to ${debugPath}`);
        }
        return { registry, ok };
    }
};
