import { describe, expect, it } from 'vitest';
import { EditorState, EditorSelection } from '@codemirror/state';
import type { SyntaxNodeRef } from '@lezer/common';
import { isCursorOnSameLineWithNode, isCursorBetweenNodes } from '../src/processors/utils';

const node = (from: number, to: number): SyntaxNodeRef =>
    ({ from, to }) as unknown as SyntaxNodeRef;

const stateWith = (doc: string, ...cursors: number[]): EditorState =>
    EditorState.create({
        doc,
        selection: EditorSelection.create(cursors.map((c) => EditorSelection.cursor(c))),
    });

const stateWithRange = (doc: string, anchor: number, head: number): EditorState =>
    EditorState.create({
        doc,
        selection: EditorSelection.create([EditorSelection.range(anchor, head)]),
    });

const multiCursorStateWith = (doc: string, ...cursors: number[]): EditorState =>
    EditorState.create({
        doc,
        extensions: [EditorState.allowMultipleSelections.of(true)],
        selection: EditorSelection.create(cursors.map((c) => EditorSelection.cursor(c))),
    });

// "aaa\nbbb\nccc\nddd\neee"
//
// Line 1: positions 0–3
// Line 2: positions 4–7
// Line 3: positions 8–11
// Line 4: positions 12–15
// Line 5: positions 16–18
const DOC = 'aaa\nbbb\nccc\nddd\neee';

describe('isCursorOnSameLineWithNode', () => {
    it('returns true when cursor is on the same line as both nodes', () => {
        const state = stateWith(DOC, 5);
        expect(isCursorOnSameLineWithNode(state, node(4, 5), node(6, 7))).toBe(true);
    });

    it('returns true when cursor is on node1 line (nodes span multiple lines)', () => {
        const state = stateWith(DOC, 5);
        expect(isCursorOnSameLineWithNode(state, node(0, 2), node(8, 10))).toBe(true);
    });

    it('returns false when cursor is outside the line range', () => {
        const state = stateWith(DOC, 13);
        expect(isCursorOnSameLineWithNode(state, node(0, 2), node(4, 6))).toBe(false);
    });

    it('respects the allowance parameter', () => {
        const state = stateWith(DOC, 9);
        expect(isCursorOnSameLineWithNode(state, node(4, 5), node(6, 7), 0)).toBe(false);
        expect(isCursorOnSameLineWithNode(state, node(4, 5), node(6, 7), 1)).toBe(true);
    });

    it('returns false when cursor is outside even with allowance', () => {
        const state = stateWith(DOC, 17);
        expect(isCursorOnSameLineWithNode(state, node(4, 5), node(6, 7), 1)).toBe(false);
    });

    it('handles a selection range (not just a cursor)', () => {
        const state = stateWithRange(DOC, 9, 14);
        expect(isCursorOnSameLineWithNode(state, node(0, 2), node(4, 6))).toBe(false);

        const state2 = stateWithRange(DOC, 5, 14);
        expect(isCursorOnSameLineWithNode(state2, node(0, 2), node(8, 10))).toBe(true);
    });

    it('returns true if any cursor in a multi-cursor selection matches', () => {
        const state = multiCursorStateWith(DOC, 1, 9);
        expect(isCursorOnSameLineWithNode(state, node(8, 9), node(10, 11))).toBe(true);
    });

    it('uses node1.from for its line and node2.to for its line', () => {
        const state = stateWith(DOC, 9);
        expect(isCursorOnSameLineWithNode(state, node(0, 5), node(8, 14))).toBe(true);
    });
});

describe('isCursorBetweenNodes', () => {
    it('returns true when cursor is between two nodes', () => {
        const state = stateWith(DOC, 5);
        expect(isCursorBetweenNodes(state, node(0, 3), node(8, 11))).toBe(true);
    });

    it('returns false when cursor is before both nodes', () => {
        const state = stateWith(DOC, 1);
        expect(isCursorBetweenNodes(state, node(8, 11), node(12, 15))).toBe(false);
    });

    it('returns false when cursor is after both nodes', () => {
        const state = stateWith(DOC, 17);
        expect(isCursorBetweenNodes(state, node(0, 3), node(4, 7))).toBe(false);
    });

    it('returns true when cursor is at the ±1 boundary padding', () => {
        const state = stateWith(DOC, 3);
        expect(isCursorBetweenNodes(state, node(4, 7), node(8, 11))).toBe(true);

        const state2 = stateWith(DOC, 12);
        expect(isCursorBetweenNodes(state2, node(4, 7), node(8, 11))).toBe(true);
    });

    it('returns false when cursor is just outside the ±1 padding', () => {
        const state = stateWith(DOC, 2);
        expect(isCursorBetweenNodes(state, node(4, 7), node(8, 11))).toBe(false);

        const state2 = stateWith(DOC, 13);
        expect(isCursorBetweenNodes(state2, node(4, 7), node(8, 11))).toBe(false);
    });

    it('works with nodes in reversed order', () => {
        const state = stateWith(DOC, 5);
        expect(isCursorBetweenNodes(state, node(8, 11), node(0, 3))).toBe(true);
    });

    it('handles a selection range that partially overlaps', () => {
        const state = stateWithRange(DOC, 1, 5);
        expect(isCursorBetweenNodes(state, node(4, 7), node(8, 11))).toBe(true);
    });

    it('returns true if any cursor in a multi-cursor selection matches', () => {
        const state = multiCursorStateWith(DOC, 1, 9);
        expect(isCursorBetweenNodes(state, node(4, 7), node(12, 15))).toBe(true);
    });
});
