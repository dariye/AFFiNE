import EventEmitter from 'eventemitter3';

import { domToRect, Rect } from '@toeverything/utils';
import type { Editor as Block_editor } from '../editor';

import { AsyncBlock } from '../block';

type VerticalTypes = 'up' | 'down' | null;
type HorizontalTypes = 'left' | 'right' | null;

export class ScrollManager {
    private _editor: Block_editor;
    private _animationFrame: null | number = null;
    private _eventName = 'scrolling';
    private _currentMoveDirection: [HorizontalTypes, VerticalTypes] = [
        null,
        null,
    ];

    private _scrollMoveOffset = 8;
    private _scrollingEvent = new EventEmitter();

    constructor(editor: Block_editor) {
        this._editor = editor;
        console.log('scrollmanager constructor', this._editor.ui_container);
    }

    private _updateScrollInfo(left: number, top: number) {
        this.scrollTop = top;
        this.scrollLeft = left;
    }

    public onScrolling(
        cb: (args: { direction: [HorizontalTypes, VerticalTypes] }) => void
    ) {
        this._scrollingEvent.on(this._eventName, cb);
    }
    public removeScrolling(
        cb: (args: { direction: [HorizontalTypes, VerticalTypes] }) => void
    ) {
        this._scrollingEvent.removeListener(this._eventName, cb);
    }

    public get scrollContainer() {
        return this._editor.ui_container;
    }

    public get verticalScrollTriggerDistance() {
        return 15;
    }
    public get horizontalScrollTriggerDistance() {
        // Set horizon distance when support horizontal scroll
        return -1;
    }

    public get scrollTop() {
        return this._editor.ui_container.scrollTop;
    }
    public set scrollTop(top: number) {
        this._editor.ui_container.scrollTop = top;
    }
    public get scrollLeft() {
        return this._editor.ui_container.scrollLeft;
    }
    public set scrollLeft(left: number) {
        this._editor.ui_container.scrollLeft = left;
    }
    public get scrollMoveOffset() {
        return this._scrollMoveOffset;
    }
    public get scrollingEvent() {
        return this._scrollingEvent;
    }

    public scrollTo({
        top,
        left,
        behavior = 'smooth',
    }: {
        top?: number;
        left?: number;
        behavior?: ScrollBehavior; // "auto" | "smooth";
    }) {
        top = top !== undefined ? top : this.scrollContainer.scrollTop;
        left = left !== undefined ? left : this.scrollContainer.scrollLeft;

        if (behavior === 'smooth') {
            this._editor.ui_container.scrollBy({
                top,
                left,
                behavior,
            });
        } else {
            this._editor.ui_container.scrollTo(left, top);
        }
    }

    public async scrollIntoViewByBlockId(
        blockId: string,
        behavior: ScrollBehavior = 'smooth'
    ) {
        const block = await this._editor.getBlockById(blockId);

        await this.scrollIntoViewByBlock(block, behavior);
    }

    public async scrollIntoViewByBlock(
        block: AsyncBlock,
        behavior: ScrollBehavior = 'smooth'
    ) {
        if (!block.dom) {
            return console.warn(`Block is not exist.`);
        }
        const containerRect = domToRect(this._editor.ui_container);
        const blockRect = domToRect(block.dom);

        const blockRelativeTopToEditor =
            blockRect.top - containerRect.top - containerRect.height / 4;
        const blockRelativeLeftToEditor = blockRect.left - containerRect.left;

        this.scrollTo({
            left: blockRelativeLeftToEditor,
            top: blockRelativeTopToEditor,
            behavior,
        });
        this._updateScrollInfo(
            blockRelativeLeftToEditor,
            blockRelativeTopToEditor
        );
    }

    public async keepBlockInView(
        blockIdOrBlock: string | AsyncBlock,
        behavior: ScrollBehavior = 'auto'
    ) {
        const block =
            typeof blockIdOrBlock === 'string'
                ? await this._editor.getBlockById(blockIdOrBlock)
                : blockIdOrBlock;

        if (!block.dom) {
            return console.warn(`Block is not exist.`);
        }
        const blockRect = domToRect(block.dom);

        const value = this._getKeepInViewParams(blockRect);

        if (value !== 0) {
            this.scrollTo({
                top: this.scrollTop + blockRect.height * value,
                behavior,
            });
        }
    }

    private _getKeepInViewParams(blockRect: Rect) {
        const { top, bottom } = domToRect(this._editor.ui_container);
        if (blockRect.top <= top + blockRect.height * 3) {
            return -1;
        }

        if (blockRect.bottom >= bottom - blockRect.height * 3) {
            return 1;
        }
        return 0;
    }

    public scrollToBottom(behavior: ScrollBehavior = 'auto') {
        const containerRect = domToRect(this.scrollContainer);
        const scrollTop =
            this.scrollContainer.scrollHeight - containerRect.height;
        this.scrollTo({ top: scrollTop, behavior });
    }

    public scrollToTop(behavior: ScrollBehavior = 'auto') {
        this.scrollTo({ top: 0, behavior });
    }

    private _autoScroll() {
        const xValue =
            this._currentMoveDirection[0] === 'left'
                ? -1
                : this._currentMoveDirection[0] === 'right'
                ? 1
                : 0;
        const yValue =
            this._currentMoveDirection[1] === 'up'
                ? -1
                : this._currentMoveDirection[1] === 'down'
                ? 1
                : 0;

        const horizontalOffset = this._scrollMoveOffset * xValue;
        const verticalOffset = this._scrollMoveOffset * yValue;

        const calcLeft = this.scrollLeft + horizontalOffset;
        const calcTop = this.scrollTop + verticalOffset;
        //  If the scrollbar is out of range, the event is no longer fired
        if (
            (calcTop <= 0 ||
                calcTop >=
                    this.scrollContainer.scrollHeight -
                        this.scrollContainer.offsetHeight) &&
            (calcLeft <= 0 ||
                calcLeft >=
                    this.scrollContainer.scrollWidth -
                        this.scrollContainer.offsetWidth)
        ) {
            return;
        }

        this._animationFrame = requestAnimationFrame(() => {
            const left = this.scrollLeft + horizontalOffset;
            const top = this.scrollTop + verticalOffset;

            this.scrollTo({
                left,
                top,
                behavior: 'auto',
            });
            this._updateScrollInfo(left, top);
            this._scrollingEvent.emit(this._eventName, {
                direction: this._currentMoveDirection,
            });
            this._autoScroll();
        });
    }

    public startAutoScroll(direction: [HorizontalTypes, VerticalTypes]) {
        if (direction[0] === null && direction[1] === null) {
            this._currentMoveDirection = direction;
            this.stopAutoScroll();
            return;
        }
        if (
            direction[0] !== this._currentMoveDirection[0] ||
            direction[1] !== this._currentMoveDirection[1]
        ) {
            this._currentMoveDirection = direction;
            this.stopAutoScroll();
        } else {
            return;
        }
        this._autoScroll();
    }
    public stopAutoScroll() {
        if (this._animationFrame) {
            cancelAnimationFrame(this._animationFrame);
            this._animationFrame = null;
        }
    }
}
