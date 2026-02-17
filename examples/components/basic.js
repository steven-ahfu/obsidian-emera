import { Markdown } from 'emera';

// Small, reusable display components.
export const HelloWorld = ({ name = 'World' }) => {
    return <div>Hello, {name}.</div>;
};

export const InlineBadge = ({ label = 'Inline' }) => {
    return (
        <span className="emera-inline-badge">
            <strong>Emera</strong>
            {label}
        </span>
    );
};

// Wrapper-style component that renders markdown strings.
export const RedCallout = ({ children }) => {
    return (
        <div className="emera-callout">
            <Markdown>{children}</Markdown>
        </div>
    );
};
