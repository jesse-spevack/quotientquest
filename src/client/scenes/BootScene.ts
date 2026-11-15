import Phaser from "phaser";
import { fitText, onLayout } from "../display";
import { DESIGN_HEIGHT, DESIGN_WIDTH } from "../layout";
import { colors, fonts, MIN_TEXT_SIZE } from "../theme";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  preload() {
    const label = this.add
      .text(DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2, "Loading", {
        fontFamily: fonts.body,
        fontStyle: "800",
        fontSize: `${MIN_TEXT_SIZE}px`,
        color: colors.muted,
      })
      .setOrigin(0.5);
    onLayout(this, (layout) => fitText(label, layout));
    this.load.on("progress", (progress: number) => label.setText(`Loading ${Math.round(progress * 100)}%`));

    this.load.image("swamp-far", "/assets/swamp-far.webp");
    this.load.image("swamp-near", "/assets/swamp-near.webp");
    this.load.spritesheet("ranger", "/assets/ranger.png", { frameWidth: 160, frameHeight: 160 });
    this.load.spritesheet("bigfoot", "/assets/bigfoot.png", { frameWidth: 160, frameHeight: 160 });
  }

  create() {
    this.textures.get("swamp-far").setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.textures.get("swamp-near").setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.anims.create({
      key: "ranger-idle",
      frames: this.anims.generateFrameNumbers("ranger", { start: 0, end: 8 }),
      frameRate: 8,
      repeat: -1,
    });
    this.anims.create({
      key: "bigfoot-idle",
      frames: this.anims.generateFrameNumbers("bigfoot", { start: 0, end: 1 }),
      frameRate: 3,
      repeat: -1,
    });
    this.scene.start("title");
  }
}
