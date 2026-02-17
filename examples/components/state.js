import { atom, useAtom } from 'jotai';

const noteAtom = atom('Write a note');

// Simple local state with Jotai.
export const JotaiNote = () => {
    const [note, setNote] = useAtom(noteAtom);

    return (
        <div>
            <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Type here"
            />
            <div>Preview: {note}</div>
        </div>
    );
};
