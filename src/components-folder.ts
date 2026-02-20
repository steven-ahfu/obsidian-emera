export const normalizeComponentsFolderValue = (value: string): string => {
    return value
        .trim()
        .replace(/\\/g, '/')
        .replace(/\/{2,}/g, '/')
        .replace(/^\.\//, '')
        .replace(/\/+$/, '');
};

export const normalizeComponentsFolders = (folders: string[] = []): string[] => {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const folder of folders) {
        const normalized = normalizeComponentsFolderValue(folder);
        if (!normalized) {
            continue;
        }

        if (seen.has(normalized)) {
            continue;
        }

        seen.add(normalized);
        result.push(normalized);
    }

    return result;
};
