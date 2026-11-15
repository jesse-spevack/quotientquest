import Phaser from "phaser";
import { computeLayout, DESIGN_HEIGHT, DESIGN_WIDTH, type Layout, pixelSpriteScale } from "./layout";

const LAYOUT_EVENT = "layout";

let current: Layout = measure();

function measure(): Layout {
  return computeLayout(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
}

export function initialLayout(): Layout {
  return current;
}

export function watchWindow(game: Phaser.Game) {
  const update = () => {
    current = measure();
    game.scale.resize(current.canvasWidth, current.canvasHeight);
    game.scale.setZoom(1 / current.devicePixelRatio);
    game.events.emit(LAYOUT_EVENT, current);
  };
  window.addEventListener("resize", update);
  window.visualViewport?.addEventListener("resize", update);
  update();
}

export function onLayout(scene: Phaser.Scene, apply: (layout: Layout) => void) {
  const handler = (layout: Layout) => {
    fitCamera(scene.cameras.main, layout);
    apply(layout);
  };
  handler(current);
  scene.game.events.on(LAYOUT_EVENT, handler);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.game.events.off(LAYOUT_EVENT, handler));
}

function fitCamera(camera: Phaser.Cameras.Scene2D.Camera, layout: Layout) {
  const { x, y, width, height } = layout.view;
  camera
    .setViewport(x, y, width, height)
    .setZoom(layout.zoom)
    .centerOn(DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2)
    .setRoundPixels(true);
}

export function fitPixelSprite(sprite: Phaser.GameObjects.Sprite, layout: Layout) {
  sprite.setScale(pixelSpriteScale(layout)).setVertexRoundMode("fullAuto");
}

export function fitText(text: Phaser.GameObjects.Text, layout: Layout) {
  text.setResolution(layout.zoom).setVertexRoundMode("fullAuto");
}
