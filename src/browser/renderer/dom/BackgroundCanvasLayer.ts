/**
 * Copyright (c) 2026 The xterm.js authors. All rights reserved.
 * @license MIT
 *
 * BackgroundCanvasLayer
 *
 * Renders cell background colors and the block cursor onto a single canvas
 * positioned behind the DOM rows container. The DOM renderer would otherwise
 * paint cell BGs via per-span `background-color`, which on transparent
 * webview backgrounds produces sub-pixel hairline gaps between adjacent
 * same-color cells (the OS desktop bleeds through). By moving cell BG paint
 * to a canvas with `cellWidth + 1` per fillRect, neighbours overlap by 1
 * device pixel and the seam disappears — without sacrificing the DOM-based
 * glyph / IME / accessibility stack.
 *
 * Cells with the default background are intentionally NOT painted, so a
 * `Terminal({ allowTransparency: true })` keeps showing the page through.
 *
 * Selection BG stays in the existing DOM `_selectionContainer` (z-index above
 * this canvas + the rows). Decoration BG overrides ARE applied here.
 */

import { CellData } from 'common/buffer/CellData';
import { Attributes } from 'common/buffer/Constants';
import { channels, color } from 'common/Color';
import { ICellData, IColor } from 'common/Types';
import { IRenderDimensions } from 'browser/renderer/shared/Types';
import { ICoreBrowserService, IThemeService } from 'browser/services/Services';
import { IBufferService, ICoreService, IDecorationService, IOptionsService } from 'common/services/Services';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';

const CANVAS_CLASS = 'xterm-bg-canvas';
const BLINK_INTERVAL_MS = 530;

export class BackgroundCanvasLayer extends Disposable {
  private _canvas: HTMLCanvasElement;
  private _ctx: CanvasRenderingContext2D | null;
  private _workCell: CellData = new CellData();

  private _blinkOn: boolean = true;
  private _blinkTimer: ReturnType<typeof setInterval> | null = null;
  private _onBlinkTick: () => void;

  public get blinkOn(): boolean {
    return this._blinkOn;
  }

  constructor(
    private readonly _document: Document,
    private readonly _screenElement: HTMLElement,
    private readonly _getDimensions: () => IRenderDimensions,
    onBlinkTick: () => void,
    private readonly _bufferService: IBufferService,
    private readonly _coreService: ICoreService,
    private readonly _coreBrowserService: ICoreBrowserService,
    private readonly _decorationService: IDecorationService,
    private readonly _optionsService: IOptionsService,
    private readonly _themeService: IThemeService
  ) {
    super();
    this._onBlinkTick = onBlinkTick;

    this._canvas = this._document.createElement('canvas');
    this._canvas.classList.add(CANVAS_CLASS);
    this._canvas.setAttribute('aria-hidden', 'true');
    this._canvas.style.position = 'absolute';
    this._canvas.style.top = '0';
    this._canvas.style.left = '0';
    // -1 keeps the canvas behind the static `.xterm-rows` block container.
    // The DomRenderer injects `isolation: isolate` on `.xterm-screen` so this
    // negative index can't escape the screen's stacking context.
    this._canvas.style.zIndex = '-1';
    this._canvas.style.pointerEvents = 'none';
    // Insert before any existing children so DOM rows / selection / decorations
    // stack above us via document order.
    this._screenElement.insertBefore(this._canvas, this._screenElement.firstChild);

    this._ctx = this._safeGetContext();

    this._register(toDisposable(() => {
      this._stopBlinkTimer();
      this._canvas.remove();
      this._ctx = null;
    }));
  }

  /** Sync canvas physical buffer + CSS size to current dimensions. Caller should follow with `repaintAll()`. */
  public resize(): void {
    if (!this._ctx) return;
    const dim = this._getDimensions();
    this._canvas.width = Math.max(1, Math.floor(dim.device.canvas.width));
    this._canvas.height = Math.max(1, Math.floor(dim.device.canvas.height));
    this._canvas.style.width = `${dim.css.canvas.width}px`;
    this._canvas.style.height = `${dim.css.canvas.height}px`;
  }

  public repaintAll(): void {
    if (!this._ctx) return;
    this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    const rows = this._bufferService.rows;
    for (let y = 0; y < rows; y++) {
      this._paintRow(y, /* skipClear */ true);
    }
    this._maintainBlinkTimer();
  }

  /** Paint backgrounds + (when applicable) cursor block for viewport row `y`. */
  public paintRow(y: number): void {
    if (!this._ctx) return;
    this._paintRow(y, /* skipClear */ false);
    this._maintainBlinkTimer();
  }

  /** Reset blink phase to ON, e.g. on cursor move from input. */
  public resetBlinkPhase(): void {
    this._blinkOn = true;
    if (this._blinkTimer) {
      this._stopBlinkTimer();
      this._maintainBlinkTimer();
    }
  }

