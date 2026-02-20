import { ComponentType, createElement, ReactNode, useEffect, useState } from 'react';
import { EmeraContextProvider, EmeraContextType } from './emera-module/context';
import { ScopeNode, getPageScope } from './scope';
import { createRoot, Root } from 'react-dom/client';
import type { EmeraPlugin } from './plugin';
import { ErrorBoundary } from './components/ErrorBoundary';

type ScopeChangeWatcherProps = {
    scope?: ScopeNode;
    children?: ReactNode;
};

const ScopeChangeWatcher = ({ scope, children }: ScopeChangeWatcherProps) => {
    const [, setTick] = useState(0);

    useEffect(() => {
        if (!scope) return;
        const unsub = scope.onChange(() => {
            setTick((prev) => prev + 1);
        });
        return () => {
            unsub();
        };
    }, [scope]);

    return children ?? null;
};

export type RenderComponentParams<P extends Record<string, any>> = {
    container: Element | Root;
    component: ComponentType<P>;
    plugin: EmeraPlugin;
    children?: ReactNode;
    context: Omit<EmeraContextType, 'plugin' | 'storage' | 'frontmatter' | 'app'>;
    props?: P;
};

const rootsByContainer = new WeakMap<Element, Root>();

export const unmountRenderedComponent = (container: Element) => {
    const root = rootsByContainer.get(container);
    if (!root) return;
    root.unmount();
    rootsByContainer.delete(container);
};

export const renderComponent = <P extends Record<string, any>>({
    component,
    container,
    plugin,
    context,
    children,
    props,
}: RenderComponentParams<P>) => {
    let root: Root;
    if (container instanceof Element) {
        container.classList.add('emera-root');
        root = rootsByContainer.get(container) ?? createRoot(container);
        rootsByContainer.set(container, root);
    } else {
        root = container;
    }

    const frontmatter = context.file
        ? plugin.app.metadataCache.getFileCache(context.file)?.frontmatter
        : undefined;
    const pageScope = context.file ? getPageScope(plugin, context.file) : undefined;
    root.render(
        createElement(
            EmeraContextProvider,
            {
                value: {
                    ...context,
                    plugin,
                    app: plugin.app,
                    storage: plugin.storage,
                    frontmatter,
                },
            },
            createElement(
                ScopeChangeWatcher,
                { scope: pageScope },
                createElement(ErrorBoundary, {}, createElement(component, props, children)),
            ),
        ),
    );

    return root;
};
