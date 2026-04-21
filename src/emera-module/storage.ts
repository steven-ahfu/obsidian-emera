import { atom, Atom, getDefaultStore, useAtom } from 'jotai';
import type { EmeraPlugin } from '../plugin';
import { useEmeraContext } from './context';
import { normalizePath } from 'obsidian';
import { createLogger } from '../logger';

export const createEmeraStorage = (plugin: EmeraPlugin) => {
    const logger = createLogger(plugin, 'storage');
    const filePath = normalizePath(`${plugin.settings.componentsFolder}/storage.json`);
    let state: Record<string, any> = {};
    let flushTimerId: null | ReturnType<typeof setTimeout> = null;
    const atoms: Record<string, Atom<any>> = {};
    const unsubFunction: VoidFunction[] = [];

    const init = async () => {
        const exists = await plugin.app.vault.adapter.exists(filePath);
        if (exists) {
            try {
                const content = await plugin.app.vault.adapter.read(filePath);
                state = JSON.parse(content);
            } catch (_err) {
                logger.warn(`Storage file exists but couldn't be parsed`, { filePath });
            }
        }
    };

    const destroy = () => {
        if (flushTimerId !== null) {
            clearTimeout(flushTimerId);
            flushTimerId = null;
            void flush().catch((error) => {
                logger.error(`Failed to flush storage during destroy`, { filePath, error });
            });
        }
        unsubFunction.forEach((cb) => cb());
    };

    const flush = async () => {
        const stateStr = JSON.stringify(state, null, 4);
        await plugin.app.vault.adapter.write(filePath, stateStr);
    };

    const scheduleFlush = () => {
        if (flushTimerId !== null) {
            clearTimeout(flushTimerId);
        }

        flushTimerId = setTimeout(() => {
            flushTimerId = null;
            void flush().catch((error) => {
                logger.error(`Failed to flush storage`, { filePath, error });
            });
        }, 100);
    };

    const set = (prop: string, val: any) => {
        state[prop] = val;
        scheduleFlush();
    };

    const get = (prop: string) => {
        return state[prop];
    };

    const getAtom = (prop: string, defaultValue: any) => {
        if (atoms[prop]) return atoms[prop];

        const primitiveAtom = atom(prop in state ? state[prop] : defaultValue);
        atoms[prop] = primitiveAtom;
        const store = getDefaultStore();
        unsubFunction.push(
            store.sub(primitiveAtom, () => {
                const value = store.get(primitiveAtom);
                set(prop, value);
            }),
        );
        return primitiveAtom;
    };

    return {
        init,
        destroy,
        set,
        get,
        flush,
        getAtom,
    };
};

export type EmeraStorage = ReturnType<typeof createEmeraStorage>;

export const useStorage = <T>(key: string, defaultValue: T) => {
    const { storage } = useEmeraContext();
    const atom = storage.getAtom(key, defaultValue);
    return useAtom(atom);
};
