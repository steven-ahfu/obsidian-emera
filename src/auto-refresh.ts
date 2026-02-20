import { normalizeComponentsFolders, normalizeComponentsFolderValue } from './components-folder';

const AUTO_REFRESH_FILE_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.css'] as const;

type ShouldAutoRefreshForPathParams = {
    path: string;
    componentsFolders: string[];
    autoRefreshEnabled: boolean;
    isFilesLoaded: boolean;
};

export const normalizeAutoRefreshDebounceMs = (value: number, fallbackMs: number) => {
    if (!Number.isFinite(value)) {
        return fallbackMs;
    }

    return Math.max(0, Math.round(value));
};

export const shouldAutoRefreshForPath = ({
    path,
    componentsFolders,
    autoRefreshEnabled,
    isFilesLoaded,
}: ShouldAutoRefreshForPathParams): boolean => {
    if (!autoRefreshEnabled || !isFilesLoaded) {
        return false;
    }

    const normalizedPath = normalizeComponentsFolderValue(path);
    const normalizedComponentsFolders = normalizeComponentsFolders(componentsFolders);
    if (normalizedComponentsFolders.length === 0) {
        return false;
    }

    for (const normalizedComponentsFolder of normalizedComponentsFolders) {
        const fileInComponentsFolder =
            normalizedPath === normalizedComponentsFolder ||
            normalizedPath.startsWith(`${normalizedComponentsFolder}/`);
        if (!fileInComponentsFolder) {
            continue;
        }

        const storageFilePath = `${normalizedComponentsFolder}/storage.json`;
        if (normalizedPath === storageFilePath) {
            return false;
        }

        return AUTO_REFRESH_FILE_EXTENSIONS.some((ext) => normalizedPath.endsWith(ext));
    }

    return false;
};
