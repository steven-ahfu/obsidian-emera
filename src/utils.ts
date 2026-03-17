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

export const registerCodemirrorMode = (name: string, original: string) => {
    const CodeMirror = (window as any).CodeMirror;
    CodeMirror.defineMode(name, (config: any) => CodeMirror.getMode(config, original));
    CodeMirror.defineMIME(`text/x-${name}`, 'jsx');
};
