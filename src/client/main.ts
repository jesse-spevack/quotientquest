import "@fontsource/lilita-one/400.css";
import "@fontsource/nunito/600.css";
import "@fontsource/nunito/800.css";
import Phaser from "phaser";
import { initialLayout, watchWindow } from "./display";
import { BootScene } from "./scenes/BootScene";
import { TitleScene } from "./scenes/TitleScene";
import { colors } from "./theme";

async function start() {
  await Promise.all([document.fonts.load('64px "Lilita One"'), document.fonts.load('800 64px "Nunito"')]);

  const layout = initialLayout();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    width: layout.canvasWidth,
    height: layout.canvasHeight,
    backgroundColor: colors.night,
    pixelArt: true,
    scale: { mode: Phaser.Scale.NONE, zoom: 1 / layout.devicePixelRatio },
    input: { activePointers: 2 },
    scene: [BootScene, TitleScene],
  });

  game.events.once(Phaser.Core.Events.READY, () => watchWindow(game));
}

start();