  private _paintRow(y: number, skipClear: boolean): void {
    const ctx = this._ctx!;
    const dim = this._getDimensions();
    const cellW = dim.device.cell.width;
    const cellH = dim.device.cell.height;
    if (cellW <= 0 || cellH <= 0) return;

    const buffer = this._bufferService.buffer;
    const row = y + buffer.ydisp;
    const line = buffer.lines.get(row);
    if (!line) return;

    const yPx = Math.round(y * cellH);
    const rowHeightPx = Math.ceil(cellH);
    if (!skipClear) {
      ctx.clearRect(0, yPx, this._canvas.width, rowHeightPx + 1);
    }

    const cols = this._bufferService.cols;
    const cursorAbsoluteY = buffer.ybase + buffer.y;
    const cursorX = Math.min(buffer.x, cols - 1);
    const isCursorRow = row === cursorAbsoluteY;

    let runStart = -1;
    let runColor: string | null = null;

    const flush = (endExclusive: number): void => {
      if (runStart < 0 || runColor === null) return;
      const xPx = Math.round(runStart * cellW);
      const widthPx = Math.round((endExclusive - runStart) * cellW) + 1;
      ctx.fillStyle = runColor;
      ctx.fillRect(xPx, yPx, widthPx, rowHeightPx);
      runStart = -1;
      runColor = null;
    };

    for (let x = 0; x < cols; x++) {
      line.loadCell(x, this._workCell);
      const width = this._workCell.getWidth();
      if (width === 0) continue;

      const css = this._resolveCellBg(this._workCell, x, row);
      if (css === null) {
        flush(x);
      } else if (css !== runColor) {
        flush(x);
        runStart = x;
        runColor = css;
      }
      if (width > 1) x += width - 1;
    }
    flush(cols);

    if (isCursorRow && this._shouldPaintBlockCursor()) {
      ctx.fillStyle = this._themeService.colors.cursor.css;
      const xPx = Math.round(cursorX * cellW);
      ctx.fillRect(xPx, yPx, Math.round(cellW) + 1, rowHeightPx);
    }
  }

  private _resolveCellBg(cell: ICellData, x: number, row: number): string | null {
    const colors = this._themeService.colors;
    let bg = cell.getBgColor();
    let bgColorMode = cell.getBgColorMode();
    let fg = cell.getFgColor();
    let fgColorMode = cell.getFgColorMode();
    const isInverse = !!cell.isInverse();
    if (isInverse) {
      const tmp = fg; fg = bg; bg = tmp;
      const tmp2 = fgColorMode; fgColorMode = bgColorMode; bgColorMode = tmp2;
    }

    let resolved: IColor | undefined;
    let isTop = false;
    this._decorationService.forEachDecorationAtCell(x, row, undefined, d => {
      if (d.options.layer !== 'top' && isTop) return;
      if (d.backgroundColorRGB) {
        resolved = d.backgroundColorRGB;
      }
      isTop = d.options.layer === 'top';
    });

    if (!resolved) {
      switch (bgColorMode) {
        case Attributes.CM_P16:
        case Attributes.CM_P256:
          resolved = colors.ansi[bg];
          break;
        case Attributes.CM_RGB:
          resolved = channels.toColor((bg >> 16) & 0xFF, (bg >> 8) & 0xFF, bg & 0xFF);
          break;
        case Attributes.CM_DEFAULT:
        default:
          if (isInverse) {
            resolved = colors.foreground;
          } else {
            return null;
          }
      }
    }

    if (cell.isDim()) {
      resolved = color.multiplyOpacity(resolved, 0.5);
    }
    return resolved.css;
  }

  private _shouldPaintBlockCursor(): boolean {
    if (this._coreService.isCursorHidden) return false;
    if (!this._coreService.isCursorInitialized) return false;
    const isFocused = this._coreBrowserService.isFocused;
    const cursorStyle = this._coreService.decPrivateModes.cursorStyle ?? this._optionsService.rawOptions.cursorStyle;
    const cursorInactiveStyle = this._optionsService.rawOptions.cursorInactiveStyle;
    if (isFocused) {
      if (cursorStyle !== 'block') return false;
      const cursorBlink = this._coreService.decPrivateModes.cursorBlink ?? this._optionsService.rawOptions.cursorBlink;
      if (cursorBlink && !this._blinkOn) return false;
      return true;
    }
    return cursorInactiveStyle === 'block';
  }

  private _maintainBlinkTimer(): void {
    const isFocused = this._coreBrowserService.isFocused;
    const cursorStyle = this._coreService.decPrivateModes.cursorStyle ?? this._optionsService.rawOptions.cursorStyle;
    const cursorBlink = this._coreService.decPrivateModes.cursorBlink ?? this._optionsService.rawOptions.cursorBlink;
    const shouldBlink =
      isFocused &&
      cursorStyle === 'block' &&
      !!cursorBlink &&
      !this._coreService.isCursorHidden &&
      this._coreService.isCursorInitialized;

    if (shouldBlink && !this._blinkTimer) {
      this._blinkTimer = setInterval(() => {
        this._blinkOn = !this._blinkOn;
        try {
          this._onBlinkTick();
        } catch {
          // never let a bad redraw kill the timer
        }
      }, BLINK_INTERVAL_MS);
    } else if (!shouldBlink && this._blinkTimer) {
      this._stopBlinkTimer();
    }
  }

  private _stopBlinkTimer(): void {
    if (this._blinkTimer) {
      clearInterval(this._blinkTimer);
      this._blinkTimer = null;
    }
    this._blinkOn = true;
  }

  private _safeGetContext(): CanvasRenderingContext2D | null {
    try {
      return this._canvas.getContext('2d', { alpha: true }) ?? null;
    } catch {
      return null;
    }
  }
}
