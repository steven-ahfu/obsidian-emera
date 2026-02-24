import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

describe('emera module exports', () => {
    it('exposes Markdown, useEmeraBasics, useEmeraContext, and useStorage', () => {
        const contents = readFileSync(
            new URL('../src/emera-module/index.ts', import.meta.url),
            'utf8',
        );

        expect(contents).toContain('Markdown');
        expect(contents).toContain('useEmeraBasics');
        expect(contents).toContain('useStorage');
        expect(contents).toContain('useEmeraContext');
        expect(contents).not.toContain('useIsPreview');
    });
});
