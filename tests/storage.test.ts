import { getDefaultStore } from 'jotai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmeraStorage } from '../src/emera-module/storage';

type AdapterLike = {
    exists: ReturnType<typeof vi.fn>;
    read: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
};

type PluginLike = {
    settings: {
        componentsFolder: string;
        debugLoggingEnabled: boolean;
    };
    app: {
        vault: {
            adapter: AdapterLike;
        };
    };
};

const createPlugin = () => {
    const adapter: AdapterLike = {
        exists: vi.fn(async () => false),
        read: vi.fn(async () => ''),
        write: vi.fn(async () => undefined),
    };

    const plugin = {
        settings: {
            componentsFolder: 'Components',
            debugLoggingEnabled: false,
        },
        app: {
            vault: {
                adapter,
            },
        },
    } satisfies PluginLike;

    return { plugin, adapter };
};

describe('createEmeraStorage', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('loads persisted state during init', async () => {
        const { plugin, adapter } = createPlugin();
        adapter.exists.mockResolvedValue(true);
        adapter.read.mockResolvedValue('{"count":2}');

        const storage = createEmeraStorage(plugin as never);
        await storage.init();

        expect(adapter.exists).toHaveBeenCalledWith('Components/storage.json');
        expect(adapter.read).toHaveBeenCalledWith('Components/storage.json');
        expect(storage.get('count')).toBe(2);

        storage.destroy();
    });

    it('warns and keeps going when persisted state cannot be parsed', async () => {
        const { plugin, adapter } = createPlugin();
        adapter.exists.mockResolvedValue(true);
        adapter.read.mockResolvedValue('{bad json');
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        const storage = createEmeraStorage(plugin as never);
        await storage.init();

        expect(warnSpy).toHaveBeenCalledWith(
            '[Emera:storage]',
            "Storage file exists but couldn't be parsed",
            { filePath: 'Components/storage.json' },
        );
        expect(storage.get('count')).toBeUndefined();

        storage.destroy();
    });

    it('reuses atoms per key and persists updates after the debounce window', async () => {
        vi.useFakeTimers();
        const { plugin, adapter } = createPlugin();
        const storage = createEmeraStorage(plugin as never);
        const atom = storage.getAtom('count', 1);

        expect(storage.getAtom('count', 999)).toBe(atom);

        const store = getDefaultStore();
        store.set(atom as never, 2);
        await vi.advanceTimersByTimeAsync(100);

        expect(adapter.write).toHaveBeenCalledTimes(1);
        expect(adapter.write).toHaveBeenCalledWith(
            'Components/storage.json',
            JSON.stringify({ count: 2 }, null, 4),
        );

        storage.destroy();
    });

    it('flushes pending state immediately when destroyed', () => {
        vi.useFakeTimers();
        const { plugin, adapter } = createPlugin();
        const storage = createEmeraStorage(plugin as never);
        const atom = storage.getAtom('count', 1);

        getDefaultStore().set(atom as never, 3);
        storage.destroy();

        expect(adapter.write).toHaveBeenCalledTimes(1);
        expect(adapter.write).toHaveBeenCalledWith(
            'Components/storage.json',
            JSON.stringify({ count: 3 }, null, 4),
        );
    });

    it('logs debounce flush failures and allows later retries', async () => {
        vi.useFakeTimers();
        const { plugin, adapter } = createPlugin();
        const error = new Error('disk full');
        adapter.write.mockRejectedValueOnce(error).mockResolvedValueOnce(undefined);
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const storage = createEmeraStorage(plugin as never);
        const atom = storage.getAtom('count', 1);
        const store = getDefaultStore();

        store.set(atom as never, 2);
        await vi.advanceTimersByTimeAsync(100);

        expect(errorSpy).toHaveBeenCalledWith('[Emera:storage]', 'Failed to flush storage', {
            filePath: 'Components/storage.json',
            error,
        });

        store.set(atom as never, 3);
        await vi.advanceTimersByTimeAsync(100);

        expect(adapter.write).toHaveBeenCalledTimes(2);
        expect(adapter.write).toHaveBeenLastCalledWith(
            'Components/storage.json',
            JSON.stringify({ count: 3 }, null, 4),
        );
    });
});
