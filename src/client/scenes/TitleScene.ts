import Phaser from "phaser";
import { AccountScreens } from "../account/AccountScreens";
import { fitPixelSprite, fitText, onLayout } from "../display";
import { DESIGN_HEIGHT, DESIGN_WIDTH } from "../layout";
import { connectToHub, type ServerStatus } from "../serverLink";
import { colors, fonts, MIN_TEXT_SIZE } from "../theme";

const FEET_Y = 840;
const BOARDWALK_TOP = 705;
const FEET_ROW = 156 / 160;

export class TitleScene extends Phaser.Scene {
  private statusText!: Phaser.GameObjects.Text;
  private disconnect: (() => void) | null = null;

  constructor() {
    super("title");
  }

  create() {
    this.add.image(DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2, "swamp-far").setDisplaySize(DESIGN_WIDTH, DESIGN_HEIGHT);
    this.add.rectangle(DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2, DESIGN_WIDTH, DESIGN_HEIGHT, colors.night, 0.35);
    this.add.image(DESIGN_WIDTH / 2, BOARDWALK_TOP, "swamp-near").setOrigin(0.5, 0);

    const ranger = this.add.sprite(250, FEET_Y, "ranger").setOrigin(0.5, FEET_ROW).setTint(colors.moonTint);
    const bigfoot = this.add
      .sprite(DESIGN_WIDTH - 250, FEET_Y, "bigfoot")
      .setOrigin(0.5, FEET_ROW)
      .setFlipX(true)
      .setTint(colors.moonTint);
    ranger.play("ranger-idle");
    bigfoot.play("bigfoot-idle");

    const title = this.add
      .text(DESIGN_WIDTH / 2, 400, "Quotient Quest", {
        fontFamily: fonts.display,
        fontSize: "168px",
        color: colors.firefly,
        stroke: colors.nightText,
        strokeThickness: 18,
      })
      .setOrigin(0.5)
      .setShadow(0, 10, "#000000", 24, true, true);

    const subtitle = this.add
      .text(DESIGN_WIDTH / 2, 560, "Math battles in the swamp", {
        fontFamily: fonts.body,
        fontStyle: "800",
        fontSize: "56px",
        color: colors.moonlight,
        stroke: colors.nightText,
        strokeThickness: 8,
      })
      .setOrigin(0.5);

    this.statusText = this.add
      .text(DESIGN_WIDTH / 2, DESIGN_HEIGHT - 80, "", {
        fontFamily: fonts.body,
        fontStyle: "800",
        fontSize: `${MIN_TEXT_SIZE}px`,
        stroke: colors.nightText,
        strokeThickness: 8,
      })
      .setOrigin(0.5);

    onLayout(this, (layout) => {
      for (const sprite of [ranger, bigfoot]) fitPixelSprite(sprite, layout);
      for (const text of [title, subtitle, this.statusText]) fitText(text, layout);
    });

    const root = document.getElementById("ui");
    if (!root) throw new Error("The page needs a #ui element");
    let signedIn = false;
    const account = new AccountScreens(root, {
      onPanel: (open) => {
        title.setVisible(!open);
        this.statusText.setVisible(!open);
        subtitle.setVisible(!open && !signedIn);
      },
      onSignedIn: () => {
        signedIn = true;
        subtitle.setVisible(false);
        this.joinHub(account);
      },
      onSignedOut: () => {
        signedIn = false;
        this.leaveHub();
      },
    });
    account.start();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.leaveHub());
  }

  private joinHub(account: AccountScreens) {
    this.leaveHub();
    this.disconnect = connectToHub((status) => {
      if (status.state === "signed-out") account.signedOut();
      else this.showStatus(status);
    });
  }

  private leaveHub() {
    this.disconnect?.();
    this.disconnect = null;
    if (this.statusText.active) this.statusText.setText("");
  }

  private showStatus(status: ServerStatus) {
    if (status.state === "connecting") {
      this.statusText.setText("Server: connecting").setColor(colors.muted);
    } else if (status.state === "connected") {
      this.statusText.setText(`Connected as ${status.playerName}`).setColor(colors.online);
    } else {
      this.statusText.setText("Server: offline").setColor(colors.offline);
    }
  }
}
