# Inline JavaScript, exports, and scope order

This note shows inline JavaScript and how scope order works.

Vault name: emjs: app.vault.getName()

```emjs
export const username = 'Ava';
export const greeting = `Hello, ${username}`;
```

```emera
<HelloWorld name={greeting} />
```

If you move the `emjs` block below this JSX block, `greeting` is undefined.
