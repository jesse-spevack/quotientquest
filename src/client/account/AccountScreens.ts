import { renderSVG } from "uqr";
import { type DeviceView, type ErrorCode, LINK_PATH } from "../../shared/account";
import { api } from "./api";
import { button, type Child, el, message } from "./dom";
import { skinPreview } from "./skinPreview";

const MAX_NAME_REROLLS = 5;
const CODE_EXAMPLE = "acorn tiger river 42";

type Events = {
  onPanel: (open: boolean) => void;
  onSignedIn: (playerName: string) => void;
  onSignedOut: () => void;
};

const errorText: Partial<Record<ErrorCode | "offline", string>> = {
  offline: "No connection. Check the internet, then try again.",
  too_many_tries: "Wait a moment, then try again.",
  wrong_code: "That code does not match. Check each word and the number.",
  wrong_link: "That code does not work. Make a new one on your other device.",
  name_taken: "Another player took that name. Pick a new one.",
};

function errorMessage(error: ErrorCode | "offline"): string {
  return errorText[error] ?? "Something went wrong. Try again.";
}

export class AccountScreens {
  private playerName = "";
  private linkTimer: number | undefined;

  constructor(
    private readonly root: HTMLElement,
    private readonly events: Events,
  ) {}

  async start() {
    if (location.pathname === LINK_PATH && location.hash.length > 1) {
      const token = location.hash.slice(1);
      history.replaceState(null, "", "/");
      return this.redeemLinkToken(token);
    }
    const me = await api.me();
    if (me.ok && me.data.player) this.signedIn(me.data.player.name);
    else this.welcome(me.ok ? null : errorMessage(me.error));
  }

  private show(panel: HTMLElement | null, modal = true) {
    window.clearInterval(this.linkTimer);
    this.root.replaceChildren(...(panel ? [panel] : []));
    this.root.className = panel && modal ? "qq-ui qq-modal" : "qq-ui";
    document.body.classList.toggle("qq-panel-open", Boolean(panel && modal));
    this.events.onPanel(Boolean(panel && modal));
    panel?.querySelector<HTMLElement>("[autofocus]")?.focus();
  }

  private panel(
    title: string,
    body: Child[],
    options: { actions?: HTMLElement; close?: () => void; heading?: "h1" | "h2" } = {},
  ) {
    return el(
      "section",
      { class: "qq-panel", "aria-label": title },
      el(
        "header",
        { class: "qq-panel-head" },
        el(options.heading ?? "h2", {}, title),
        options.close && button("Close", options.close, "quiet"),
      ),
      el("div", { class: "qq-panel-body" }, ...body),
      options.actions && el("footer", { class: "qq-panel-foot" }, options.actions),
    );
  }

  private welcome(note: string | null = null) {
    this.show(
      this.panel(
        "Quotient Quest",
        [el("p", { class: "qq-lead" }, "Math battles in the swamp"), message(note, "note")],
        {
          heading: "h1",
          actions: el(
            "div",
            { class: "qq-actions" },
            button("Play", () => this.pickName(), "primary"),
            button("I have a secret code", () => this.enterCode()),
            button("Scan from my other device", () => this.linkFromOtherDevice()),
          ),
        },
      ),
    );
  }

  private async pickName(rerollsLeft = MAX_NAME_REROLLS, error: string | null = null) {
    const result = await api.names();
    if (!result.ok) return this.welcome(errorMessage(result.error));

    const choose = async (name: string) => {
      const signUp = await api.signUp(name);
      if (signUp.ok) return this.showNewCode(signUp.data.player.name, signUp.data.secretCode);
      return this.pickName(rerollsLeft, errorMessage(signUp.error));
    };

    this.show(
      this.panel(
        "Pick your name",
        [
          el("p", {}, "Tap the name you like."),
          message(error),
          el(
            "div",
            { class: "qq-names" },
            ...result.data.names.map((name) => button(name, () => choose(name), "primary")),
          ),
        ],
        {
          actions: el(
            "div",
            { class: "qq-row" },
            button("Back", () => this.welcome(), "quiet"),
            rerollsLeft > 0
              ? button(`New names (${rerollsLeft})`, () => this.pickName(rerollsLeft - 1))
              : el("p", { class: "qq-hint" }, "Pick one of these names."),
          ),
        },
      ),
    );
  }

  private showNewCode(playerName: string, secretCode: string) {
    this.show(
      this.panel(
        `Hi, ${playerName}!`,
        [
          el("p", {}, "This is your secret code. Write it down. You need it to play on another device."),
          this.codeView(secretCode),
          el("p", { class: "qq-hint" }, "Keep it secret. Anyone with the code can play as you."),
        ],
        { actions: button("I wrote it down", () => this.askRemember(playerName), "primary") },
      ),
    );
  }

