import type { EmeraPlugin } from './plugin';
import {
    AbstractInputSuggest,
    PluginSettingTab,
    App,
    Setting,
    Notice,
    TFolder,
    TextComponent,
    ButtonComponent,
    setIcon,
} from 'obsidian';

const COMPONENTS_FOLDER_INPUT_CLASS = 'emera-components-folder-input';
const MAX_FOLDER_SUGGESTIONS = 1000;

export class SettingTab extends PluginSettingTab {
    plugin: EmeraPlugin;
    private componentsFolderSuggests: ComponentsFolderSuggest[] = [];
    private pendingFolderRows = 0;

    constructor(app: App, plugin: EmeraPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();
        this.componentsFolderSuggests.forEach((suggest) => suggest.close());
        this.componentsFolderSuggests = [];

        const saveComponentsFolders = async (folders: string[]) => {
            this.plugin.settings.componentsFolders = folders;
            await this.plugin.saveSettings();
        };

        const refreshComponentsFolders = async (folders: string[]) => {
            await saveComponentsFolders(folders);
            this.display();
        };

        const configuredFolders =
            this.plugin.settings.componentsFolders.length > 0
                ? this.plugin.settings.componentsFolders
                : [this.plugin.settings.componentsFolder];
        const renderedFolders = configuredFolders.concat(Array(this.pendingFolderRows).fill(''));

        const componentsSetting = new Setting(containerEl)
            .setName('Components folders')
            .setDesc(
                'Emera loads components from these folders in order. Each folder must include an index file.',
            );
        componentsSetting.settingEl.addClass('emera-components-folders-setting');
        const listEl = componentsSetting.controlEl.createDiv({
            cls: 'emera-components-folder-list',
        });

        renderedFolders.forEach((folder, index) => {
            const rowEl = listEl.createDiv({ cls: 'emera-components-folder-row' });
            const text = new TextComponent(rowEl);
            text.setPlaceholder('.components').setValue(folder);
            text.inputEl.addClass(COMPONENTS_FOLDER_INPUT_CLASS);

            const suggest = new ComponentsFolderSuggest(this.app, text.inputEl);
            this.componentsFolderSuggests.push(suggest);
            suggest.onSelect(async (selected) => {
                text.setValue(selected.path);
                const currentFolders = this.plugin.settings.componentsFolders;
                const isPendingRow = index >= currentFolders.length;
                if (isPendingRow) {
                    if (!selected.path.trim()) {
                        return;
                    }
                    this.pendingFolderRows = Math.max(0, this.pendingFolderRows - 1);
                    await saveComponentsFolders([...currentFolders, selected.path]);
                    this.display();
                    return;
                }

                const nextFolders = [...currentFolders];
                nextFolders[index] = selected.path;
                await saveComponentsFolders(nextFolders);
            });

            text.onChange(async (value) => {
                const currentFolders = this.plugin.settings.componentsFolders;
                const isPendingRow = index >= currentFolders.length;
                if (isPendingRow) {
                    if (!value.trim()) {
                        return;
                    }
                    this.pendingFolderRows = Math.max(0, this.pendingFolderRows - 1);
                    await saveComponentsFolders([...currentFolders, value]);
                    this.display();
                    return;
                }

                if (!value.trim()) {
                    return;
                }

                const nextFolders = [...currentFolders];
                nextFolders[index] = value;
                await saveComponentsFolders(nextFolders);
            });

            if (renderedFolders.length > 1) {
                const removeButton = rowEl.createEl('button', {
                    cls: 'clickable-icon emera-components-folder-remove',
                });
                removeButton.setAttr('aria-label', 'Remove folder');
                setIcon(removeButton, 'cross');
                removeButton.addEventListener('click', async () => {
                    const currentFolders = this.plugin.settings.componentsFolders;
                    const isPendingRow = index >= currentFolders.length;
                    if (isPendingRow) {
                        this.pendingFolderRows = Math.max(0, this.pendingFolderRows - 1);
                        this.display();
                        return;
                    }

                    const nextFolders = currentFolders.filter((_folder, idx) => idx !== index);
                    await refreshComponentsFolders(nextFolders);
                });
            }
        });

        const actionsEl = componentsSetting.controlEl.createDiv({
            cls: 'emera-components-folder-actions',
        });
        new ButtonComponent(actionsEl).setButtonText('Add folder').onClick(() => {
            this.pendingFolderRows += 1;
            this.display();
        });

        if (this.plugin.componentExportConflicts.length > 0) {
            new Setting(containerEl)
                .setName('Component export conflicts')
                .setDesc(
                    `Duplicate exports found across component folders. Emera uses the last folder in the list. Conflicts: ${this.plugin.componentExportConflicts.join(
                        ', ',
                    )}`,
                );
        }
        new Setting(containerEl)
            .setName('Refresh user module')
            .setDesc(
                'Click this if you made any changes to any exported members after opening Obsidian',
            )
            .addButton((button) =>
                button.setButtonText('Refresh').onClick(async () => {
                    const wasLoaded = await this.plugin.refreshUserModule();
                    if (wasLoaded) {
                        new Notice('User module was reloaded.');
                    }
                }),
            );

        new Setting(containerEl)
            .setName('Auto refresh user module')
            .setDesc('Enable hot reload when component files change within the selected folders.')
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.autoRefreshEnabled).onChange(async (value) => {
                    this.plugin.settings.autoRefreshEnabled = value;
                    await this.plugin.saveSettings();
                }),
            );

        new Setting(containerEl)
            .setName('Verbose debug logging')
            .setDesc('Show detailed bundler/processor logs when reloading components.')
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.debugLoggingEnabled)
                    .onChange(async (value) => {
                        this.plugin.settings.debugLoggingEnabled = value;
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(containerEl)
            .setName('Auto refresh debounce (ms)')
            .setDesc('Delay before auto refresh runs after a file change')
            .addText((text) =>
                text
                    .setPlaceholder('300')
                    .setValue(String(this.plugin.settings.autoRefreshDebounceMs))
                    .onChange(async (value) => {
                        const parsed = Number.parseInt(value, 10);
                        this.plugin.settings.autoRefreshDebounceMs = Number.isFinite(parsed)
                            ? Math.max(0, parsed)
                            : 300;
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(containerEl)
            .setName('Component Usage Map')
            .setDesc('Display components and where they are used in the codebase (experimental)')
            .addButton((button) =>
                button.setButtonText('Show Map').onClick(async () => {
                    const map = this.plugin.componentUsageMap;
                    if (!map) {
                        new Notice('Component usage map data is not yet available or empty.');
                        return;
                    }
                    const formatted = Object.entries(map)
                        .map(([component, locations]) => {
                            return `${component}:\n  ${(locations as string[]).join(',\\n  ')}`;
                        })
                        .join('\\n\\n');
                    new Notice(`Component Usage Map:\\n\\n${formatted}`, 20000);
                }),
            );
    }

    private getComponentUsageMap() {
        return this.plugin.componentUsageMap;
    }
}

class ComponentsFolderSuggest extends AbstractInputSuggest<TFolder> {
    constructor(app: App, textInputEl: HTMLInputElement) {
        super(app, textInputEl);
        this.limit = MAX_FOLDER_SUGGESTIONS;
    }

    getSuggestions(query: string): TFolder[] {
        const normalizedQuery = query.trim().toLowerCase();
        return this.app.vault
            .getAllLoadedFiles()
            .filter(
                (file): file is TFolder =>
                    file instanceof TFolder &&
                    file.path.length > 0 &&
                    file.path.toLowerCase().includes(normalizedQuery),
            )
            .slice(0, MAX_FOLDER_SUGGESTIONS);
    }

    renderSuggestion(folder: TFolder, el: HTMLElement) {
        el.setText(folder.path);
    }
}
