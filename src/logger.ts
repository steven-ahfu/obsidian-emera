import type { EmeraPlugin } from './plugin';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function isDebugEnabled(plugin: EmeraPlugin): boolean {
    return Boolean(plugin.settings?.debugLoggingEnabled);
}

function shouldLog(plugin: EmeraPlugin, level: LogLevel): boolean {
    if (level === 'warn' || level === 'error') {
        return true;
    }
    return isDebugEnabled(plugin);
}

export function createLogger(plugin: EmeraPlugin, scope?: string) {
    const prefix = scope ? `[Emera:${scope}]` : '[Emera]';

    const emit = (level: LogLevel, message: string, context?: unknown): void => {
        if (!shouldLog(plugin, level)) {
            return;
        }

        const writer: (...args: unknown[]) => void = (() => {
            if (level === 'error') return console.error;
            if (level === 'warn') return console.warn;
            if (level === 'info') return console.info;
            return console.debug;
        })();

        if (context === undefined) {
            writer(prefix, message);
            return;
        }

        writer(prefix, message, context);
    };

    return {
        debug: (message: string, context?: unknown) => emit('debug', message, context),
        info: (message: string, context?: unknown) => emit('info', message, context),
        warn: (message: string, context?: unknown) => emit('warn', message, context),
        error: (message: string, context?: unknown) => emit('error', message, context),
        isDebugEnabled: () => isDebugEnabled(plugin),
    };
}