  private codeView(secretCode: string) {
    return el(
      "p",
      { class: "qq-code", "aria-label": `Secret code: ${secretCode}` },
      ...secretCode.split(" ").map((part) => el("span", {}, part)),
    );
  }

  private askRemember(playerName: string) {
    const answer = async (remember: boolean) => {
      if (remember) await api.remember(true);
      this.signedIn(playerName);
    };
    this.show(
      this.panel(
        "Remember this device?",
        [el("p", {}, "Say yes on your own device. Say no on a shared device, like a school iPad.")],
        {
          actions: el(
            "div",
            { class: "qq-row" },
            button("Yes, remember", () => answer(true), "primary"),
            button("No", () => answer(false)),
          ),
        },
      ),
    );
  }

  private enterCode(error: string | null = null, typed = "") {
    const input = el("input", {
      value: typed,
      class: "qq-input",
      type: "text",
      name: "secret-code",
      placeholder: CODE_EXAMPLE,
      autocomplete: "off",
      autocapitalize: "off",
      spellcheck: "false",
      enterkeyhint: "go",
      "aria-label": "Secret code",
      autofocus: true,
    });
    const submit = async () => {
      if (!input.value.trim()) return;
      const result = await api.signIn(input.value);
      if (result.ok) this.askRemember(result.data.player.name);
      else this.enterCode(errorMessage(result.error), input.value);
    };
    this.show(
      this.panel(
        "Type your secret code",
        [el("p", {}, "It has 3 words and a number."), this.form(input, submit, error)],
        {
          actions: this.backAndPlay(submit),
        },
      ),
    );
  }

  private linkFromOtherDevice(error: string | null = null, typed = "") {
    const input = el("input", {
      value: typed,
      class: "qq-input qq-short-code",
      type: "text",
      name: "device-code",
      placeholder: "ABC234",
      maxlength: "7",
      autocomplete: "off",
      autocapitalize: "characters",
      spellcheck: "false",
      enterkeyhint: "go",
      "aria-label": "6-letter code",
    });
    const submit = async () => {
      if (!input.value.trim()) return;
      const result = await api.redeemLink({ shortCode: input.value });
      if (result.ok) this.askRemember(result.data.player.name);
      else this.linkFromOtherDevice(errorMessage(result.error), input.value);
    };
    this.show(
      this.panel(
        "Add this device",
        [
          el(
            "ol",
            { class: "qq-steps" },
            el("li", {}, "On your other device, open Settings, then tap Add a device."),
            el("li", {}, "Scan the picture with this device's camera. Or type the 6‑letter code here."),
          ),
          this.form(input, submit, error),
        ],
        { actions: this.backAndPlay(submit) },
      ),
    );
  }

  private backAndPlay(submit: () => void) {
    return el(
      "div",
      { class: "qq-row" },
      button("Back", () => this.welcome(), "quiet"),
      button("Play", submit, "primary"),
    );
  }

  private form(input: HTMLInputElement, submit: () => void, error: string | null) {
    return el(
      "form",
      {
        class: "qq-form",
        onsubmit: (event) => {
          event.preventDefault();
          submit();
        },
      },
      input,
      message(error),
    );
  }

  private async redeemLinkToken(token: string) {
    this.show(this.panel("Adding this device", [el("p", {}, "One moment.")]));
    const result = await api.redeemLink({ token });
    if (result.ok) this.askRemember(result.data.player.name);
    else this.welcome(errorMessage(result.error));
  }

  private signedIn(playerName: string) {
    this.playerName = playerName;
    this.events.onSignedIn(playerName);
    this.playerCard();
  }

  private playerCard() {
    this.show(
      el(
        "section",
        { class: "qq-card", "aria-label": "Your player" },
        skinPreview("/assets/ranger.png"),
        el(
          "div",
          { class: "qq-card-text" },
          el("p", { class: "qq-card-name" }, this.playerName),
          el("p", { class: "qq-hint" }, "Skin: Ranger Archer"),
          button("Settings", () => this.settings(), "plain"),
        ),
      ),
      false,
    );
  }

