import "@fontsource/lilita-one/400.css";
import "@fontsource/nunito/800.css";
import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { TitleScene } from "./scenes/TitleScene";
import { colors, GAME_HEIGHT, GAME_WIDTH } from "./theme";

async function start() {
  await Promise.all([document.fonts.load('64px "Lilita One"'), document.fonts.load('800 64px "Nunito"')]);

  new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: colors.night,
    pixelArt: true,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    input: { activePointers: 2 },
    scene: [BootScene, TitleScene],
  });
}

start();
