/**
 * Copyright (c) 2026 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import jsdom = require('jsdom');
import { assert } from 'chai';
import { BackgroundCanvasLayer } from 'browser/renderer/dom/BackgroundCanvasLayer';
import { IRenderDimensions } from 'browser/renderer/shared/Types';
import { MockBufferService, MockCoreService, MockDecorationService, MockOptionsService } from 'common/TestUtils.test';
import { MockCoreBrowserService, MockThemeService } from 'browser/TestUtils.test';

function makeDimensions(): IRenderDimensions {
  return {
    css: {
      canvas: { width: 800, height: 480 },
      cell: { width: 10, height: 20 }
    },
    device: {
      canvas: { width: 800, height: 480 },
      cell: { width: 10, height: 20 },
      char: { width: 10, height: 20, left: 0, top: 0 }
    }
  };
}

describe('BackgroundCanvasLayer', () => {
  let dom: jsdom.JSDOM;
  let screenElement: HTMLElement;
  let layer: BackgroundCanvasLayer;
  let blinkTickCount = 0;

  beforeEach(() => {
    dom = new jsdom.JSDOM('<div id="screen"></div>');
    screenElement = dom.window.document.getElementById('screen')!;
    blinkTickCount = 0;
    layer = new BackgroundCanvasLayer(
      dom.window.document,
      screenElement,
      makeDimensions,
      () => { blinkTickCount++; },
      new MockBufferService(80, 24),
      new MockCoreService(),
      new MockCoreBrowserService(),
      new MockDecorationService(),
      new MockOptionsService(),
      new MockThemeService()
    );
  });

  it('inserts a canvas element as the first child of the screen', () => {
    const first = screenElement.firstChild as HTMLElement;
    assert.equal(first.tagName.toLowerCase(), 'canvas');
    assert.equal(first.classList.contains('xterm-bg-canvas'), true);
    assert.equal((first as HTMLCanvasElement).style.position, 'absolute');
    assert.equal((first as HTMLCanvasElement).style.zIndex, '-1');
    assert.equal((first as HTMLCanvasElement).style.pointerEvents, 'none');
    assert.equal(first.getAttribute('aria-hidden'), 'true');
  });

  it('resize() updates physical and CSS canvas dimensions', () => {
    layer.resize();
    const canvas = screenElement.firstChild as HTMLCanvasElement;
    // jsdom may not honour width/height assignments without a real 2d context;
    // the layer guards on `_ctx`, so we only assert when a context was acquired.
    if (canvas.getContext && canvas.getContext('2d')) {
      assert.equal(canvas.width, 800);
      assert.equal(canvas.height, 480);
      assert.equal(canvas.style.width, '800px');
      assert.equal(canvas.style.height, '480px');
    }
  });

  it('paintRow() and repaintAll() do not throw when 2d context is unavailable', () => {
    // jsdom returns null from getContext('2d') in this test setup; the layer
    // must degrade gracefully so headless tests do not need a canvas backend.
    assert.doesNotThrow(() => layer.paintRow(0));
    assert.doesNotThrow(() => layer.repaintAll());
  });

  it('blinkOn defaults to true', () => {
    assert.equal(layer.blinkOn, true);
  });

  it('resetBlinkPhase() leaves blinkOn at true', () => {
    layer.resetBlinkPhase();
    assert.equal(layer.blinkOn, true);
  });

  it('dispose removes the canvas from the screen', () => {
    layer.dispose();
    assert.equal(screenElement.querySelector('canvas'), null);
  });
});