  private async settings(note: string | null = null) {
    const devices = await api.devices();
    if (!devices.ok) {
      if (devices.error === "signed_out") return this.signedOut();
      return this.show(
        this.panel("Settings", [message(errorMessage(devices.error))], {
          close: () => this.playerCard(),
          actions: button("Try again", () => this.settings(), "primary"),
        }),
      );
    }

    this.show(
      this.panel(
        "Settings",
        [
          message(note, "note"),
          el("h3", {}, "Your secret code"),
          el("p", { class: "qq-tall-only" }, "Use it to play on another device."),
          el(
            "div",
            { class: "qq-row" },
            button("Show my code", () => this.showCode()),
            button("Make a new code", () => this.confirmNewCode()),
          ),
          el("h3", {}, "Your devices"),
          el("ul", { class: "qq-devices" }, ...devices.data.devices.map((device) => this.deviceRow(device))),
        ],
        {
          close: () => this.playerCard(),
          actions: el(
            "div",
            { class: "qq-row" },
            button("Add a device", () => this.addDevice(), "primary"),
            button("Sign out here", () => this.signOutHere()),
          ),
        },
      ),
    );
  }

  private deviceRow(device: DeviceView) {
    const signOut = async () => {
      const result = await api.signOutDevice(device.id);
      if (!result.ok) return this.settings(errorMessage(result.error));
      if (device.current) return this.signedOut();
      return this.settings(`${device.name} is signed out.`);
    };
    return el(
      "li",
      {},
      el(
        "div",
        {},
        el(
          "p",
          { class: "qq-device-name" },
          device.name,
          device.current && el("span", { class: "qq-tag" }, "This device"),
        ),
        el("p", { class: "qq-hint" }, lastPlayed(device.lastSeenAt)),
      ),
      button("Sign out", signOut, "quiet"),
    );
  }

  private async showCode() {
    const result = await api.secretCode();
    if (!result.ok) return this.handleSignedOut(result.error);
    this.show(
      this.panel(
        "Your secret code",
        [
          this.codeView(result.data.secretCode),
          el("p", { class: "qq-hint" }, "Keep it secret. Anyone with the code can play as you."),
        ],
        { actions: button("Done", () => this.settings(), "primary") },
      ),
    );
  }

  private confirmNewCode() {
    const make = async () => {
      const result = await api.newSecretCode();
      if (!result.ok) return this.handleSignedOut(result.error);
      this.show(
        this.panel(
          "Your new secret code",
          [this.codeView(result.data.secretCode), el("p", {}, "Write it down. Your old code does not work now.")],
          { actions: button("I wrote it down", () => this.settings(), "primary") },
        ),
      );
    };
    this.show(
      this.panel(
        "Make a new code?",
        [el("p", {}, "Your old code stops working. Devices that are signed in stay signed in.")],
        {
          actions: el(
            "div",
            { class: "qq-row" },
            button("Cancel", () => this.settings(), "quiet"),
            button("Make a new code", make, "primary"),
          ),
        },
      ),
    );
  }

  private async addDevice() {
    const result = await api.deviceLink();
    if (!result.ok) return this.handleSignedOut(result.error);

    const { url, shortCode, expiresAt } = result.data;
    const countdown = el("p", { class: "qq-hint", role: "timer" });
    const qr = el("div", { class: "qq-qr", role: "img", "aria-label": "A picture to scan with the camera" });
    qr.innerHTML = renderSVG(url, { border: 2, pixelSize: 8 });

    this.show(
      this.panel(
        "Add a device",
        [
          el(
            "div",
            { class: "qq-link" },
            qr,
            el(
              "div",
              {},
              el("p", {}, "Scan this picture with the camera of the new device."),
              el("p", {}, "No camera? On the new device, tap Scan from my other device, and type this code:"),
              el("p", { class: "qq-code qq-short" }, shortCode),
              countdown,
            ),
          ),
        ],
        { actions: button("Done", () => this.settings(), "primary") },
      ),
    );

    const tick = () => {
      const seconds = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
      if (seconds === 0) {
        qr.classList.add("qq-expired");
        countdown.replaceChildren(
          "This code stopped working. ",
          button("Make a new code", () => this.addDevice()),
        );
        window.clearInterval(this.linkTimer);
        return;
      }
      countdown.textContent = `This code works for ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}.`;
    };
    tick();
    this.linkTimer = window.setInterval(tick, 1000);
  }

  private async signOutHere() {
    await api.signOut();
    this.signedOut();
  }

  private handleSignedOut(error: ErrorCode | "offline") {
    if (error === "signed_out") return this.signedOut();
    return this.settings(errorMessage(error));
  }

  signedOut() {
    this.playerName = "";
    this.events.onSignedOut();
    this.welcome("You are signed out on this device.");
  }
}

function lastPlayed(time: number): string {
  const minutes = Math.floor((Date.now() - time) / 60_000);
  if (minutes < 10) return "Played just now";
  if (minutes < 60) return `Played ${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? "Played 1 hour ago" : `Played ${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "Played yesterday" : `Played ${days} days ago`;
}
