import type { EmeraPlugin } from './plugin';
import { AbstractInputSuggest, PluginSettingTab, App, Setting, Notice, TFolder } from 'obsidian';

const COMPONENTS_FOLDER_INPUT_CLASS = 'emera-components-folder-input';
const MAX_FOLDER_SUGGESTIONS = 1000;

export class SettingTab extends PluginSettingTab {
    plugin: EmeraPlugin;
    private componentsFolderSuggest: ComponentsFolderSuggest | null = null;

    constructor(app: App, plugin: EmeraPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();
        this.componentsFolderSuggest?.close();
        this.componentsFolderSuggest = null;

        new Setting(containerEl)
            .setName('Components folder')
            .setDesc('Plugin will look for components only in this folder')
            .addText((text) => {
                text.setPlaceholder('.components').setValue(this.plugin.settings.componentsFolder);
                text.inputEl.addClass(COMPONENTS_FOLDER_INPUT_CLASS);
                this.componentsFolderSuggest = new ComponentsFolderSuggest(this.app, text.inputEl);
                this.componentsFolderSuggest.onSelect(async (folder) => {
                    text.setValue(folder.path);
                    this.plugin.settings.componentsFolder = folder.path;
                    await this.plugin.saveSettings();
                });

                text.onChange(async (value) => {
                    this.plugin.settings.componentsFolder = value;
                    await this.plugin.saveSettings();
                });
            });
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
            .setDesc(
                'Automatically reload components after editing JS/TS/CSS files in the components folder',
            )
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.autoRefreshEnabled).onChange(async (value) => {
                    this.plugin.settings.autoRefreshEnabled = value;
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
