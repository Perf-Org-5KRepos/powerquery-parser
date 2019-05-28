// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { Option, CommonError } from "../common";
import { Ast } from "./ast";
import { Token } from "../lexer";

export namespace ParserContext {

    export type NodeMap = Map<number, Node>;

    export interface State {
        readonly root: Root,
        readonly nodesById: NodeMap,
        terminalNodeIds: number[],
        nodeIdCounter: number,
    }

    export interface Root {
        maybeNode: Option<Node>
    }

    export interface Node {
        readonly nodeId: number,
        readonly nodeKind: Ast.NodeKind,
        readonly maybeTokenStart: Option<Token>,
        readonly maybeParentId: Option<number>,
        childNodeIds: number[],
        maybeAstNode: Option<Ast.TNode>,
    }

    export function empty(): State {
        return {
            root: {
                maybeNode: undefined,
            },
            nodesById: new Map(),
            terminalNodeIds: [],
            nodeIdCounter: 0,
        }
    }

    export function expectNode(nodesById: NodeMap, nodeId: number): Node {
        const maybeNode: Option<Node> = maybeGetNode(nodesById, nodeId);
        if (maybeNode === undefined) {
            throw new CommonError.InvariantError(`nodeId (${nodeId}) wasn't in State.`);
        }
        return maybeNode;
    }

    export function addChild(
        state: State,
        maybeParent: Option<Node>,
        nodeKind: Ast.NodeKind,
        tokenStart: Option<Token>,
    ): Node {
        state.nodeIdCounter += 1;
        const newNodeId = state.nodeIdCounter;

        let maybeParentId: Option<number>;
        if (maybeParent) {
            const parent: Node = maybeParent;
            maybeParentId = parent.nodeId;
            parent.childNodeIds.push(newNodeId);
        }
        else {
            maybeParentId = undefined;
        }

        const child: Node = {
            nodeId: state.nodeIdCounter,
            nodeKind,
            maybeTokenStart: tokenStart,
            maybeParentId,
            childNodeIds: [],
            maybeAstNode: undefined,
        }
        state.nodesById.set(child.nodeId, child);

        return child;
    }

    export function endContext(
        state: State,
        oldNode: Node,
        astNode: Ast.TNode,
    ): Option<Node> {
        if (astNode.terminalNode) {
            state.terminalNodeIds.push(oldNode.nodeId);
        }

        oldNode.maybeAstNode = astNode;
        const maybeParentId: Option<number> = oldNode.maybeParentId;
        return maybeParentId !== undefined
            ? expectNode(state.nodesById, maybeParentId)
            : undefined;
    }

    export function deleteContext(
        state: State,
        node: Node,
    ): Option<Node> {
        const nodesById: NodeMap = state.nodesById;
        const terminalNodeIds: number[] = state.terminalNodeIds;

        const maybeParentId: Option<number> = node.maybeParentId;
        const nodeId: number = node.nodeId;

        if (!nodesById.has(nodeId)) {
            throw new CommonError.InvariantError(`node.nodeId not in state: ${nodeId}.`);
        }
        nodesById.delete(nodeId);

        const maybeTerminalIndex = terminalNodeIds.indexOf(nodeId);
        if (maybeTerminalIndex !== -1) {
            const terminalIndex: number = maybeTerminalIndex;
            state.terminalNodeIds = [
                ...terminalNodeIds.slice(0, terminalIndex),
                ...terminalNodeIds.slice(terminalIndex + 1),
            ];
        }

        if (maybeParentId === undefined) {
            return undefined;
        }

        const parentId: number = maybeParentId;
        const parent: Node = expectNode(state.nodesById, parentId);
        const childNodeIds: number[] = parent.childNodeIds;
        const childNodeIndex: number = childNodeIds.indexOf(nodeId);

        if (childNodeIndex === -1) {
            throw new CommonError.InvariantError(`nodeId ${nodeId} considers ${parentId} to be a parent, but isn't listed as a child of the parent.`)
        }

        parent.childNodeIds = [
            ...childNodeIds.slice(0, childNodeIndex),
            ...childNodeIds.slice(childNodeIndex + 1),
        ];

        return parent;
    }

    export function deepCopy(state: State): State {
        const nodesById: NodeMap = new Map<number, Node>();
        state.nodesById.forEach((value: Node, key: number) => {
            nodesById.set(key, deepCopyNode(value));
        });

        return {
            root: {
                maybeNode: maybeGetNode(nodesById, 0),
            },
            nodesById: nodesById,
            terminalNodeIds: state.terminalNodeIds.slice(),
            nodeIdCounter: state.nodeIdCounter,
        }
    }

    function deepCopyNode(node: Node): Node {
        return {
            ...node,
            maybeAstNode: node.maybeAstNode !== undefined
                ? { ...node.maybeAstNode }
                : undefined
        }
    }

    function maybeGetNode(nodesById: NodeMap, nodeId: number): Option<Node> {
        const maybeNode: Option<Node> = nodesById.get(nodeId);
        return maybeNode;
    }
}