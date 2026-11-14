export const DESIGN_WIDTH = 1920;
export const DESIGN_HEIGHT = 1080;
export const ART_ROWS = 270;

export type Rect = { x: number; y: number; width: number; height: number };

export type Layout = {
  canvasWidth: number;
  canvasHeight: number;
  devicePixelRatio: number;
  view: Rect;
  zoom: number;
  pixelScale: number;
};

export function computeLayout(cssWidth: number, cssHeight: number, devicePixelRatio: number): Layout {
  const canvasWidth = Math.max(1, Math.round(cssWidth * devicePixelRatio));
  const canvasHeight = Math.max(1, Math.round(cssHeight * devicePixelRatio));
  const height = snapToEdge(Math.max(1, Math.floor(Math.min(canvasHeight, (canvasWidth * 9) / 16))), canvasHeight);
  const width = snapToEdge(Math.floor((height * 16) / 9), canvasWidth);

  return {
    canvasWidth,
    canvasHeight,
    devicePixelRatio,
    view: {
      x: Math.floor((canvasWidth - width) / 2),
      y: Math.floor((canvasHeight - height) / 2),
      width,
      height,
    },
    zoom: height / DESIGN_HEIGHT,
    pixelScale: Math.max(1, Math.floor(height / ART_ROWS)),
  };
}

// A letterbox thinner than 3 device pixels reads as a stray line, so the play area fills it.
function snapToEdge(size: number, edge: number): number {
  return edge - size < 3 ? edge : size;
}

export function pixelSpriteScale(layout: Layout): number {
  return layout.pixelScale / layout.zoom;
}

export function cssPixels(designPixels: number, layout: Layout): number {
  return (designPixels * layout.zoom) / layout.devicePixelRatio;
}
