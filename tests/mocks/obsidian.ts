export const normalizePath = (path: string) =>
    path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');

export class App {
    vault = {
        adapter: {
            exists: async () => false,
            read: async () => '',
            write: async () => undefined,
        },
        on: () => () => undefined,
    };

    workspace = {
        onLayoutReady: (callback: () => void) => callback(),
        iterateAllLeaves: () => undefined,
        on: () => () => undefined,
    };

    metadataCache = {
        getFileCache: () => undefined,
    };
}

export class Notice {
    constructor(
        public message?: string,
        public timeout?: number,
    ) {}
}

export class Plugin {
    constructor(
        public app = new App(),
        public manifest: PluginManifest = new PluginManifest(),
    ) {}

    addSettingTab() {}

    registerMarkdownPostProcessor() {}

    registerEditorExtension() {}

    registerEvent() {}

    addCommand() {}

    async loadData() {
        return {};
    }

    async saveData() {}
}

export class PluginManifest {}

export class TAbstractFile {
    constructor(public path = '') {}
}

export class TFile extends TAbstractFile {}

export class TFolder extends TAbstractFile {}

export class MarkdownView {
    previewMode = {
        rerender: () => undefined,
    };

    editor = {
        refresh: () => undefined,
    };
}

export class PluginSettingTab {
    containerEl = {
        empty: () => undefined,
    };

    constructor(
        public app: App,
        public plugin: Plugin,
    ) {}
}

export class Setting {
    constructor(public containerEl?: unknown) {}

    setName() {
        return this;
    }

    setDesc() {
        return this;
    }

    addText(callback?: (component: TextComponent) => void) {
        callback?.(new TextComponent());
        return this;
    }

    addButton(callback?: (component: ButtonComponent) => void) {
        callback?.(new ButtonComponent());
        return this;
    }

    addToggle(callback?: (component: ToggleComponent) => void) {
        callback?.(new ToggleComponent());
        return this;
    }
}

export class AbstractInputSuggest<T> {
    limit = 0;
    lastSelected: T | null = null;

    constructor(
        public app: App,
        public inputEl: unknown,
    ) {}

    close() {}

    setInstructions() {}

    chooseSuggestion(value: T) {
        this.lastSelected = value;
    }
}

export class TextComponent {
    inputEl = {};

    setPlaceholder() {
        return this;
    }

    setValue() {
        return this;
    }

    onChange() {
        return this;
    }
}

export class ButtonComponent {
    setButtonText() {
        return this;
    }

    setIcon() {
        return this;
    }

    setWarning() {
        return this;
    }

    onClick() {
        return this;
    }
}

export class ToggleComponent {
    setValue() {
        return this;
    }

    onChange() {
        return this;
    }
}

export class MarkdownPostProcessorContext {}

export const editorInfoField = Symbol('editorInfoField');
export const editorEditorField = Symbol('editorEditorField');
export const editorLivePreviewField = Symbol('editorLivePreviewField');

export const MarkdownRenderer = {
    render: async () => undefined,
};

export const setIcon = () => undefined;
