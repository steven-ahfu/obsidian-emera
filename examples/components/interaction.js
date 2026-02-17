import { useStorage } from 'emera';

// Use this wrapper to avoid Live Preview click-to-edit behavior.
export const ClickSafe = ({ children }) => {
    return <div onClick={(event) => event.stopPropagation()}>{children}</div>;
};

// Persisted, plugin-wide counter state.
export const StorageCounter = ({ storageKey = 'example-counter' }) => {
    const [count, setCount] = useStorage(storageKey, 0);

    return (
        <button className="emera-button" onClick={() => setCount(count + 1)}>
            Count: {count}
        </button>
    );
};
