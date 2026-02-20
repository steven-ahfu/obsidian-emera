import { describe, expect, it } from 'vitest';
import { normalizeAutoRefreshDebounceMs, shouldAutoRefreshForPath } from '../src/auto-refresh';

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
