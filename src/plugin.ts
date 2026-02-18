import { App, MarkdownView, Notice, Plugin, PluginManifest, TAbstractFile } from 'obsidian';
import { SettingTab } from './settings';
import { EMERA_DEBUG_LOG_PATH, loadUserModule, type LoadTrigger } from './bundler';
import { EMERA_ROOT_SCOPE } from './consts';
import { createEmeraStorage, EmeraStorage } from './emera-module/storage';
import { populateRootScope, ScopeNode } from './scope';
import { EmeraCodeProcessor } from './processors/code-processor';
import { normalizeAutoRefreshDebounceMs, shouldAutoRefreshForPath } from './auto-refresh';

interface PluginSettings {
    componentsFolder: string;
    autoRefreshEnabled: boolean;
    autoRefreshDebounceMs: number;
}

const DEFAULT_SETTINGS: PluginSettings = {
    componentsFolder: 'Components',
    autoRefreshEnabled: true,
    autoRefreshDebounceMs: 300,
};

export class EmeraPlugin extends Plugin {
    settings: PluginSettings;
    registeredShorthandsProcessors: string[] = [];
    isFilesLoaded = false;
    isComponentsLoaded: boolean;
    componentsLoadedPromise: Promise<void>;
    private resolveComponentsLoaded: VoidFunction;
    private lastUserModuleLoadOk = false;
    storage: EmeraStorage;
    rootScope: ScopeNode;

    codeProcessor: EmeraCodeProcessor;
    private autoRefreshTimeoutId: ReturnType<typeof setTimeout> | null = null;
    private refreshInFlight: Promise<void> | null = null;
    private hasPendingRefresh = false;

    constructor(app: App, manifest: PluginManifest) {
        super(app, manifest);
        const { resolve, promise } = Promise.withResolvers<void>();
        this.isComponentsLoaded = false;
        this.componentsLoadedPromise = promise;
        this.resolveComponentsLoaded = resolve;
        window.emera = this;

        this.rootScope = (window as unknown as Record<string, ScopeNode>)[EMERA_ROOT_SCOPE];
        populateRootScope(this);

        this.codeProcessor = new EmeraCodeProcessor(this);
    }

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new SettingTab(this.app, this));
        this.storage = createEmeraStorage(this);

        this.registerMarkdownPostProcessor(this.codeProcessor.markdownPostProcessor);

        this.registerEditorExtension([this.codeProcessor.codemirrorStateField]);
        this.registerAutoRefreshHandlers();

        // TODO: when file is renamed, we should prompt user to change its references in any Emera code block

        this.app.workspace.onLayoutReady(async () => {
            this.isFilesLoaded = true;
            await this.storage.init();
            const { registry, ok } = await loadUserModule(this, 'startup');
            this.lastUserModuleLoadOk = ok;
            this.rootScope.setMany(registry);
            this.isComponentsLoaded = true;
            this.resolveComponentsLoaded();
            this.refreshEditors();
        });

        this.addCommand({
            id: 'refresh',
            name: 'Refresh user module',
            callback: async () => {
                const wasLoaded = await this.refreshUserModule('refresh');
                if (wasLoaded) {
                    new Notice('User module was reloaded.');
                }
            },
        });

        this.addCommand({
            id: 'show-last-debug-report',
            name: 'Show last debug report',
            callback: async () => {
                await this.showLastDebugReport();
            },
        });
    }

    refreshEditors = () => {
        this.app.workspace.iterateAllLeaves((leaf) => {
            if (leaf.view && leaf.view instanceof MarkdownView) {
                leaf.view.previewMode.rerender(true);
                leaf.view.editor.refresh();
            }
        });
    };

    refreshUserModule = async (trigger: LoadTrigger = 'refresh'): Promise<boolean> => {
        if (this.refreshInFlight) {
            this.hasPendingRefresh = true;
            await this.refreshInFlight;
            return this.lastUserModuleLoadOk;
        }

        this.refreshInFlight = (async () => {
            const { registry, ok } = await loadUserModule(this, trigger);
            this.lastUserModuleLoadOk = ok;
            this.rootScope.setMany(registry);
            this.refreshEditors();
        })();

        try {
            await this.refreshInFlight;
        } finally {
            this.refreshInFlight = null;
        }

        if (this.hasPendingRefresh) {
            this.hasPendingRefresh = false;
            void this.refreshUserModule(trigger);
        }

        return this.lastUserModuleLoadOk;
    };

    onunload() {
        this.storage.destroy();
        if (this.autoRefreshTimeoutId !== null) {
            clearTimeout(this.autoRefreshTimeoutId);
            this.autoRefreshTimeoutId = null;
        }
    }

    async loadSettings() {
        this.settings = this.normalizeSettings(
            Object.assign({}, DEFAULT_SETTINGS, await this.loadData()),
        );
    }

    async saveSettings() {
        this.settings = this.normalizeSettings(this.settings);
        await this.saveData(this.settings);
    }

    private normalizeSettings(settings: PluginSettings): PluginSettings {
        return {
            ...settings,
            autoRefreshDebounceMs: normalizeAutoRefreshDebounceMs(
                settings.autoRefreshDebounceMs,
                DEFAULT_SETTINGS.autoRefreshDebounceMs,
            ),
        };
    }

    private registerAutoRefreshHandlers() {
        const enqueueRefreshFromFile = (fileOrPath: TAbstractFile | string) => {
            const path = typeof fileOrPath === 'string' ? fileOrPath : fileOrPath.path;
            if (!this.shouldAutoRefreshForPath(path)) {
                return;
            }
            this.scheduleAutoRefresh();
        };

        this.registerEvent(this.app.vault.on('modify', (file) => enqueueRefreshFromFile(file)));
        this.registerEvent(this.app.vault.on('create', (file) => enqueueRefreshFromFile(file)));
        this.registerEvent(this.app.vault.on('delete', (file) => enqueueRefreshFromFile(file)));
        this.registerEvent(
            this.app.vault.on('rename', (file, oldPath) => {
                enqueueRefreshFromFile(file);
                enqueueRefreshFromFile(oldPath);
            }),
        );
    }

    private shouldAutoRefreshForPath(path: string): boolean {
        return shouldAutoRefreshForPath({
            path,
            componentsFolder: this.settings.componentsFolder,
            autoRefreshEnabled: this.settings.autoRefreshEnabled,
            isFilesLoaded: this.isFilesLoaded,
        });
    }

    private scheduleAutoRefresh() {
        if (!this.settings.autoRefreshEnabled) {
            return;
        }

        const delay = Math.max(0, this.settings.autoRefreshDebounceMs);
        if (this.autoRefreshTimeoutId !== null) {
            clearTimeout(this.autoRefreshTimeoutId);
        }

        this.autoRefreshTimeoutId = setTimeout(async () => {
            this.autoRefreshTimeoutId = null;
            if (!this.settings.autoRefreshEnabled) {
                return;
            }
            await this.refreshUserModule('auto-refresh');
        }, delay);
    }

    private async showLastDebugReport() {
        const exists = await this.app.vault.adapter.exists(EMERA_DEBUG_LOG_PATH);
        if (!exists) {
            new Notice('No Emera debug report found yet.');
            return;
        }

        const content = await this.app.vault.adapter.read(EMERA_DEBUG_LOG_PATH);
        console.error('[Emera] Last debug report', content);

        const previewMax = 1800;
        const preview =
            content.length > previewMax
                ? `${content.slice(0, previewMax)}\n... [truncated ${content.length - previewMax} chars]`
                : content;

        new Notice(preview, 15000);
    }
}
