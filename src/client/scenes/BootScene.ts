import Phaser from "phaser";
import { colors, fonts, GAME_HEIGHT, GAME_WIDTH } from "../theme";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  preload() {
    const label = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, "Loading", {
        fontFamily: fonts.body,
        fontSize: "40px",
        color: colors.muted,
      })
      .setOrigin(0.5);
    this.load.on("progress", (progress: number) => label.setText(`Loading ${Math.round(progress * 100)}%`));
    this.load.image("swamp-far", "/assets/swamp-far.webp");
  }

  create() {
    this.scene.start("title");
  }
}
