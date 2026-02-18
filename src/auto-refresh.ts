const AUTO_REFRESH_FILE_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.css'] as const;

type ShouldAutoRefreshForPathParams = {
    path: string;
    componentsFolder: string;
    autoRefreshEnabled: boolean;
    isFilesLoaded: boolean;
};

const normalizeSlashPath = (value: string) => {
    return value
        .replace(/\\/g, '/')
        .replace(/\/{2,}/g, '/')
        .replace(/^\.\//, '')
        .replace(/\/+$/, '');
};

export const normalizeAutoRefreshDebounceMs = (value: number, fallbackMs: number) => {
    if (!Number.isFinite(value)) {
        return fallbackMs;
    }

    return Math.max(0, Math.round(value));
};

export const shouldAutoRefreshForPath = ({
    path,
    componentsFolder,
    autoRefreshEnabled,
    isFilesLoaded,
}: ShouldAutoRefreshForPathParams): boolean => {
    if (!autoRefreshEnabled || !isFilesLoaded) {
        return false;
    }

    const normalizedPath = normalizeSlashPath(path);
    const normalizedComponentsFolder = normalizeSlashPath(componentsFolder);
    if (!normalizedComponentsFolder) {
        return false;
    }

    const fileInComponentsFolder =
        normalizedPath === normalizedComponentsFolder ||
        normalizedPath.startsWith(`${normalizedComponentsFolder}/`);
    if (!fileInComponentsFolder) {
        return false;
    }

    const storageFilePath = `${normalizedComponentsFolder}/storage.json`;
    if (normalizedPath === storageFilePath) {
        return false;
    }

    return AUTO_REFRESH_FILE_EXTENSIONS.some((ext) => normalizedPath.endsWith(ext));
};
