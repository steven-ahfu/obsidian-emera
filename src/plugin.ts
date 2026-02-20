import { App, MarkdownView, Notice, Plugin, PluginManifest, TAbstractFile } from 'obsidian';

const COMPONENT_USAGE_MAP: Record<string, string[]> = {
    RootComponent: ['src/processors/code-processor.ts', 'src/renderer.ts'],
    ErrorAlert: ['src/processors/code-processor.ts'],
    ErrorBoundary: ['src/processors/code-processor.ts', 'src/renderer.ts'],
    LoadingInline: ['src/processors/code-processor.ts'],
    JsBlockPlaceholder: ['src/processors/code-processor.ts'],
    EmptyBlock: ['src/processors/code-processor.ts'],
};
import { SettingTab } from './settings';
import { EMERA_DEBUG_LOG_PATH, loadUserModule, type LoadTrigger } from './bundler';
import { EMERA_ROOT_SCOPE } from './consts';
import { createEmeraStorage, EmeraStorage } from './emera-module/storage';
import { populateRootScope, ScopeNode } from './scope';
import { EmeraCodeProcessor } from './processors/code-processor';
import { normalizeAutoRefreshDebounceMs, shouldAutoRefreshForPath } from './auto-refresh';
import { normalizeComponentsFolders } from './components-folder';
import { createLogger } from './logger';

interface PluginSettings {
    componentsFolder: string;
    componentsFolders: string[];
    autoRefreshEnabled: boolean;
    autoRefreshDebounceMs: number;
    debugLoggingEnabled: boolean;
}

const DEFAULT_SETTINGS: PluginSettings = {
    componentsFolder: 'Components',
    componentsFolders: ['Components'],
    autoRefreshEnabled: true,
    autoRefreshDebounceMs: 300,
    debugLoggingEnabled: false,
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

    // Session State for next steps
    sessionPriorityPhase4: '🔄' | '⏸️' | '▶️' = '🔄';
    sessionPriorityPhase5: '🔄' | '⏸️' | '▶️' = '⏸️';
    componentUsageMap: typeof COMPONENT_USAGE_MAP | null = COMPONENT_USAGE_MAP;
    componentExportConflicts: string[] = [];

    codeProcessor: EmeraCodeProcessor;
    private autoRefreshTimeoutId: ReturnType<typeof setTimeout> | null = null;
    private refreshInFlight: Promise<void> | null = null;
    private hasPendingRefresh = false;
    private logger = createLogger(this, 'plugin');

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
        if (this.sessionPriorityPhase4 === '🔄') {
            this.sessionPriorityPhase4 = '▶️';
        }
        if (this.sessionPriorityPhase5 === '⏸️') {
            this.sessionPriorityPhase5 = '▶️'; // Running the generation/check, so setting to running
        }

        if (this.refreshInFlight) {
            this.hasPendingRefresh = true;
            await this.refreshInFlight;
            return this.lastUserModuleLoadOk;
        }

        this.refreshInFlight = (async () => {
            this.logger.info(
                `Running module load triggered by: ${trigger}. Session State Update: P4->${this.sessionPriorityPhase4}, P5->${this.sessionPriorityPhase5}`,
            );
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

    private async showComponentUsageMap() {
        if (!this.componentUsageMap) {
            new Notice('Component usage map data is not available.');
            return;
        }

        this.logger.info('Component Usage Map Data:', this.componentUsageMap);

        const formatted = Object.entries(this.componentUsageMap)
            .map(([component, locations]) => {
                return `${component}:\\n  ${locations.join(',\\n  ')}`;
            })
            .join('\\n\\n');

        new Notice(`Component Usage Map:\\n\\n${formatted}`, 20000);
    }

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
        const normalizedFolders = normalizeComponentsFolders(
            Array.isArray(settings.componentsFolders) && settings.componentsFolders.length > 0
                ? settings.componentsFolders
                : [settings.componentsFolder ?? DEFAULT_SETTINGS.componentsFolder],
        );
        const componentsFolders =
            normalizedFolders.length > 0
                ? normalizedFolders
                : normalizeComponentsFolders([DEFAULT_SETTINGS.componentsFolder]);

        return {
            ...settings,
            componentsFolders,
            componentsFolder: componentsFolders[0],
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
            componentsFolders: this.settings.componentsFolders,
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
            this.logger.debug('Running auto refresh');
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
        this.logger.error('Last debug report', content);

        const previewMax = 1800;
        const preview =
            content.length > previewMax
                ? `${content.slice(0, previewMax)}\n... [truncated ${content.length - previewMax} chars]`
                : content;

        new Notice(preview, 15000);
    }
}
