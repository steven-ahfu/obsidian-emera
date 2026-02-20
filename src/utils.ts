export const safeCall = (cb: VoidFunction) => {
    try {
        cb();
    } catch (err) {
        console.error('[Emera] safeCall failed', err);
    }
};

export const iife = <T>(cb: () => T): T => {
    return cb();
};

const CodeMirror = (window as any).CodeMirror;
export const registerCodemirrorMode = (name: string, original: string) => {
    CodeMirror.defineMode(name, (config: any) => CodeMirror.getMode(config, original));
    CodeMirror.defineMIME(`text/x-${name}`, 'jsx');
};
