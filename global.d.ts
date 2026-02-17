import type { EmeraPlugin } from './src/plugin';

declare global {
    interface Window {
        emera?: EmeraPlugin;
    }
}

export {};
