import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeAutoRefreshDebounceMs, shouldAutoRefreshForPath } from '../src/auto-refresh';
import { EmeraPlugin } from '../src/plugin';

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe('normalizeAutoRefreshDebounceMs', () => {
    it('rounds and clamps finite values', () => {
        expect(normalizeAutoRefreshDebounceMs(123.6, 300)).toBe(124);
        expect(normalizeAutoRefreshDebounceMs(-42, 300)).toBe(0);
    });

    it('falls back for non-finite values', () => {
        expect(normalizeAutoRefreshDebounceMs(Number.NaN, 300)).toBe(300);
        expect(normalizeAutoRefreshDebounceMs(Number.POSITIVE_INFINITY, 300)).toBe(300);
    });
});

describe('shouldAutoRefreshForPath', () => {
    it('returns false when auto refresh is disabled or files are not loaded', () => {
        expect(
            shouldAutoRefreshForPath({
                path: 'Components/index.tsx',
                componentsFolders: ['Components'],
                autoRefreshEnabled: false,
                isFilesLoaded: true,
            }),
        ).toBe(false);

        expect(
            shouldAutoRefreshForPath({
                path: 'Components/index.tsx',
                componentsFolders: ['Components'],
                autoRefreshEnabled: true,
                isFilesLoaded: false,
            }),
        ).toBe(false);
    });

    it('returns true for supported files inside components folder', () => {
        expect(
            shouldAutoRefreshForPath({
                path: 'Components/index.tsx',
                componentsFolders: ['Components'],
                autoRefreshEnabled: true,
                isFilesLoaded: true,
            }),
        ).toBe(true);

        expect(
            shouldAutoRefreshForPath({
                path: 'Components/widgets/chart.css',
                componentsFolders: ['Components/'],
                autoRefreshEnabled: true,
                isFilesLoaded: true,
            }),
        ).toBe(true);

        expect(
            shouldAutoRefreshForPath({
                path: 'Secondary/index.tsx',
                componentsFolders: ['Components', 'Secondary'],
                autoRefreshEnabled: true,
                isFilesLoaded: true,
            }),
        ).toBe(true);
    });

    it('returns false for unsupported files and paths outside components folder', () => {
        expect(
            shouldAutoRefreshForPath({
                path: 'Components/readme.md',
                componentsFolders: ['Components'],
                autoRefreshEnabled: true,
                isFilesLoaded: true,
            }),
        ).toBe(false);

        expect(
            shouldAutoRefreshForPath({
                path: 'Other/index.tsx',
                componentsFolders: ['Components'],
                autoRefreshEnabled: true,
                isFilesLoaded: true,
            }),
        ).toBe(false);
    });

    it('ignores storage.json writes to prevent refresh loops', () => {
        expect(
            shouldAutoRefreshForPath({
                path: 'Components/storage.json',
                componentsFolders: ['Components'],
                autoRefreshEnabled: true,
                isFilesLoaded: true,
            }),
        ).toBe(false);

        expect(
            shouldAutoRefreshForPath({
                path: 'Secondary/storage.json',
                componentsFolders: ['Components', 'Secondary'],
                autoRefreshEnabled: true,
                isFilesLoaded: true,
            }),
        ).toBe(false);
    });
});

describe('EmeraPlugin.scheduleAutoRefresh', () => {
    it('logs auto-refresh failures instead of leaking timer rejections', async () => {
        vi.useFakeTimers();
        const error = new Error('refresh failed');
        const plugin = {
            settings: {
                autoRefreshEnabled: true,
                autoRefreshDebounceMs: 25,
            },
            autoRefreshTimeoutId: null,
            logger: {
                debug: vi.fn(),
                error: vi.fn(),
            },
            refreshUserModule: vi.fn(async () => {
                throw error;
            }),
        };

        (EmeraPlugin.prototype as any).scheduleAutoRefresh.call(plugin);
        await vi.advanceTimersByTimeAsync(25);

        expect(plugin.refreshUserModule).toHaveBeenCalledWith('auto-refresh');
        expect(plugin.logger.debug).toHaveBeenCalledWith('Running auto refresh');
        expect(plugin.logger.error).toHaveBeenCalledWith('Auto refresh failed', { error });
        expect(plugin.autoRefreshTimeoutId).toBeNull();
    });

    it('skips auto refresh when the setting is disabled before the timer fires', async () => {
        vi.useFakeTimers();
        const plugin = {
            settings: {
                autoRefreshEnabled: true,
                autoRefreshDebounceMs: 25,
            },
            autoRefreshTimeoutId: null,
            logger: {
                debug: vi.fn(),
                error: vi.fn(),
            },
            refreshUserModule: vi.fn(async () => undefined),
        };

        (EmeraPlugin.prototype as any).scheduleAutoRefresh.call(plugin);
        plugin.settings.autoRefreshEnabled = false;
        await vi.advanceTimersByTimeAsync(25);

        expect(plugin.refreshUserModule).not.toHaveBeenCalled();
        expect(plugin.logger.debug).not.toHaveBeenCalled();
        expect(plugin.logger.error).not.toHaveBeenCalled();
    });
});
