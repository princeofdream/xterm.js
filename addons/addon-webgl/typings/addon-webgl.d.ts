/**
 * Copyright (c) 2017 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { Terminal, ITerminalAddon, IEvent } from '@xterm/xterm';

declare module '@xterm/addon-webgl' {
  /**
   * Text shadow options (ackshell patch). Offsets are in CSS pixels and are
   * multiplied by the device pixel ratio internally.
   */
  export interface ITextShadowOptions {
    /** Horizontal offset in CSS pixels (default 0) */
    offsetX?: number;
    /** Vertical offset in CSS pixels (default 1) */
    offsetY?: number;
    /** Opacity of the primary shadow, 0..1 (default 0.9) */
    alpha?: number;
    /** Extra soft layers below the primary shadow, 0..4 (default 1) */
    passes?: number;
    /**
     * Shadow color (0..1 per channel). Defaults to black; WebglRenderer picks
     * black or white automatically from the theme background luminance.
     */
    color?: { r: number; g: number; b: number };
  }

  /**
   * An xterm.js addon that provides hardware-accelerated rendering functionality via WebGL.
   */
  export class WebglAddon implements ITerminalAddon {
    public textureAtlas?: HTMLCanvasElement;

    /**
     * An event that is fired when the renderer loses its canvas context.
     */
    public readonly onContextLoss: IEvent<void>;

    /**
     * An event that is fired when the texture atlas of the renderer changes.
     */
    public readonly onChangeTextureAtlas: IEvent<HTMLCanvasElement>;

    /**
     * An event that is fired when the a new page is added to the texture atlas.
     */
    public readonly onAddTextureAtlasCanvas: IEvent<HTMLCanvasElement>;

    /**
     * An event that is fired when the a page is removed from the texture atlas.
     */
    public readonly onRemoveTextureAtlasCanvas: IEvent<HTMLCanvasElement>;

    constructor(preserveDrawingBuffer?: boolean);

    /**
     * Activates the addon.
     * @param terminal The terminal the addon is being loaded in.
     */
    public activate(terminal: Terminal): void;

    /**
     * Disposes the addon.
     */
    public dispose(): void;

    /**
     * Clears the terminal's texture atlas and triggers a redraw.
     */
    public clearTextureAtlas(): void;

    /**
     * Enables or disables a glyph drop shadow (ackshell patch). Safe to call
     * before the addon is activated; the state is applied once the renderer
     * exists.
     */
    public setTextShadow(enabled: boolean, options?: ITextShadowOptions): void;
  }
}
