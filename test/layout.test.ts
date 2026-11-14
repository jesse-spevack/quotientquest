import { describe, expect, it } from "vitest";
import { computeLayout, cssPixels, pixelSpriteScale } from "../src/client/layout";
import { MIN_TEXT_SIZE } from "../src/client/theme";

const screens = {
  phone: [844, 390, 3],
  smallPhone: [667, 375, 2],
  ipad: [1180, 820, 2],
  desktop: [1440, 900, 2],
  portraitPhone: [390, 844, 3],
} as const;

describe("computeLayout", () => {
  it("sizes the canvas to device pixels", () => {
    const layout = computeLayout(844, 390, 3);

    expect([layout.canvasWidth, layout.canvasHeight]).toEqual([2532, 1170]);
  });

  it("keeps a centered 16:9 play area inside the canvas", () => {
    for (const [width, height, ratio] of Object.values(screens)) {
      const { view, canvasWidth, canvasHeight } = computeLayout(width, height, ratio);

      expect(Math.abs(view.width / view.height - 16 / 9)).toBeLessThan(0.002);
      expect(view.x + view.width).toBeLessThanOrEqual(canvasWidth);
      expect(view.y + view.height).toBeLessThanOrEqual(canvasHeight);
      expect(Math.abs(canvasWidth - view.width - 2 * view.x)).toBeLessThanOrEqual(1);
    }
  });

  it("draws each art pixel as a whole number of device pixels", () => {
    expect(computeLayout(844, 390, 3).pixelScale).toBe(4);
    expect(computeLayout(1180, 820, 2).pixelScale).toBe(4);
    expect(computeLayout(1440, 900, 2).pixelScale).toBe(6);

    for (const [width, height, ratio] of Object.values(screens)) {
      const layout = computeLayout(width, height, ratio);
      expect(pixelSpriteScale(layout) * layout.zoom).toBeCloseTo(layout.pixelScale, 9);
    }
  });

  it("never makes UI text smaller than 16 CSS pixels on a landscape screen", () => {
    for (const [width, height, ratio] of [screens.phone, screens.smallPhone, screens.ipad, screens.desktop]) {
      expect(cssPixels(MIN_TEXT_SIZE, computeLayout(width, height, ratio))).toBeGreaterThanOrEqual(16);
    }
  });
});

it("fills the canvas when the letterbox would be thinner than 3 device pixels", () => {
  const layout = computeLayout(1180, 820, 2);

  expect(layout.view.x).toBe(0);
  expect(layout.view.width).toBe(layout.canvasWidth);
});
