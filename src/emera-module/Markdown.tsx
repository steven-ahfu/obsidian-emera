import { MarkdownRenderer } from 'obsidian';
import { ComponentProps, ElementType, forwardRef, useEffect, useRef } from 'react';
import { useEmeraContext } from './context';
import { mergeRefs } from 'react-merge-refs';

type MarkdownProps<T extends ElementType = 'div'> = {
    children: string;
    as?: T;
} & Omit<ComponentProps<T>, 'children'>;

export const Markdown = forwardRef<HTMLDivElement, MarkdownProps>(
    ({ children, as: Component = 'div', ...props }, forwardedRef) => {
        const containerRef = useRef<HTMLDivElement>(null);
        const ctx = useEmeraContext();

        useEffect(() => {
            if (!containerRef.current) return;
            containerRef.current.replaceChildren();
            MarkdownRenderer.render(
                ctx.plugin.app,
                children,
                containerRef.current,
                ctx.file?.path ?? '',
                ctx.plugin,
            );
        }, []);

        return (
            <Component
                {...props}
                data-emera-markdown
                ref={mergeRefs([containerRef, forwardedRef])}
            ></Component>
        );
    },
);
