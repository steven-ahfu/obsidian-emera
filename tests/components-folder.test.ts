import { describe, expect, it } from 'vitest';
import { normalizeComponentsFolders } from '../src/components-folder';

describe('normalizeComponentsFolders', () => {
    it('trims, normalizes slashes, removes empties, and dedupes', () => {
        const result = normalizeComponentsFolders([
            ' Components ',
            '',
            './Components/',
            'Other\\\\Path',
            'Components',
            'Other/Path/',
        ]);

        expect(result).toEqual(['Components', 'Other/Path']);
    });

    it('preserves order', () => {
        const result = normalizeComponentsFolders(['Beta', 'Alpha', 'Beta', 'Gamma']);

        expect(result).toEqual(['Beta', 'Alpha', 'Gamma']);
    });
});
