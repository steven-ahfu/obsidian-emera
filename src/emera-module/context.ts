import { App, TFile } from 'obsidian';
import type { EmeraPlugin } from '../plugin';
import { createStrictContext } from './utils';
import type { EmeraStorage } from './storage';

export type EmeraContextType = {
    file: TFile | null;
    frontmatter: Record<string, any> | null | undefined;
    plugin: EmeraPlugin;
    storage: EmeraStorage;
    app: App;
    renderMode: 'reading' | 'editing' | 'canvas';
};

export const [EmeraContextProvider, useEmeraContext] =
    createStrictContext<EmeraContextType>('EmeraContext');

export const useIsPreview = () => {
    const context = useEmeraContext();
    return context.renderMode === 'reading' || context.renderMode === 'canvas';
};

export type EmeraBasicsContext = Pick<EmeraContextType, 'app' | 'file' | 'plugin' | 'storage'>;

export const useEmeraBasics = (): EmeraBasicsContext => {
    const { app, file, plugin, storage } = useEmeraContext();
    return { app, file, plugin, storage };
};
