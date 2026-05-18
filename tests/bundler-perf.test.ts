import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    EMERA_DEBUG_LOG_PATH,
    _clearWasmCacheForTest,
    _withRollupWasmUrlPatchForTest,
    loadUserModule,
} from '../src/bundler';

const WASM_PATH = '.obsidian/plugins/emera/bindings_wasm_bg.wasm';
const FAKE_WASM = new Uint8Array([0x00, 0x61, 0x73, 0x6d]).buffer;

type AdapterLike = {
    exists: ReturnType<typeof vi.fn>;
    read: ReturnType<typeof vi.fn>;
    readBinary: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
};

type PluginLike = {
    settings: { componentsFolders: string[]; componentsFolder: string; debugLoggingEnabled: boolean };
    manifest: { version: string };
    componentExportConflicts: string[];
    app: { vault: { adapter: AdapterLike } };
};

const createPlugin = (files: Record<string, string> = {}): { plugin: PluginLike; adapter: AdapterLike } => {
    const adapter: AdapterLike = {
        exists: vi.fn(async (path: string) => path in files || path === WASM_PATH),
        read: vi.fn(async (path: string) => files[path] ?? ''),
        readBinary: vi.fn(async () => FAKE_WASM),
        write: vi.fn(async () => undefined),
    };

    const plugin: PluginLike = {
        settings: {
            componentsFolders: ['Components'],
            componentsFolder: 'Components',
            debugLoggingEnabled: false,
        },
        manifest: { version: '0.0.0' },
        componentExportConflicts: [],
        app: { vault: { adapter } },
    };

    return { plugin, adapter };
};

describe('WASM binary caching', () => {
    beforeEach(() => {
        _clearWasmCacheForTest();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        _clearWasmCacheForTest();
    });

    it('reads the WASM binary only once across multiple patch invocations', async () => {
        const { plugin, adapter } = createPlugin();
        const noopRun = () => Promise.resolve('ok' as const);

        await _withRollupWasmUrlPatchForTest(plugin as never, () => {}, noopRun);
        await _withRollupWasmUrlPatchForTest(plugin as never, () => {}, noopRun);

        const readBinaryCalls = (adapter.readBinary as ReturnType<typeof vi.fn>).mock.calls.filter(
            ([path]: [string]) => path === WASM_PATH,
        );
        expect(readBinaryCalls).toHaveLength(1);
    });

    it('does not re-check wasm file existence after first load', async () => {
        const { plugin, adapter } = createPlugin();
        const noopRun = () => Promise.resolve('ok' as const);

        await _withRollupWasmUrlPatchForTest(plugin as never, () => {}, noopRun);
        await _withRollupWasmUrlPatchForTest(plugin as never, () => {}, noopRun);

        const existsCalls = (adapter.exists as ReturnType<typeof vi.fn>).mock.calls.filter(
            ([path]: [string]) => path === WASM_PATH,
        );
        expect(existsCalls).toHaveLength(1);
    });
});

describe('debug log on success', () => {
    beforeEach(() => {
        _clearWasmCacheForTest();
        (globalThis as any).document = {
            head: { querySelectorAll: () => [] },
        };
    });

    afterEach(() => {
        vi.restoreAllMocks();
        _clearWasmCacheForTest();
        delete (globalThis as any).document;
    });

    it('does not write the debug log when loadUserModule fails at index-lookup (no bundling)', async () => {
        const { plugin, adapter } = createPlugin({
            // no index file -> fails before bundling
        });

        await loadUserModule(plugin as never, 'startup');

        const writeCalls = (adapter.write as ReturnType<typeof vi.fn>).mock.calls;
        const debugWriteCalls = writeCalls.filter(([path]: [string]) => path === EMERA_DEBUG_LOG_PATH);
        expect(debugWriteCalls).toHaveLength(1);
    });
});
