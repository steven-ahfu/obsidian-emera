import { Markdown, useEmeraBasics, useStorage } from 'emera';

// Uses Emera exports: Markdown, useEmeraBasics, and useStorage.
export const EmeraSummary = ({ title = 'Emera summary' }) => {
    const { app, file, storage } = useEmeraBasics();
    const [showDetails, setShowDetails] = useStorage('example-show-details', true);

    const markdown =
        `**${title}**\n\n` +
        `- Vault: ${app?.vault.getName() ?? 'Unknown'}\n` +
        `- File: ${file?.path ?? 'No file context'}\n` +
        `- Storage available: ${storage ? 'yes' : 'no'}`;

    return (
        <div>
            <button className="emera-button" onClick={() => setShowDetails(!showDetails)}>
                Toggle details
            </button>
            <Markdown>{markdown}</Markdown>
            {showDetails && (
                <pre>
                    {JSON.stringify({ vault: app?.vault.getName(), file: file?.path }, null, 2)}
                </pre>
            )}
        </div>
    );
};

export const FileInfo = () => {
    const { app, file } = useEmeraBasics();

    return (
        <div>
            <div>Vault: {app?.vault.getName() ?? 'Unknown'}</div>
            <div>File: {file?.path ?? 'No file context'}</div>
        </div>
    );
};
