---
title: Emera complex example
status: demo
---

# Complex example

This note pulls data from Obsidian's `app` and renders components defined across
multiple files.

Inline app data: emjs: app.vault.getName()

```emjs
const markdownFiles = app.vault.getMarkdownFiles();
const recent = markdownFiles.slice(0, 5).map((file) => file.path);

export const vaultName = app.vault.getName();
export const recentFiles = recent;
export const fileCount = markdownFiles.length;
```

```emera
<HelloWorld name={vaultName} />
<InlineBadge label={`Files: ${fileCount}`} />
<MotionCard title="Animated summary" />
<Clock />
<StorageCounter storageKey="complex-counter" />
<EmeraSummary title="Emera basics overview" />

<RedCallout>
Recent files:\n- {recentFiles.join('\n- ')}
</RedCallout>

<ClickSafe>
    <JotaiNote />
</ClickSafe>
```
