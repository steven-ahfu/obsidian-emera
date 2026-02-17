import { Markdown, useEmeraContext, useStorage } from 'emera';

// Uses all Emera exports: Markdown, useEmeraContext, and useStorage.
export const EmeraSummary = ({ title = 'Emera summary' }) => {
    const { file, frontmatter, storage } = useEmeraContext();
    const [showFrontmatter, setShowFrontmatter] = useStorage('example-show-frontmatter', true);

    const markdown =
        `**${title}**\n\n` +
        `- File: ${file?.path ?? 'No file context'}\n` +
        `- Frontmatter keys: ${Object.keys(frontmatter ?? {}).join(', ') || 'None'}\n` +
        `- Storage available: ${storage ? 'yes' : 'no'}`;

    return (
        <div>
            <button className="emera-button" onClick={() => setShowFrontmatter(!showFrontmatter)}>
                Toggle frontmatter
            </button>
            <Markdown>{markdown}</Markdown>
            {showFrontmatter && <pre>{JSON.stringify(frontmatter ?? {}, null, 2)}</pre>}
        </div>
    );
};

export const FileInfo = () => {
    const { file, frontmatter } = useEmeraContext();

    return (
        <div>
            <div>File: {file?.path ?? 'No file context'}</div>
            <div>Frontmatter: {JSON.stringify(frontmatter ?? {})}</div>
        </div>
    );
};
