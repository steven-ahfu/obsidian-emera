import { describe, expect, it, vi } from 'vitest';
import { ScopeNode } from '../src/scope';

describe('ScopeNode', () => {
    describe('get / set / has', () => {
        it('stores and retrieves values', () => {
            const scope = new ScopeNode('test');
            scope.set('x', 42);
            expect(scope.get('x')).toBe(42);
            expect(scope.has('x')).toBe(true);
        });

        it('has returns false for missing keys', () => {
            const scope = new ScopeNode('test');
            expect(scope.has('missing')).toBe(false);
        });

        it('setMany sets multiple values at once', () => {
            const scope = new ScopeNode('test');
            scope.setMany({ a: 1, b: 2, c: 3 });
            expect(scope.get('a')).toBe(1);
            expect(scope.get('b')).toBe(2);
            expect(scope.get('c')).toBe(3);
        });

        it('throws when accessing a property not in scope', () => {
            const scope = new ScopeNode('test');
            expect(() => scope.get('nonexistent')).toThrow("isn't present in current scope");
        });
    });

    describe('parent chain', () => {
        it('inherits values from parent scope', () => {
            const parent = new ScopeNode('parent');
            const child = new ScopeNode('child');
            parent.addChild(child);
            parent.set('inherited', 'from-parent');

            expect(child.has('inherited')).toBe(true);
            expect(child.get('inherited')).toBe('from-parent');
        });

        it('child values shadow parent values', () => {
            const parent = new ScopeNode('parent');
            const child = new ScopeNode('child');
            parent.addChild(child);
            parent.set('x', 'parent-value');
            child.set('x', 'child-value');

            expect(child.get('x')).toBe('child-value');
            expect(parent.get('x')).toBe('parent-value');
        });

        it('getAll merges parent and own scope', () => {
            const parent = new ScopeNode('parent');
            const child = new ScopeNode('child');
            parent.addChild(child);
            parent.set('a', 1);
            child.set('b', 2);

            const all = child.getAll();
            expect(all.a).toBe(1);
            expect(all.b).toBe(2);
        });

        it('throws when adding a scope that already has a parent', () => {
            const parent1 = new ScopeNode('p1');
            const parent2 = new ScopeNode('p2');
            const child = new ScopeNode('child');
            parent1.addChild(child);
            expect(() => parent2.addChild(child)).toThrow('scope is already in tree');
        });
    });

    describe('block / unblock / waitForUnblock', () => {
        it('isBlocked reflects block state', () => {
            const scope = new ScopeNode('test');
            expect(scope.isBlocked).toBe(false);
            scope.block();
            expect(scope.isBlocked).toBe(true);
            scope.unblock();
            expect(scope.isBlocked).toBe(false);
        });

        it('child isBlocked when parent is blocked', () => {
            const parent = new ScopeNode('parent');
            const child = new ScopeNode('child');
            parent.addChild(child);

            parent.block();
            expect(child.isBlocked).toBe(true);

            parent.unblock();
            expect(child.isBlocked).toBe(false);
        });

        it('waitForUnblock resolves immediately when not blocked', async () => {
            const scope = new ScopeNode('test');
            await scope.waitForUnblock();
        });

        it('waitForUnblock resolves when scope is unblocked', async () => {
            const scope = new ScopeNode('test');
            scope.block();

            let resolved = false;
            const promise = scope.waitForUnblock().then(() => {
                resolved = true;
            });

            expect(resolved).toBe(false);
            scope.unblock();
            await promise;
            expect(resolved).toBe(true);
        });

        it('waitForUnblock times out', async () => {
            const scope = new ScopeNode('test');
            scope.block();

            await expect(scope.waitForUnblock(10)).rejects.toThrow('unblock timed out');
            scope.unblock();
        });

        it('multiple block calls are idempotent', () => {
            const scope = new ScopeNode('test');
            scope.block();
            scope.block();
            expect(scope.isBlocked).toBe(true);
            scope.unblock();
            expect(scope.isBlocked).toBe(false);
        });

        it('unblock when not blocked is a no-op', () => {
            const scope = new ScopeNode('test');
            scope.unblock();
            expect(scope.isBlocked).toBe(false);
        });
    });

    describe('onChange listeners', () => {
        it('fires listener on set', async () => {
            const scope = new ScopeNode('test');
            const cb = vi.fn();
            scope.onChange(cb);
            scope.set('x', 1);

            // onChange is deferred via setTimeout
            await new Promise((r) => setTimeout(r, 10));
            expect(cb).toHaveBeenCalled();
        });

        it('unsubscribe stops future notifications', async () => {
            const scope = new ScopeNode('test');
            const cb = vi.fn();
            const unsub = scope.onChange(cb);
            unsub();

            scope.set('x', 1);
            await new Promise((r) => setTimeout(r, 10));
            // The initial constructor reset schedules a call, but after unsub
            // nothing new should fire
            const callCountAfterUnsub = cb.mock.calls.length;
            scope.set('y', 2);
            await new Promise((r) => setTimeout(r, 10));
            expect(cb.mock.calls.length).toBe(callCountAfterUnsub);
        });

        it('propagates onChange to children', async () => {
            const parent = new ScopeNode('parent');
            const child = new ScopeNode('child');
            parent.addChild(child);

            const cb = vi.fn();
            child.onChange(cb);
            parent.set('x', 1);

            await new Promise((r) => setTimeout(r, 10));
            expect(cb).toHaveBeenCalled();
        });
    });

    describe('dispose', () => {
        it('removes scope from parent children', () => {
            const parent = new ScopeNode('parent');
            const child = new ScopeNode('child');
            parent.addChild(child);

            expect(parent.children).toContain(child);
            child.dispose();
            expect(parent.children).not.toContain(child);
        });

        it('clears listeners on dispose', async () => {
            const scope = new ScopeNode('test');
            const cb = vi.fn();
            scope.onChange(cb);
            const callsBefore = cb.mock.calls.length;

            scope.dispose();
            scope.set('x', 1);
            await new Promise((r) => setTimeout(r, 10));
            expect(cb.mock.calls.length).toBe(callsBefore);
        });

        it('disposeDescendants removes all children', () => {
            const parent = new ScopeNode('parent');
            parent.addChild(new ScopeNode('c1'));
            parent.addChild(new ScopeNode('c2'));
            parent.addChild(new ScopeNode('c3'));

            parent.disposeDescendants();
            expect(parent.children).toHaveLength(0);
        });

        it('unblocks on dispose', () => {
            const scope = new ScopeNode('test');
            scope.block();
            expect(scope.isBlocked).toBe(true);
            scope.dispose();
            expect(scope.isBlocked).toBe(false);
        });
    });

    describe('getDescendant', () => {
        it('finds self by id', () => {
            const scope = new ScopeNode('root');
            expect(scope.getDescendant('root')).toBe(scope);
        });

        it('finds nested descendants', () => {
            const root = new ScopeNode('root');
            const child = new ScopeNode('child');
            const grandchild = new ScopeNode('grandchild');
            root.addChild(child);
            child.addChild(grandchild);

            expect(root.getDescendant('grandchild')).toBe(grandchild);
        });

        it('returns undefined for unknown id', () => {
            const scope = new ScopeNode('root');
            expect(scope.getDescendant('unknown')).toBeUndefined();
        });
    });

    describe('tree traversal', () => {
        it('mapUp collects from self to root', () => {
            const root = new ScopeNode('root');
            const child = new ScopeNode('child');
            const grandchild = new ScopeNode('grandchild');
            root.addChild(child);
            child.addChild(grandchild);

            const ids = grandchild.mapUp((s) => s.id);
            expect(ids).toEqual(['grandchild', 'child', 'root']);
        });

        it('findUp returns first matching ancestor', () => {
            const root = new ScopeNode('root');
            const child = new ScopeNode('child');
            root.addChild(child);

            // Use id check since has() traverses parent chain
            const found = child.findUp((s) => s.id === 'root');
            expect(found?.id).toBe('root');
        });

        it('findUp returns self when self matches', () => {
            const root = new ScopeNode('root');
            const child = new ScopeNode('child');
            root.addChild(child);

            const found = child.findUp((s) => s.id === 'child');
            expect(found?.id).toBe('child');
        });

        it('findUp returns null when nothing matches', () => {
            const scope = new ScopeNode('test');
            expect(scope.findUp(() => false)).toBeNull();
        });

        it('mapDown collects from self to leaves', () => {
            const root = new ScopeNode('root');
            const child1 = new ScopeNode('c1');
            const child2 = new ScopeNode('c2');
            root.addChild(child1);
            root.addChild(child2);

            const ids = root.mapDown((s) => s.id);
            expect(ids).toEqual(['root', 'c1', 'c2']);
        });
    });

    describe('reset', () => {
        it('clears own scope values', () => {
            const scope = new ScopeNode('test');
            scope.set('x', 42);
            scope.reset();
            expect(scope.has('x')).toBe(false);
        });

        it('preserves parent linkage after reset', () => {
            const parent = new ScopeNode('parent');
            const child = new ScopeNode('child');
            parent.addChild(child);
            parent.set('inherited', 'value');
            child.reset();

            expect(child.has('inherited')).toBe(true);
            expect(child.get('inherited')).toBe('value');
        });
    });
});
