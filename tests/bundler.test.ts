import { describe, expect, it } from 'vitest';
import {
    resolvePath,
    toVaultModuleId,
    fromVaultModuleId,
    isRuntimeExternalImport,
    truncateString,
    toSerializable,
    formatErrorForNotice,
} from '../src/bundler-utils';

describe('resolvePath', () => {
    it('resolves sibling file', () => {
        expect(resolvePath('Components/index.tsx', './utils.ts')).toBe('Components/utils.ts');
    });

    it('resolves nested relative path', () => {
        expect(resolvePath('Components/index.tsx', './sub/helper.ts')).toBe(
            'Components/sub/helper.ts',
        );
    });

    it('resolves parent-relative path', () => {
        expect(resolvePath('Components/sub/deep.tsx', '../shared.ts')).toBe('Components/shared.ts');
    });

    it('resolves current-dir dot segments', () => {
        expect(resolvePath('a/b/c.ts', './d.ts')).toBe('a/b/d.ts');
    });

    it('silently resolves over-escaping .. to root level', () => {
        // When .. pops beyond the stack, JS Array.pop() is a no-op on empty arrays,
        // so the result collapses to just the filename. This is existing behavior.
        expect(resolvePath('index.ts', '../../escape.ts')).toBe('escape.ts');
    });

    it('throws when relative starts with /', () => {
        expect(() => resolvePath('index.ts', '/absolute.ts')).toThrow(
            'Import path escapes vault root',
        );
    });
});

describe('toVaultModuleId / fromVaultModuleId', () => {
    it('round-trips a simple path', () => {
        const moduleId = toVaultModuleId('Components/index.tsx');
        expect(moduleId).toBe('emera://vault/Components/index.tsx');
        expect(fromVaultModuleId(moduleId)).toBe('Components/index.tsx');
    });

    it('strips leading slashes during toVaultModuleId', () => {
        const moduleId = toVaultModuleId('/Components/index.tsx');
        expect(moduleId).toBe('emera://vault/Components/index.tsx');
    });

    it('fromVaultModuleId returns input unchanged for non-vault IDs', () => {
        expect(fromVaultModuleId('react')).toBe('react');
        expect(fromVaultModuleId('https://cdn.example.com/lib.js')).toBe(
            'https://cdn.example.com/lib.js',
        );
    });
});

describe('isRuntimeExternalImport', () => {
    it('returns true for http:// and https:// URLs', () => {
        expect(isRuntimeExternalImport('https://esm.sh/react')).toBe(true);
        expect(isRuntimeExternalImport('http://cdn.example.com/lib.js')).toBe(true);
    });

    it('returns false for bare specifiers and relative paths', () => {
        expect(isRuntimeExternalImport('react')).toBe(false);
        expect(isRuntimeExternalImport('./utils')).toBe(false);
        expect(isRuntimeExternalImport('../helper')).toBe(false);
    });
});

describe('truncateString', () => {
    it('returns short strings unchanged', () => {
        expect(truncateString('hello')).toBe('hello');
    });

    it('truncates strings exceeding maxLength', () => {
        const long = 'x'.repeat(3000);
        const result = truncateString(long, 100);
        expect(result.length).toBeLessThan(long.length);
        expect(result).toContain('truncated 2900 chars');
    });

    it('does not truncate at exactly maxLength', () => {
        const exact = 'y'.repeat(2000);
        expect(truncateString(exact)).toBe(exact);
    });
});

describe('toSerializable', () => {
    it('passes through primitives', () => {
        expect(toSerializable(null)).toBe(null);
        expect(toSerializable(undefined)).toBe(undefined);
        expect(toSerializable(42)).toBe(42);
        expect(toSerializable(true)).toBe(true);
    });

    it('truncates long strings', () => {
        const long = 'a'.repeat(3000);
        const result = toSerializable(long) as string;
        expect(result).toContain('truncated');
    });

    it('converts functions to descriptive string', () => {
        function myFunc() {}
        expect(toSerializable(myFunc)).toBe('[Function myFunc]');
        expect(toSerializable(() => {})).toBe('[Function anonymous]');
    });

    it('serializes Error objects', () => {
        const err = new Error('test error');
        const result = toSerializable(err) as Record<string, unknown>;
        expect(result.name).toBe('Error');
        expect(result.message).toBe('test error');
        expect(result).toHaveProperty('stack');
    });

    it('serializes Error with cause', () => {
        const cause = new Error('root cause');
        const err = new Error('wrapper', { cause });
        const result = toSerializable(err) as Record<string, unknown>;
        expect(result.cause).toBeDefined();
        const causeResult = result.cause as Record<string, unknown>;
        expect(causeResult.message).toBe('root cause');
    });

    it('serializes arrays (capped at 200)', () => {
        const arr = Array.from({ length: 250 }, (_, i) => i);
        const result = toSerializable(arr) as number[];
        expect(result).toHaveLength(200);
    });

    it('serializes objects (capped at 200 keys)', () => {
        const obj: Record<string, number> = {};
        for (let i = 0; i < 250; i++) obj[`key${i}`] = i;
        const result = toSerializable(obj) as Record<string, number>;
        expect(Object.keys(result)).toHaveLength(200);
    });

    it('caps recursion depth at 5', () => {
        const nested: any = { a: { b: { c: { d: { e: { f: 'deep' } } } } } };
        const result = toSerializable(nested) as any;
        expect(result.a.b.c.d.e.f).toBe('[MaxDepth]');
    });
});

describe('formatErrorForNotice', () => {
    it('formats Error instances', () => {
        expect(formatErrorForNotice(new Error('boom'))).toBe('boom');
    });

    it('formats string errors', () => {
        expect(formatErrorForNotice('something went wrong')).toBe('something went wrong');
    });

    it('formats rollup-style error objects', () => {
        const err = {
            message: 'Syntax error',
            plugin: 'babel',
            id: 'Components/index.tsx',
        };
        const result = formatErrorForNotice(err);
        expect(result).toContain('Syntax error');
        expect(result).toContain('plugin: babel');
        expect(result).toContain('file: Components/index.tsx');
    });

    it('formats rollup errors with location', () => {
        const err = {
            message: 'Unexpected token',
            loc: { line: 10, column: 5 },
        };
        const result = formatErrorForNotice(err);
        expect(result).toContain('loc: 10:5');
    });

    it('formats rollup errors with frame', () => {
        const err = {
            message: 'Error',
            frame: 'const x = ;\n          ^',
        };
        const result = formatErrorForNotice(err);
        expect(result).toContain('frame: const x = ;');
    });

    it('falls back to String() for unknown types', () => {
        expect(formatErrorForNotice(42)).toBe('42');
        expect(formatErrorForNotice(null)).toBe('null');
    });
});
