import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from '../src/logger';

type PluginLike = {
    settings?: {
        debugLoggingEnabled?: boolean;
    };
};

describe('createLogger', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('suppresses debug logs when debug mode is disabled', () => {
        const plugin = { settings: { debugLoggingEnabled: false } } as PluginLike;
        const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
        const logger = createLogger(plugin as never, 'tests');

        logger.debug('hidden debug');

        expect(debugSpy).not.toHaveBeenCalled();
    });

    it('emits debug logs when debug mode is enabled', () => {
        const plugin = { settings: { debugLoggingEnabled: true } } as PluginLike;
        const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
        const logger = createLogger(plugin as never, 'tests');

        logger.debug('visible debug', { value: 1 });

        expect(debugSpy).toHaveBeenCalledTimes(1);
    });

    it('always emits error logs', () => {
        const plugin = { settings: { debugLoggingEnabled: false } } as PluginLike;
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const logger = createLogger(plugin as never, 'tests');

        logger.error('always visible');

        expect(errorSpy).toHaveBeenCalledTimes(1);
    });
});
