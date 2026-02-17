# Emera for Obsidian

> [!IMPORTANT]
> I stopped using Obsidian shortly after releasing this project, so I don't use
> Emera anymore. As such, you can consider this project unmaintained. You can
> still use it, as existing features work quite well. But there won't be any
> new features, and any bugs are unlikely to be fixed.

This is a plugin for [Obsidian](https://obsidian.md) which enables you to use
React components and inline JavaScript directly into your notes. Kinda like
MDX.

![Screenshot](/.github/screenshot.png)

---

## Features

- [x] Embed React components as blocks or inline with text.
- [x] Convenient shorthand syntax for markdown formatting components (like
      `<Callout />`).
- [x] Full-fledged JSX for more complex usecases.
- [x] Inline JS evaluation.
- [x] Code block can export variables accessible to components and other code
      blocks on the page.
- [x] Supports both reading and live preview modes.
- [x] Works in canvas blocks.
- [x] Works on mobile.
- [x] Components are loaded from JS files, so you can use your favorite editor.
- [x] Emera supports TypeScript, ES modules (local and remote), and direct
      import of CSS files.

## Roadmap / What's missing

I'm working on Emera in my free time, so there is no ETA when this will be
implemented (or if it will be implemented at all). But overall, those are
features that I find useful and would like to add to Emera at some point:

- [ ] Better TypeScript DX.
- [ ] Reactive hooks for Obsidian.
- [ ] When renaming file, prompt user to update all Emera code blocks
      referencing this file.
- [ ] Allow widgets to modify their own code. This way you will be able to
      store data in the note, along with the widget itself (istead of using current
      `useStorage` hook).

## How to install

Emera is available in Obsidian plugin catalog, so easiest way to install it is
via Obsidian (Settings -> Community plugins -> Browse -> Search for "Emera").

To install Emera manually you need to download zip file from latest release and
unpack it into `<your vault>/.obisdian/plugins/emera` and enable it in
Obsidian's settings.

## How to use

This section explains the core syntax and provides examples you can copy into
notes.

### Components

After you install and enable Emera, set your components folder in **Emera**
settings. By default it's the `Components` folder in the root of your vault.

Create `index.js` in your components folder and export components:

```jsx
import { Markdown } from 'emera';

export const HelloWorld = ({ name = 'World' }) => {
    return <div>Hello, {name}.</div>;
};

export const HelloWorldInline = ({ name = 'World' }) => {
    return <span>Hello, {name}.</span>;
};

export const RedCallout = ({ children }) => {
    return (
        <div style={{ padding: 20, border: '2px solid red' }}>
            <Markdown>{children}</Markdown>
        </div>
    );
};
```

Then open **Emera** settings and refresh components. Now you can use
`HelloWorld`, `HelloWorldInline`, and `RedCallout` in your notes.

Inline components use the `emera:` prefix. Everything after `emera:` is parsed
as JSX, so you can set props or render children:

```markdown
emera:<HelloWorldInline name="Obsidian" />
```

Block components have two syntaxes:

1. Shorthand for wrapper-style components. Use a code block language of
   `emmd:<ComponentName>`.

````markdown
```emmd:RedCallout
You can use **Markdown** inside `<RedCallout />`.
```
````

In shorthand mode the block content is passed as a string so Markdown formatting
is preserved and can be rendered with the `Markdown` component.

2. JSX blocks for full control. JSX blocks are automatically wrapped in a
   Fragment, so you can render multiple siblings.

````markdown
```emera
<HelloWorld name="Obsidian" />
<HelloWorld name="Emera" />
```
````

If your component handles clicks, Live Preview can enter edit mode on click. To
avoid that, stop event propagation:

```jsx
export const ClickSafe = ({ children }) => {
    return <div onClick={(event) => event.stopPropagation()}>{children}</div>;
};
```

### Vanilla JavaScript

You can use plain JavaScript inline or as blocks. Use the `emjs` language
specifier instead of `emera`.

Inline JavaScript is evaluated and its result replaces the inline element. This
prints the vault name:

```markdown
Vault name: emjs: app.vault.getName()
```

### JavaScript blocks and exports

JavaScript blocks can export values into scope. Exported values become available
for blocks that appear later in the note:

````markdown
```emjs
export const username = 'Ava';
export const greeting = `Hello, ${username}`;
```

```emera
<HelloWorld name={greeting} />
```
````

### Scope

Emera evaluates blocks from top to bottom. Exports only exist for blocks that
appear later in the file. Move `emjs` blocks above the JSX that consumes them.

Root scope values:

- `app` – plugin's app instance.
- `modules` – external modules provided by Emera.

Page scope values:

- `file` – `TFile | null` for the current page (null in canvas blocks).
- `frontmatter` – frontmatter object for the current page.

### Supported features

Emera supports these patterns when building components:

- Split code into multiple files. Only `index.js` is required as an entrypoint.
- Use TypeScript. Type definitions are not bundled.
- Import CSS files to inject styles into the page. CSS modules are not
  supported.
- Import ESM modules from CDNs like `https://esm.sh`.

### Limitations

I tried to make working with Emera as easy as possible, but there are still a
few constraints you need to keep in mind.

- You can't use external modules installed with npm. Use an ESM CDN or place a
  library inside your components folder.
- You can't use Node.js built-in modules.

### Available modules

Emera allows you to import selected external modules. If you want to propose a
package for inclusion, open an issue. The package needs to be small and useful
for a wide range of users.

Currently Emera exposes these modules:

- `emera` – see [Emera module](#emera-module).
- `react` – version 19.
- `react-dom` – version 19, without `react-dom/client` and other submodules.
- `obsidian` – module available to plugins, see
  [Obisdian docs](https://docs.obsidian.md/Home).
- `framer-motion` – animations library, see
  [Framer Motion docs](https://www.framer.com/motion/).
- `jotai` and `jotai/utils` – state management library, see
  [Jotai docs](https://jotai.org/).

### Emera module

Emera exposes a set of components and hooks that are useful when building
components for Obsidian.

- `<Markdown />` – renders markdown using Obsidian's renderer. Props match a
  `div` except `children` must be a string.
- `useEmeraContext()` – exposes `file`, `frontmatter`, and `storage`.
- `useStorage<T>(key: string, defaultValue: T)` – provides persisted plugin-wide
  state with a `useState`-like API.

### Examples folder

This repo includes working examples with JS files and matching notes:

1. Set your components folder to `examples/components`.
2. Refresh components in Emera settings.
3. Open a note from `examples/notes`.

Example notes:

- `examples/notes/01-components.md` – inline and block components.
- `examples/notes/02-inline-js.md` – inline JS, exports, and scope order.
- `examples/notes/04-storage.md` – `useStorage` and `useEmeraContext`.
- `examples/notes/06-motion-and-jotai.md` – framer-motion and Jotai.
- `examples/notes/07-esm-cdn.md` – ESM CDN imports.
- `examples/notes/08-complex-example.md` – full, multi-file example.

## How it works

Emera works completely in browser environment, without access to Node. This was
done to ensure that plguin can be compatible with Obsidian on mobile devices.
However, this also adds quite a lot of limitations.

When you launch Obsidian, Emera will try to transpile and bundle your code (we
call it user module). This step allows you to use TypeScript, import CSS
directly, and most importantly use JSX. To do so, we use special builds of
[Rollup](https://rollupjs.org/faqs/#how-do-i-run-rollup-itself-in-a-browser) and
[Babel](https://babeljs.io/docs/babel-standalone) which can work in browser
environment. However, many Babel and Rollup plugins still require Node
environment, so Emera also includes implementations of virtual filesystem,
styles loader, and own intergration with Babel.

But code can't be just bundled and executed as is. At least, imports won't work.
To fix this, Emera exposes all modules in `window._emeraModules` variable and
provides a Babel plugin which rewrites imports from being
`import { motion } from "framer-motion"` into
`const { motion } = window._emeraModules["framer-motion"];`.

Once code is bundled, Emera will execute it and save all exported functions and
components into "global scope" and they'll become available for Emera and for
any code blocks on page. Note that here scope means abstraction provided by
Emera. Those scopes can be built into tree structure to allow child scopes
access properties from parent scope.

When Emera finds JS or JSX block on page, it will transpile it. But this time,
transpilation will include another plugin, which rewrites access to any unknown
identifier into access to current scope. So `name.toUpperCase()` becomes
`(window._emeraGetScope("<scopeId>").has("name") ?
window._emeraGetScope("<scopeId>").get("name") : name).toUpperCase()`. This
looks monstrous, but fortunately it's only for machines and not for humans to
read.

After that, transpiled code will be executed. Depending on type of block, Emera
will either render React component in place, output result of inline JS
evaluation, or put exported variables into scope and render placeholder for JS
blocks.

To process iterate over code blocks, Emera uses
[editor extension](https://docs.obsidian.md/Plugins/Editor/Editor+extensions)
and
[Markdown post processor](https://docs.obsidian.md/Reference/TypeScript+API/MarkdownPreviewRenderer/registerPostProcessor)
to render inline JS and components in reading mode.

## Reporting bugs, proposing features, and other contributions

This is a project I do for myself and mostly because it's just fun, I love
programming. I'm making this public and open-source in case there are people who
might find it useful. I definetely would like to find something like this
earlier, so I wouldn't need to do most things from scratch. So, here it is, use
as you please.

_I, in fact, found
[obsidian-react-components](https://github.com/elias-sundqvist/obsidian-react-components/)
which helped me to understand how such kind of plugin would work, as I'm still
relatively new to Obsidian._

But with that being said, I run my projects as I find comfortable. So, feel
free to report a bug or a feature, but there is a very slim chance I will
fix/add it, unless it's a critical bug or really cool feature that I'll use
myself. If you want to contribute code, please open an issue first, describing
what you plan to do (unless it's like a really small PR, send those right away).
Or else you risk your PR not being merged, and I don't really want you to waste
your time.

## Support development / say thanks

> [!TIP]
> If you found this plugin useful and wanted to say thanks with a coin, you can
> do so [here](https://sinja.io/support).
