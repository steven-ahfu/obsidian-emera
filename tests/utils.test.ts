import { afterEach, describe, expect, it, vi } from 'vitest';
import { safeCall, iife } from '../src/utils';

describe('safeCall', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('invokes the callback', () => {
        const fn = vi.fn();
        safeCall(fn);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('swallows exceptions and logs to console.error', () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const err = new Error('test error');
        safeCall(() => {
            throw err;
        });
        expect(errorSpy).toHaveBeenCalledTimes(1);
        expect(errorSpy).toHaveBeenCalledWith('[Emera] safeCall failed', err);
    });

    it('does not rethrow', () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        expect(() =>
            safeCall(() => {
                throw new Error('fail');
            }),
        ).not.toThrow();
    });
});

describe('iife', () => {
    it('executes and returns the result', () => {
        const result = iife(() => 42);
        expect(result).toBe(42);
    });

    it('works with complex return types', () => {
        const result = iife(() => ({ key: 'value' }));
        expect(result).toEqual({ key: 'value' });
    });
});
