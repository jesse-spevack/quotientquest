import Phaser from "phaser";
import { connectToHub, type ServerStatus } from "../serverLink";
import { colors, fonts, GAME_HEIGHT, GAME_WIDTH } from "../theme";

export class TitleScene extends Phaser.Scene {
  private statusText!: Phaser.GameObjects.Text;

  constructor() {
    super("title");
  }

  create() {
    this.textures.get("swamp-far").setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, "swamp-far").setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, colors.night, 0.35);

    this.add
      .text(GAME_WIDTH / 2, 400, "Quotient Quest", {
        fontFamily: fonts.display,
        fontSize: "168px",
        color: colors.firefly,
        stroke: "#0b1420",
        strokeThickness: 18,
      })
      .setOrigin(0.5)
      .setShadow(0, 10, "#000000", 24, true, true);

    this.add
      .text(GAME_WIDTH / 2, 560, "Math battles in the swamp", {
        fontFamily: fonts.body,
        fontStyle: "800",
        fontSize: "52px",
        color: colors.moonlight,
      })
      .setOrigin(0.5);

    this.statusText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 90, "", { fontFamily: fonts.body, fontStyle: "800", fontSize: "40px" })
      .setOrigin(0.5);

    const disconnect = connectToHub((status) => this.showStatus(status));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, disconnect);
  }

  private showStatus(status: ServerStatus) {
    if (status.state === "connecting") {
      this.statusText.setText("Server: connecting").setColor(colors.muted);
    } else if (status.state === "connected") {
      this.statusText.setText("Server: connected").setColor(colors.online);
    } else {
      this.statusText.setText("Server: offline").setColor(colors.offline);
    }
  }
}
