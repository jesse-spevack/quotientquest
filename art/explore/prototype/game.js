(() => {
  const W = 1920, H = 1080;
  const SCALE = 4;            // each art pixel is 4 game pixels
  const FEET = 840;           // the boardwalk line where the fighters stand
  const NEAR_TOP = 705;       // the top of the boardwalk layer
  const MAX_HP = 120;
  const ROUND_SECONDS = 20;
  const PROBLEMS = 3;
  const STRIPS = 12;          // the boardwalk is cut into strips, so the planks can bounce
  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const C = {
    panel: 0x10203a, panelEdge: 0x7fe3ff, card: 0xfff1c9, cardText: "#2a1a0e",
    good: 0x5fd38a, bad: 0xff6b6b, gold: 0xffd166, moon: 0xdff4ff, glow: 0x7fe3ff,
    hpYou: 0x5fd38a, hpCpu: 0xff9f43, track: 0x0a1424, dust: 0xb59a7a, pink: 0xff6bd6
  };
  const T = {
    display: (size, color = "#ffffff") => ({ fontFamily: '"Lilita One", "Arial Rounded MT Bold", sans-serif', fontSize: size + "px", color }),
    body: (size, color = "#dbe8f5") => ({ fontFamily: '"Nunito", "Segoe UI", sans-serif', fontStyle: "800", fontSize: size + "px", color })
  };

  // How hard each tier of math hits the screen: the damage number, the shake, the knockback, the banner color.
  const TIERS = {
    weak:    { size: 66,  color: "#cfe6ff", shake: 0.003, knock: 18, banner: "#cfe6ff" },
    normal:  { size: 84,  color: "#ffd166", shake: 0.006, knock: 32, banner: "#ffd166" },
    strong:  { size: 106, color: "#ff9f43", shake: 0.010, knock: 52, banner: "#ffb35c" },
    special: { size: 134, color: "#ff6bd6", shake: 0.014, knock: 76, banner: "#ff8ae0" }
  };
  // Better math opens cooler moves. Each tier has a pool; the same move never comes twice in a row.
  const POOLS = { weak: [0], normal: [0, 1], strong: [1, 2], special: [3] };
  const FALLBACK = { weak: [1], normal: [2], strong: [0], special: [2] };
  const MOVES = {
    ranger: ["Quick Shot", "Triple Volley", "Power Shot", "Arrow Rain"],
    bigfoot: ["Club Swing", "Ground Pound", "Leap Smash", "Boulder Throw"]
  };
  // Frame numbers inside each animation where something happens.
  const BEAT = {
    ranger: { attack: 6, draw: 5, skyshot: 5 },
    bigfoot: { attack: 4, pound: 5, leapUp: 3, leapDown: 8, throw: 6 }
  };

  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const pickOne = (list) => list[randInt(0, list.length - 1)];
  const shuffle = (list) => { for (let i = list.length - 1; i > 0; i--) { const j = randInt(0, i); [list[i], list[j]] = [list[j], list[i]]; } return list; };

  function makeProblem() {
    const a = randInt(2, 9), b = randInt(2, 9), answer = a * b;
    const near = [a * (b + 1), a * (b - 1), (a + 1) * b, (a - 1) * b, answer + 1, answer - 1, answer + 10, answer - 2];
    const wrong = shuffle(near.filter((n, i) => n > 0 && n !== answer && near.indexOf(n) === i)).slice(0, 3);
    return { text: `${a} \u00d7 ${b} = ?`, answer, options: shuffle([answer, ...wrong]) };
  }

  class Fight extends Phaser.Scene {
    constructor() { super("fight"); }

    preload() {
      this.load.image("far", "far.webp");
      this.load.image("mid", "mid.webp");
      this.load.image("near", "near.webp");
      this.load.json("sheets", "sheets.json");
      this.load.spritesheet("ranger", "ranger.png", { frameWidth: 160, frameHeight: 160 });
      this.load.spritesheet("bigfoot", "bigfoot.png", { frameWidth: 160, frameHeight: 160 });
      this.load.image("ranger-face", "ranger-face.png");
      this.load.image("bigfoot-face", "bigfoot-face.png");
    }

    create() {
      document.getElementById("loading").hidden = true;
      for (const key of ["ranger", "bigfoot", "ranger-face", "bigfoot-face"]) {
        this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
      }
      // The world and the game UI live on separate layers and cameras: a zoom or a shake never moves the UI.
      this.worldLayer = this.add.layer();
      this.uiLayer = this.add.layer();
      this.cameras.main.ignore(this.uiLayer);
      this.uiCam = this.cameras.add(0, 0, W, H);
      this.uiCam.ignore(this.worldLayer);
      this.cameras.main.setBounds(0, 0, W, H);

      this.moveLog = [];
      this.force = { ranger: null, bigfoot: null };
      this.impacts = 0;
      this.last = { ranger: null, bigfoot: null };

      this.makeTextures();
      this.buildWorld();
      this.buildFighters();
      this.buildHud();
      this.buildPanel();
      // Answer keys 1 to 4. Hidden test keys: Q W E R force the next ranger move, A S D F the next Bigfoot move.
      this.input.keyboard.on("keydown", (event) => {
        const n = Number(event.key);
        if (n >= 1 && n <= 4) { this.pick(n - 1); return; }
        const r = "qwer".indexOf(event.key.toLowerCase()), b = "asdf".indexOf(event.key.toLowerCase());
        if (r >= 0) this.force.ranger = r;
        if (b >= 0) this.force.bigfoot = b;
      });
      this.showStart();
    }

    w(object) { this.worldLayer.add(object); return object; }

    // Test hook only: with window.qqTest set, the scene pauses here until the test resumes it.
    checkpoint(label) {
      if (!window.qqTest) return;
      window.qqTest.paused = label;
      this.scene.pause();
    }
    u(object) { this.uiLayer.add(object); return object; }

    // ---------- textures drawn in code ----------
    makeTextures() {
      const radial = (key, size, stops) => {
        const t = this.textures.createCanvas(key, size, size), g = t.getContext();
        const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        stops.forEach(([at, alpha]) => grad.addColorStop(at, `rgba(255,255,255,${alpha})`));
        g.fillStyle = grad; g.fillRect(0, 0, size, size); t.refresh();
      };
      radial("glow", 256, [[0, 1], [0.25, 0.55], [0.6, 0.12], [1, 0]]);
      radial("dot", 32, [[0, 1], [0.3, 0.8], [1, 0]]);

      const ring = this.textures.createCanvas("ring", 256, 256), rg = ring.getContext();
      rg.strokeStyle = "rgba(255,255,255,0.95)"; rg.lineWidth = 14;
      rg.beginPath(); rg.arc(128, 128, 110, 0, Math.PI * 2); rg.stroke();
      rg.strokeStyle = "rgba(255,255,255,0.35)"; rg.lineWidth = 30;
      rg.beginPath(); rg.arc(128, 128, 100, 0, Math.PI * 2); rg.stroke(); ring.refresh();

      const vig = this.textures.createCanvas("vignette", 480, 270), v = vig.getContext();
      const vg = v.createRadialGradient(240, 120, 60, 240, 135, 300);
      vg.addColorStop(0, "rgba(4,10,20,0)"); vg.addColorStop(0.6, "rgba(4,10,20,0.15)"); vg.addColorStop(1, "rgba(4,10,20,0.7)");
      v.fillStyle = vg; v.fillRect(0, 0, 480, 270); vig.refresh();

      const arrow = this.textures.createCanvas("arrow", 220, 24), a = arrow.getContext();
      const ag = a.createLinearGradient(0, 0, 220, 0);
      ag.addColorStop(0, "rgba(127,227,255,0)"); ag.addColorStop(0.7, "rgba(127,227,255,0.8)"); ag.addColorStop(1, "rgba(255,255,255,1)");
      a.fillStyle = ag; a.fillRect(0, 9, 220, 6);
      a.fillStyle = "#ffffff"; a.beginPath(); a.moveTo(220, 12); a.lineTo(198, 2); a.lineTo(204, 12); a.lineTo(198, 22); a.closePath(); a.fill();
      arrow.refresh();

      // A pixel-art boulder and rock chips, drawn one art pixel at a time and scaled 4x like the sprites.
      const pixels = (key, w, h, paint) => {
        const t = this.textures.createCanvas(key, w, h), g = t.getContext();
        paint((x, y, color) => { g.fillStyle = color; g.fillRect(x, y, 1, 1); });
        t.refresh(); t.setFilter(Phaser.Textures.FilterMode.NEAREST);
      };
      // The same size and colors as the boulder the Bigfoot lifts in its throw animation.
      pixels("boulder", 40, 34, (put) => {
        for (let y = 0; y < 34; y++) for (let x = 0; x < 40; x++) {
          const dx = (x - 19.5) / 19.5, dy = (y - 17) / 16.5, d = dx * dx + dy * dy;
          if (d > 1) continue;
          let color = d > 0.86 ? "#2e2a26" : "#8c9196";
          if (d <= 0.86 && dx + dy > 0.5) color = "#5e5a55";
          if (d <= 0.86 && dx + dy < -0.55) color = "#c9a36a";
          if (d <= 0.86 && dx + dy < -0.95) color = "#e6c48c";
          if (d <= 0.86 && ((x === 15 && y > 10 && y < 19) || (y === 19 && x > 15 && x < 24) || (x === 27 && y > 6 && y < 12))) color = "#5e5a55";
          put(x, y, color);
        }
      });
      pixels("chip", 4, 4, (put) => {
        ["#2b2c31", "#7d7f86", "#7d7f86", "#2b2c31", "#7d7f86", "#b3b6bd", "#7d7f86", "#4b4d55", "#2b2c31", "#7d7f86", "#4b4d55", "#2b2c31"]
          .forEach((c, i) => { if (i !== 0 && i !== 3) put(i % 4, Math.floor(i / 4), c); });
      });
      pixels("star", 7, 7, (put) => {
        [[3, 0], [3, 1], [3, 2], [0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [3, 4], [3, 5], [3, 6], [2, 2], [4, 2], [2, 4], [4, 4]]
          .forEach(([x, y]) => put(x, y, "#ffffff"));
      });
    }

    // ---------- the swamp ----------
    buildWorld() {
      const drift = (target, dx, duration) => {
        if (REDUCED) return;
        this.tweens.add({ targets: target, x: `+=${dx}`, duration, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      };
      const add = (object) => this.w(object);
      const far = add(this.add.image(W / 2, H / 2, "far").setScale(1.04));
      const moon = add(this.add.image(960, 195, "glow").setScale(2.6).setTint(C.moon).setAlpha(0.35).setBlendMode(Phaser.BlendModes.ADD));
      const fog = add(this.add.image(W / 2, 640, "glow").setScale(10, 0.9).setTint(0x9fd8ff).setAlpha(0.16).setBlendMode(Phaser.BlendModes.ADD));
      const mid = add(this.add.image(W / 2, H / 2, "mid").setScale(1.05));
      const shrooms = [[235, 585, 1.5], [125, 660, 1.0], [1650, 600, 1.1], [1795, 612, 0.9]].map(([x, y, s]) =>
        add(this.add.image(x, y, "glow").setScale(s).setTint(0x4fd8ff).setAlpha(0.45).setBlendMode(Phaser.BlendModes.ADD)));
      drift([far, moon], 14, 9000);
      drift(fog, 60, 7000);
      drift([mid, ...shrooms], 26, 9000);
      if (!REDUCED) {
        shrooms.forEach((s, i) => this.tweens.add({ targets: s, alpha: 0.2, duration: 1800 + i * 300, yoyo: true, repeat: -1, ease: "Sine.inOut" }));
        this.tweens.add({ targets: moon, alpha: 0.25, duration: 4000, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      }
      this.fireflies = add(this.add.particles(0, 0, "dot", {
        x: { min: 0, max: W }, y: { min: 140, max: 820 },
        lifespan: { min: 5000, max: 9000 },
        speedX: { min: -18, max: 18 }, speedY: { min: -14, max: 8 },
        scale: { min: 0.25, max: 0.6 },
        alpha: { values: [0, 0.95, 0.25, 0.9, 0] },
        tint: [0xfff3a0, 0xe2ff8a, 0xffe08a],
        blendMode: Phaser.BlendModes.ADD,
        frequency: REDUCED ? 600 : 140, quantity: 1, maxAliveParticles: 60
      }).setDepth(5));

      // The boardwalk: one image cut into strips. Each strip shows its own slice, so a wave can bounce the planks.
      const near = this.textures.get("near").getSourceImage();
      const stripW = near.width / STRIPS;
      this.planks = [];
      for (let i = 0; i < STRIPS; i++) {
        const strip = add(this.add.image(W / 2, NEAR_TOP, "near").setOrigin(0.5, 0).setScale(1.03).setDepth(2));
        strip.setCrop(i * stripW, 0, stripW + 1, near.height);
        strip.centerX = (i + 0.5) * stripW * 1.03 + (W - near.width * 1.03) / 2;
        this.planks.push(strip);
      }
      drift(this.planks, 6, 9000);
      add(this.add.image(W / 2, H / 2, "vignette").setDisplaySize(W, H).setDepth(8));
    }

    // ---------- the two fighters ----------
    buildFighters() {
      const sheets = this.cache.json.get("sheets");
      const rate = { idle: 7, attack: 14, hurt: 10, defeat: 10, skyshot: 13, pound: 13, leap: 13, throw: 13 };
      for (const key of ["ranger", "bigfoot"]) {
        for (const [name, [start, count]] of Object.entries(sheets[key])) {
          this.anims.create({ key: `${key}-${name}`, frames: this.anims.generateFrameNumbers(key, { start, end: start + count - 1 }), frameRate: rate[name] ?? 12, repeat: name === "idle" ? -1 : 0 });
        }
      }
      // The power shot splits the ranger attack: draw back, hold, then let go.
      const [start, count] = sheets.ranger.attack;
      this.anims.create({ key: "ranger-draw", frames: this.anims.generateFrameNumbers("ranger", { start, end: start + BEAT.ranger.draw }), frameRate: 12 });
      this.anims.create({ key: "ranger-release", frames: this.anims.generateFrameNumbers("ranger", { start: start + BEAT.ranger.draw + 1, end: start + count - 1 }), frameRate: 14 });

      const fighter = (key, x, flip) => {
        const shadow = this.w(this.add.ellipse(x, FEET + 4, 230, 34, 0x02060c, 0.5).setDepth(3));
        const back = this.w(this.add.image(x, FEET - 170, "glow").setScale(2.2, 2.8).setTint(0x6fc8ff).setAlpha(0.16).setBlendMode(Phaser.BlendModes.ADD).setDepth(3));
        const sprite = this.w(this.add.sprite(x, FEET, key, 0).setOrigin(0.5, 156 / 160).setScale(SCALE).setFlipX(flip).setDepth(4));
        sprite.setTint(0xe6eeff);
        sprite.play(`${key}-idle`);
        return { key, sprite, shadow, back, home: x, hp: MAX_HP, flip, dir: flip ? -1 : 1 };
      };
      this.you = fighter("ranger", 620, false);
      this.cpu = fighter("bigfoot", 1310, true);
    }

    // ---------- health bars ----------
    buildHud() {
      const side = (who, left) => {
        const x = left ? 48 : W - 48;
        const dir = left ? 1 : -1;
        const box = this.u(this.add.graphics().setDepth(20));
        box.fillStyle(C.panel, 0.92).fillRoundedRect(left ? x : x - 128, 36, 128, 128, 22);
        box.lineStyle(4, C.panelEdge, 0.7).strokeRoundedRect(left ? x : x - 128, 36, 128, 128, 22);
        this.u(this.add.image(x + dir * 64, 100, `${who.key}-face`).setScale(3).setDepth(21).setFlipX(!left));
        const nameX = x + dir * 152;
        this.u(this.add.text(nameX, 30, left ? "You" : "Computer player", T.display(46)).setOrigin(left ? 0 : 1, 0).setDepth(21).setShadow(0, 4, "#02060c", 0, false, true));
        const barW = 560, barX = left ? nameX : nameX - barW;
        const bar = this.u(this.add.graphics().setDepth(20));
        bar.fillStyle(C.track, 0.9).fillRoundedRect(barX - 6, 92, barW + 12, 46, 23);
        bar.lineStyle(3, 0xffffff, 0.25).strokeRoundedRect(barX - 6, 92, barW + 12, 46, 23);
        const fill = this.u(this.add.graphics().setDepth(21));
        const label = this.u(this.add.text(left ? barX + 18 : barX + barW - 18, 115, "", T.body(26, "#0b1420")).setOrigin(left ? 0 : 1, 0.5).setDepth(22));
        const dots = [0, 1, 2].map((i) => this.u(this.add.circle(nameX + dir * (16 + i * 40), 172, 13, 0x0a1424, 0.85).setStrokeStyle(3, 0xffffff, 0.5).setDepth(21)));
        who.hud = { fill, label, barX, barW, left, dots, shown: MAX_HP };
        this.drawHp(who, MAX_HP);
      };
      side(this.you, true);
      side(this.cpu, false);
      const pill = this.u(this.add.graphics().setDepth(20));
      pill.fillStyle(C.panel, 0.88).fillRoundedRect(W / 2 - 150, 36, 300, 132, 30);
      pill.lineStyle(4, C.panelEdge, 0.5).strokeRoundedRect(W / 2 - 150, 36, 300, 132, 30);
      this.roundText = this.u(this.add.text(W / 2, 46, "", T.display(54, "#fff1c9")).setOrigin(0.5, 0).setDepth(21).setShadow(0, 4, "#02060c", 0, false, true));
      this.clock = this.u(this.add.text(W / 2, 112, "", T.display(40, "#dff4ff")).setOrigin(0.5, 0).setDepth(21).setShadow(0, 3, "#02060c", 0, false, true));
    }

    drawHp(who, value) {
      const { fill, label, barX, barW, left } = who.hud;
      const w = Math.max(0, (value / MAX_HP) * barW);
      fill.clear();
      if (w > 0) {
        fill.fillStyle(left ? C.hpYou : C.hpCpu, 1).fillRoundedRect(left ? barX : barX + barW - w, 98, w, 34, Math.min(17, w / 2));
        if (w > 12) fill.fillStyle(0xffffff, 0.28).fillRoundedRect(left ? barX + 6 : barX + barW - w + 6, 102, w - 12, 9, 4);
      }
      label.setText(`${Math.ceil(value)} / ${MAX_HP}`);
      label.setColor(w > 140 ? "#0b1420" : "#ffffff");
      if (w <= 140) label.setX(left ? barX + Math.max(w, 0) + 14 : barX + barW - w - 14);
      else label.setX(left ? barX + 18 : barX + barW - 18);
    }

    tweenHp(who, to) {
      return new Promise((resolve) => {
        this.tweens.addCounter({ from: who.hud.shown, to, duration: 520, ease: "Cubic.out",
          onUpdate: (t) => this.drawHp(who, t.getValue()),
          onComplete: () => { who.hud.shown = to; resolve(); } });
      });
    }

    setDot(who, index, state) {
      const dot = who.hud.dots[index];
      if (state === null) dot.setFillStyle(0x0a1424, 0.85).setStrokeStyle(3, 0xffffff, 0.5);
      else dot.setFillStyle(state ? C.good : C.bad, 1).setStrokeStyle(3, 0xffffff, 0.9);
      if (state !== null && !REDUCED) this.tweens.add({ targets: dot, scale: { from: 1.5, to: 1 }, duration: 260, ease: "Back.out" });
    }

    // ---------- the math panel ----------
    buildPanel() {
      const px = 210, py = 878, pw = 1500, ph = 176;
      this.panel = this.u(this.add.container(0, 0).setDepth(30));
      const bg = this.add.graphics();
      bg.fillStyle(C.panel, 0.9).fillRoundedRect(px, py, pw, ph, 30);
      bg.lineStyle(4, C.panelEdge, 0.55).strokeRoundedRect(px, py, pw, ph, 30);
      this.timerBar = this.add.graphics();
      this.counter = this.add.text(px + 50, py + 26, "", T.body(30, "#a9c7e6"));
      this.question = this.add.text(px + 50, py + 64, "", T.display(84, "#ffffff"));
      this.panel.add([bg, this.timerBar, this.counter, this.question]);
      this.buttons = [0, 1, 2, 3].map((i) => {
        const bx = 900 + i * 196, by = py + 28, bw = 176, bh = 122;
        const g = this.add.graphics();
        const text = this.add.text(bx + bw / 2, by + bh / 2 + 2, "", T.display(66, C.cardText)).setOrigin(0.5);
        const key = this.add.text(bx + 14, by + 8, String(i + 1), T.body(22, "#8a6a3a"));
        const zone = this.add.zone(bx, by, bw, bh).setOrigin(0).setInteractive({ useHandCursor: true });
        const button = { g, text, key, zone, bx, by, bw, bh, state: "idle", hover: false };
        zone.on("pointerover", () => { button.hover = true; this.drawButton(button); });
        zone.on("pointerout", () => { button.hover = false; this.drawButton(button); });
        zone.on("pointerdown", () => this.pick(i));
        this.panel.add([g, text, key, zone]);
        this.drawButton(button);
        return button;
      });
      this.panel.setVisible(false);
    }

    drawButton(b) {
      const fill = { idle: C.card, good: C.good, bad: C.bad, off: 0x6f7f95 }[b.state];
      const lift = b.state === "idle" && b.hover ? -6 : 0;
      b.g.clear();
      b.g.fillStyle(0x02060c, 0.5).fillRoundedRect(b.bx, b.by + 8, b.bw, b.bh, 24);
      b.g.fillStyle(fill, 1).fillRoundedRect(b.bx, b.by + lift, b.bw, b.bh, 24);
      b.g.fillStyle(0xffffff, b.state === "idle" ? 0.45 : 0.25).fillRoundedRect(b.bx + 10, b.by + lift + 8, b.bw - 20, 16, 8);
      b.text.setY(b.by + b.bh / 2 + 2 + lift);
      b.key.setY(b.by + 8 + lift);
      b.text.setColor(b.state === "idle" ? C.cardText : "#ffffff");
    }

    drawTimer(fraction) {
      const x = 260, y = 878 + 14, w = 1400;
      this.timerBar.clear();
      this.timerBar.fillStyle(0x0a1424, 0.9).fillRoundedRect(x, y, w, 10, 5);
      const color = fraction > 0.35 ? C.glow : fraction > 0.15 ? C.gold : C.bad;
      if (fraction > 0) this.timerBar.fillStyle(color, 1).fillRoundedRect(x, y, w * fraction, 10, 5);
    }

    // ---------- overlays ----------
    overlay(lines, buttonText, onPress) {
      const layer = this.u(this.add.container(0, 0).setDepth(50));
      const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x050b14, 0.62).setInteractive();
      const card = this.add.graphics();
      layer.add([dim, card]);
      let y = 250;
      for (const line of lines) {
        const text = this.add.text(W / 2, y, line.text, line.style).setOrigin(0.5, 0).setAlign("center").setWordWrapWidth(960);
        if (line.shadow) text.setShadow(0, 5, "#02060c", 0, false, true);
        layer.add(text);
        y += text.height + (line.gap ?? 18);
      }
      const bw = 460, bh = 120, bx = W / 2 - bw / 2, by = y + 30;
      const top = 190, bottom = by + bh + 50;
      card.fillStyle(C.panel, 0.96).fillRoundedRect(W / 2 - 580, top, 1160, bottom - top, 40);
      card.lineStyle(5, C.panelEdge, 0.6).strokeRoundedRect(W / 2 - 580, top, 1160, bottom - top, 40);
      const g = this.add.graphics();
      const label = this.add.text(W / 2, by + bh / 2, buttonText, T.display(56, "#2a1a0e")).setOrigin(0.5);
      const draw = (hover) => {
        g.clear();
        g.fillStyle(0x02060c, 0.5).fillRoundedRect(bx, by + 10, bw, bh, 30);
        g.fillStyle(C.gold, 1).fillRoundedRect(bx, by - (hover ? 6 : 0), bw, bh, 30);
        g.fillStyle(0xffffff, 0.4).fillRoundedRect(bx + 14, by + 10 - (hover ? 6 : 0), bw - 28, 18, 9);
        label.setY(by + bh / 2 - (hover ? 6 : 0));
      };
      draw(false);
      const zone = this.add.zone(bx, by, bw, bh).setOrigin(0).setInteractive({ useHandCursor: true });
      zone.on("pointerover", () => draw(true));
      zone.on("pointerout", () => draw(false));
      const go = () => { this.input.keyboard.off("keydown-ENTER", go); layer.destroy(); onPress(); };
      zone.on("pointerdown", go);
      this.input.keyboard.once("keydown-ENTER", go);
      layer.add([g, label, zone]);
      layer.setAlpha(0);
      this.tweens.add({ targets: layer, alpha: 1, duration: 260 });
      return layer;
    }

    showStart() {
      this.overlay([
        { text: "Quotient Quest", style: T.display(112, "#fff1c9"), shadow: true, gap: 4 },
        { text: "Swamp fight demo", style: T.body(38, "#7fe3ff"), gap: 34 },
        { text: "Each round, you get 3 problems and 20 seconds.\nRight and fast answers unlock stronger moves.\nBring the health of the computer player to 0 to win.", style: { ...T.body(34, "#dbe8f5"), lineSpacing: 14 } }
      ], "Start the fight", () => this.newFight());
    }

    newFight() {
      for (const who of [this.you, this.cpu]) {
        who.hp = MAX_HP; who.hud.shown = MAX_HP; this.drawHp(who, MAX_HP);
        who.sprite.setPosition(who.home, FEET).setAlpha(1).setAngle(0).play(`${who.key}-idle`);
        who.shadow.setPosition(who.home, FEET + 4).setScale(1);
        who.back.setPosition(who.home, FEET - 170);
      }
      this.last = { ranger: null, bigfoot: null };
      this.round = 0;
      this.nextRound();
    }

    // ---------- one round of math ----------
    nextRound() {
      this.round += 1;
      this.roundText.setText(`Round ${this.round}`);
      this.problems = Array.from({ length: PROBLEMS }, makeProblem);
      this.index = 0;
      this.you.score = { correct: 0, done: 0, finishedAt: null, times: [] };
      this.cpu.score = { correct: 0, done: 0, finishedAt: null };
      [0, 1, 2].forEach((i) => { this.setDot(this.you, i, null); this.setDot(this.cpu, i, null); });
      this.roundStart = this.time.now;
      this.problemStart = this.time.now;
      this.accepting = true;
      this.panel.setVisible(true).setAlpha(0);
      this.tweens.add({ targets: this.panel, alpha: 1, duration: 200 });
      this.showProblem();
      this.cpuThinks();
      this.ticker = this.time.addEvent({ delay: 50, loop: true, callback: () => this.tick() });
    }

    showProblem() {
      const p = this.problems[this.index];
      this.counter.setText(`Problem ${this.index + 1} of ${PROBLEMS}`);
      this.question.setText(p.text).setFontSize(84);
      this.buttons.forEach((b, i) => { b.state = "idle"; b.text.setText(String(p.options[i])); this.drawButton(b); });
      this.problemStart = this.time.now;
      this.accepting = true;
    }

    tick() {
      const elapsed = this.time.now - this.roundStart;
      const left = Math.max(0, ROUND_SECONDS - elapsed / 1000);
      this.cpuStep(elapsed);
      this.drawTimer(left / ROUND_SECONDS);
      this.clock.setText(`${Math.ceil(left)} s`);
      if (left <= 0 || (this.you.score.finishedAt && this.cpu.score.finishedAt)) this.endRound();
    }

    pick(i) {
      if (!this.accepting || !this.panel.visible) return;
      this.accepting = false;
      const p = this.problems[this.index];
      const right = p.options[i] === p.answer;
      const s = this.you.score;
      s.times.push((this.time.now - this.problemStart) / 1000);
      if (right) s.correct += 1;
      this.setDot(this.you, this.index, right);
      this.buttons.forEach((b, j) => { b.state = p.options[j] === p.answer ? "good" : j === i ? "bad" : "off"; this.drawButton(b); });
      s.done += 1;
      this.time.delayedCall(right ? 380 : 750, () => {
        if (this.index < PROBLEMS - 1) { this.index += 1; this.showProblem(); }
        else { s.finishedAt = this.time.now; this.waitForOther(); }
      });
    }

    // The computer player answers at planned moments of the round clock, so slow frames on a phone keep it fair.
    cpuThinks() {
      let t = 0;
      this.cpuPlan = [0, 1, 2].map(() => { t += rand(2.4, 6.2) * 1000; return { at: t, right: Math.random() < 0.72 }; });
    }

    cpuStep(elapsed) {
      const s = this.cpu.score;
      while (s.done < PROBLEMS && this.cpuPlan[s.done].at <= elapsed) {
        const step = this.cpuPlan[s.done];
        if (step.right) s.correct += 1;
        this.setDot(this.cpu, s.done, step.right);
        s.done += 1;
        if (s.done === PROBLEMS) s.finishedAt = this.roundStart + step.at;
      }
    }

    waitForOther() {
      if (this.cpu.score.finishedAt) return;
      this.counter.setText("You are done.");
      this.question.setText("Wait for the other player...").setFontSize(56);
      this.buttons.forEach((b) => { b.state = "off"; b.text.setText(""); this.drawButton(b); });
    }

    endRound() {
      if (!this.ticker) return;
      this.ticker.remove(); this.ticker = null;
      this.accepting = false;
      this.tweens.add({ targets: this.panel, alpha: 0, duration: 200, onComplete: () => this.panel.setVisible(false) });
      this.clock.setText("Attack");
      const you = this.attackFor(this.you, this.cpu);
      const cpu = this.attackFor(this.cpu, this.you);
      this.showResults(you, cpu).then(() => this.trade(you, cpu));
    }

    attackFor(who, other) {
      const s = who.score;
      const parts = [];
      let power = s.correct * 8 + (PROBLEMS - s.correct) * 3;
      let fast = false;
      if (who === this.you && s.correct > 0) {
        const avg = s.times.reduce((a, b) => a + b, 0) / s.times.length;
        fast = avg < 4;
      }
      if (who === this.cpu && s.correct > 0 && s.finishedAt && s.finishedAt - this.roundStart < 12000) fast = true;
      const first = (s.finishedAt ?? Infinity) < (other.score.finishedAt ?? Infinity);
      if (s.correct === PROBLEMS) parts.push(["All correct", 1.5]);
      if (fast) parts.push(["Fast", 1.25]);
      if (first) parts.push(["First done", 1.2]);
      const luck = Math.round(rand(0.9, 1.15) * 100) / 100;
      parts.push(["Luck", luck]);
      for (const [, m] of parts) power *= m;
      const tier = s.correct <= 1 ? "weak" : s.correct === 2 ? "normal" : fast && first ? "special" : "strong";
      return { who, correct: s.correct, parts, tier, move: this.chooseMove(who.key, tier), damage: Math.max(4, Math.round(power)) };
    }

    chooseMove(key, tier) {
      let move;
      if (this.force[key] !== null) { move = this.force[key]; this.force[key] = null; }
      else {
        let pool = POOLS[tier].filter((m) => m !== this.last[key]);
        if (!pool.length) pool = FALLBACK[tier];
        move = pickOne(pool);
      }
      this.last[key] = move;
      return move;
    }

    showResults(you, cpu) {
      return new Promise((resolve) => {
        const layer = this.u(this.add.container(0, 0).setDepth(40));
        const column = (r, left) => {
          const x = left ? 250 : W - 250;
          const card = this.add.graphics();
          const h = 196 + r.parts.length * 64;
          card.fillStyle(C.panel, 0.86).fillRoundedRect(x - 200, 222, 400, h, 30);
          card.lineStyle(4, C.panelEdge, 0.45).strokeRoundedRect(x - 200, 222, 400, h, 30);
          layer.add(card);
          const head = this.add.text(x, 250, `${r.correct} of ${PROBLEMS} right`, T.display(48, "#ffffff")).setOrigin(0.5, 0).setShadow(0, 4, "#02060c", 0, false, true);
          layer.add(head);
          r.parts.forEach(([name, m], i) => {
            const label = `${name} \u00d7${m.toFixed(2).replace(/0$/, "")}`;
            const text = this.add.text(x, 330 + i * 64, label, T.body(32, "#0b1420")).setOrigin(0.5);
            const pill = this.add.graphics();
            const pw = text.width + 48;
            pill.fillStyle(name === "Luck" ? 0xb9c6ff : C.gold, 1).fillRoundedRect(x - pw / 2, 330 + i * 64 - 26, pw, 52, 26);
            layer.add([pill, text]);
          });
          const total = this.add.text(x, 340 + r.parts.length * 64, `Attack ${r.damage}`, T.display(64, "#7fe3ff")).setOrigin(0.5, 0).setShadow(0, 4, "#02060c", 0, false, true);
          layer.add(total);
        };
        column(you, true);
        column(cpu, false);
        layer.setAlpha(0);
        this.tweens.add({ targets: layer, alpha: 1, duration: 220 });
        this.time.delayedCall(2300, () => this.tweens.add({ targets: layer, alpha: 0, duration: 260, onComplete: () => { layer.destroy(); resolve(); } }));
      });
    }

    // ---------- small tools for moves ----------
    wait(ms) { return new Promise((r) => this.time.delayedCall(ms, r)); }
    tween(config) { return new Promise((r) => this.tweens.add({ ...config, onComplete: r })); }

    // Plays an animation once. `at` is a frame number: the promise `hit` resolves when that frame shows.
    play(who, name, at = null, frameRate = null) {
      const key = name.includes("-") ? name : `${who.key}-${name}`;
      let hitResolve;
      const hit = new Promise((r) => { hitResolve = r; });
      const done = new Promise((resolve) => {
        who.sprite.off(Phaser.Animations.Events.ANIMATION_UPDATE);
        who.sprite.play(frameRate ? { key, frameRate } : key);
        if (at === null || at === 0) hitResolve();
        who.sprite.on(Phaser.Animations.Events.ANIMATION_UPDATE, (anim, frame) => { if (anim.key === key && frame.index - 1 >= at) hitResolve(); });
        who.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => { hitResolve(); resolve(); });
      });
      return { hit, done };
    }

    // The last frame of a move fades out over the first idle frame, so the pose does not snap.
    toIdle(who) {
      if (who.hp <= 0) return;
      const s = who.sprite;
      const ghost = this.w(this.add.image(s.x, s.y, s.texture.key, s.frame.name).setOrigin(s.originX, s.originY)
        .setScale(SCALE).setFlipX(s.flipX).setDepth(4.5).setTint(0xe6eeff));
      s.play(`${who.key}-idle`);
      this.tween({ targets: ghost, alpha: 0, duration: 200, ease: "Quad.in" }).then(() => ghost.destroy());
    }

    // Moves the fighter, its shadow, and its backlight together.
    moveTo(who, x, duration, ease = "Quad.out") {
      return this.tween({ targets: [who.sprite, who.shadow, who.back], x, duration, ease });
    }

    camFocus(x, y, zoom, duration) {
      if (REDUCED) return;
      const cam = this.cameras.main;
      cam.pan(x, y, duration, "Sine.easeInOut", true);
      cam.zoomTo(zoom, duration, "Sine.easeInOut", true);
    }

    camReset(duration = 320) {
      if (REDUCED) return;
      const cam = this.cameras.main;
      cam.pan(W / 2, H / 2, duration, "Sine.easeInOut", true);
      cam.zoomTo(1, duration, "Sine.easeInOut", true);
    }

    slow(on) {
      const scale = on && !REDUCED ? 0.35 : 1;
      this.time.timeScale = scale;
      this.tweens.timeScale = scale;
      this.anims.globalTimeScale = scale;
    }

    banner(text, tier, side) {
      const style = TIERS[tier];
      const x = side === "left" ? 620 : 1300;
      const label = this.u(this.add.text(x, 240, text, T.display(tier === "special" ? 104 : 84, style.banner))
        .setOrigin(0.5).setStroke("#0b1420", 16).setShadow(0, 8, "#02060c", 0, true, true).setDepth(44));
      label.setScale(0.5).setAlpha(0);
      this.tween({ targets: label, scale: 1, alpha: 1, duration: 240, ease: "Back.out" })
        .then(() => this.wait(900))
        .then(() => this.tween({ targets: label, alpha: 0, y: 216, duration: 260 }))
        .then(() => label.destroy());
    }

    flash(color = 0xffffff, alpha = 0.5) {
      const rect = this.u(this.add.rectangle(W / 2, H / 2, W, H, color, alpha / 2).setDepth(39).setBlendMode(Phaser.BlendModes.ADD));
      this.tween({ targets: rect, alpha: 0, duration: 200 }).then(() => rect.destroy());
    }

    arrow(fromX, fromY, toX, toY, duration, scale = 1.4, tint = 0xffffff, length = scale) {
      const angle = Phaser.Math.Angle.Between(fromX, fromY, toX, toY);
      const shot = this.w(this.add.image(fromX, fromY, "arrow").setOrigin(1, 0.5).setRotation(angle).setDepth(6)
        .setBlendMode(Phaser.BlendModes.ADD).setScale(length, scale * 0.85).setTint(tint));
      const trail = this.w(this.add.particles(0, 0, "dot", { follow: shot, lifespan: 260, scale: { start: 0.6 * scale, end: 0 }, tint: tint === 0xffffff ? C.glow : tint, blendMode: Phaser.BlendModes.ADD, frequency: 14 }).setDepth(6));
      return this.tween({ targets: shot, x: toX, y: toY, duration, ease: "Quad.in" }).then(() => {
        shot.destroy(); trail.stop(); this.time.delayedCall(320, () => trail.destroy());
      });
    }

    // ---------- hits ----------
    burst(x, y, kind, tier) {
      const big = { weak: 0.7, normal: 1, strong: 1.3, special: 1.7 }[tier];
      const colors = {
        spark: [0xffffff, C.glow, C.gold], gold: [0xffffff, C.gold, 0xffb35c],
        dust: [C.dust, 0x8a7a66, 0xe0d2bf], mega: [0xffffff, C.pink, C.gold, C.glow]
      }[kind];
      const ringTint = { spark: C.glow, gold: C.gold, dust: 0xe0d2bf, mega: C.pink }[kind];
      const ring = this.w(this.add.image(x, y, kind === "dust" ? "glow" : "ring").setTint(ringTint).setBlendMode(Phaser.BlendModes.ADD).setDepth(7).setScale(0.2 * big).setAlpha(0.95));
      this.tween({ targets: ring, scale: 1.4 * big, alpha: 0, duration: 420, ease: "Cubic.out" }).then(() => ring.destroy());
      if (kind === "mega") {
        const ring2 = this.w(this.add.image(x, y, "ring").setTint(C.gold).setBlendMode(Phaser.BlendModes.ADD).setDepth(7).setScale(0.1).setAlpha(0.9));
        this.tween({ targets: ring2, scale: 2.6, alpha: 0, duration: 620, delay: 90, ease: "Cubic.out" }).then(() => ring2.destroy());
      }
      const texture = kind === "dust" ? "dot" : kind === "gold" || kind === "mega" ? "star" : "dot";
      const sparks = this.w(this.add.particles(x, y, texture, {
        speed: { min: 200 * big, max: 640 * big }, lifespan: { min: 300, max: 560 },
        scale: texture === "star" ? { start: 4, end: 0 } : { start: 0.9 * big, end: 0 },
        rotate: texture === "star" ? { min: 0, max: 90 } : 0,
        gravityY: kind === "dust" ? 900 : 0, tint: colors,
        blendMode: kind === "dust" ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.ADD, emitting: false
      }).setDepth(7));
      sparks.explode(Math.round(22 * big));
      this.time.delayedCall(700, () => sparks.destroy());
    }

    async hit(who, damage, tier, kind, at = null) {
      const style = TIERS[tier];
      const x = at?.x ?? who.home - who.dir * 10, y = at?.y ?? FEET - 190;
      this.impacts += 1;
      this.burst(x, y, kind, tier);
      if (!REDUCED) this.cameras.main.shake(140 + style.shake * 12000, style.shake);
      who.sprite.setTintFill(0xffffff);
      this.time.delayedCall(70, () => who.sprite.setTint(0xe6eeff));
      this.tween({ targets: who.sprite, x: who.sprite.x - who.dir * style.knock, duration: 90, yoyo: true, ease: "Quad.out" });
      const pop = this.u(this.add.text(who.home, FEET - 430, `-${damage}`, T.display(style.size, style.color)).setOrigin(0.5).setDepth(45).setStroke("#2a1a0e", 12 + style.size / 12));
      pop.setScale(0.6);
      this.tweens.add({ targets: pop, scale: 1, duration: 200, ease: "Back.out" });
      this.tweens.add({ targets: pop, y: "-=90", alpha: { from: 1, to: 0 }, delay: 300, duration: 900, ease: "Cubic.out", onComplete: () => pop.destroy() });
      this.time.delayedCall(60, () => this.checkpoint(`${this.moveLog[this.moveLog.length - 1]}-hit`));
      this.time.delayedCall(420, () => this.checkpoint(`${this.moveLog[this.moveLog.length - 1]}-after`));
      who.hp = Math.max(0, who.hp - damage);
      const hurt = who.hp > 0 ? this.play(who, "hurt").done : Promise.resolve();
      await Promise.all([this.tweenHp(who, who.hp), hurt]);
      if (who.hp > 0) this.toIdle(who);
    }

    // ---------- the ranger's moves ----------
    bowAt(who) { return { x: who.sprite.x + 130, y: FEET - 205 }; }

    async quickShot(me, foe, r) {
      const { hit, done } = this.play(me, "attack", BEAT.ranger.attack);
      await hit;
      const from = this.bowAt(me);
      await this.arrow(from.x, from.y, foe.home - 70, from.y, 230);
      await this.hit(foe, r.damage, r.tier, "spark");
      await done; this.toIdle(me);
    }

    async tripleVolley(me, foe, r) {
      const { hit, done } = this.play(me, "attack", BEAT.ranger.attack, 18);
      await hit;
      const from = this.bowAt(me);
      const targets = [FEET - 290, FEET - 200, FEET - 110];
      const flights = targets.map((ty, i) => this.wait(i * 70).then(() => this.arrow(from.x, from.y, foe.home - 60, ty, 240)).then(() => {
        if (i > 0) this.burst(foe.home - 40, ty, "spark", "weak");
      }));
      await flights[0];
      this.camFocus(foe.home - 200, H / 2 + 40, 1.06, 200);
      await this.hit(foe, r.damage, r.tier, "spark", { x: foe.home - 40, y: targets[0] });
      await Promise.all(flights); await done;
      this.camReset(); this.toIdle(me);
    }

    async powerShot(me, foe, r) {
      await this.play(me, "ranger-draw").done;
      // Hold the draw: the camera moves in, time slows, and light gathers on the arrow.
      const from = this.bowAt(me);
      this.camFocus(me.home + 200, FEET - 220, 1.16, 420);
      this.slow(true);
      const charge = this.w(this.add.image(from.x - 10, from.y, "glow").setTint(C.gold).setBlendMode(Phaser.BlendModes.ADD).setDepth(6).setScale(0.2).setAlpha(0.9));
      const motes = this.w(this.add.particles(from.x - 10, from.y, "dot", {
        emitZone: { type: "edge", source: new Phaser.Geom.Circle(0, 0, 150), quantity: 24 },
        moveToX: from.x - 10, moveToY: from.y, lifespan: 420, scale: { start: 0.7, end: 0.1 },
        tint: [C.gold, 0xffffff], blendMode: Phaser.BlendModes.ADD, frequency: 30
      }).setDepth(6));
      await this.tween({ targets: charge, scale: 1.3, duration: 260, ease: "Quad.in" });
      motes.stop();
      const { done } = this.play(me, "ranger-release");
      charge.destroy(); this.time.delayedCall(300, () => motes.destroy());
      this.camFocus(foe.home - 120, FEET - 220, 1.12, 260);
      await this.arrow(from.x, from.y, foe.home - 60, from.y, 300, 2.4, 0xffe08a, 1.5);
      this.slow(false);
      this.flash(0xfff1c9, 0.35);
      await this.hit(foe, r.damage, r.tier, "gold");
      await done;
      this.camReset(); this.toIdle(me);
    }

    async arrowRain(me, foe, r) {
      const { hit, done } = this.play(me, "skyshot", BEAT.ranger.skyshot);
      await hit;
      const up = { x: me.sprite.x + 36, y: FEET - 470 };
      await this.arrow(up.x, up.y, up.x + 30, -140, 260);
      done.then(() => this.toIdle(me));
      this.camFocus(foe.home - 60, H / 2 - 20, 1.08, 380);
      await this.wait(260);
      const drops = Array.from({ length: 12 }, (_, i) => {
        const tx = foe.home + rand(-170, 170), ty = FEET - rand(20, 330);
        return this.wait(i * 60).then(() => this.arrow(tx - 40, -120, tx, ty, 360, 1.2)).then(() => {
          if (i % 3 === 1) this.burst(tx, ty, "spark", "normal");
        });
      });
      await drops[2];
      this.flash(0xff8ae0, 0.3);
      await this.hit(foe, r.damage, r.tier, "mega");
      await Promise.all(drops);
      this.camReset(420);
    }

    // ---------- the Bigfoot's moves ----------
    async clubSwing(me, foe, r) {
      const reach = me.home + me.dir * 150;
      this.moveTo(me, reach, 260);
      const { hit, done } = this.play(me, "attack", BEAT.bigfoot.attack);
      await hit;
      await this.hit(foe, r.damage, r.tier, "spark", { x: foe.home + 40, y: FEET - 180 });
      await done;
      this.toIdle(me);
      await this.moveTo(me, me.home, 300, "Quad.inOut");
    }

    async groundPound(me, foe, r) {
      await this.moveTo(me, me.home + me.dir * 90, 220);
      const { hit, done } = this.play(me, "pound", BEAT.bigfoot.pound);
      await hit;
      const slamX = me.sprite.x + me.dir * 150;
      this.burst(slamX, FEET - 10, "dust", "normal");
      if (!REDUCED) this.cameras.main.shake(180, 0.008);
      // A shockwave runs along the boardwalk, and each plank strip bounces as it passes.
      const wave = this.w(this.add.image(slamX, FEET - 6, "glow").setScale(1.6, 0.42).setTint(0xbfe9ff).setBlendMode(Phaser.BlendModes.ADD).setDepth(6).setAlpha(0.9));
      const speed = 2.2; // game pixels for each millisecond
      const reachAt = Math.abs(foe.home - slamX) / speed;
      this.tween({ targets: wave, x: foe.home - 260, scaleX: 2.6, alpha: 0.2, duration: (Math.abs(foe.home - 260 - slamX)) / speed, ease: "Linear" }).then(() => wave.destroy());
      this.planks.forEach((p) => {
        const between = (p.centerX - slamX) * me.dir >= -60 && (p.centerX - (foe.home - 260)) * me.dir <= 0;
        if (!between) return;
        const delay = Math.abs(p.centerX - slamX) / speed;
        this.tweens.add({ targets: p, y: NEAR_TOP - 16, duration: 90, delay, yoyo: true, ease: "Quad.out" });
      });
      await this.wait(reachAt);
      this.tween({ targets: foe.sprite, y: FEET - 46, duration: 140, yoyo: true, ease: "Quad.out" });
      await this.hit(foe, r.damage, r.tier, "dust");
      await done;
      this.toIdle(me);
      await this.moveTo(me, me.home, 300, "Quad.inOut");
    }

    async leapSmash(me, foe, r) {
      const anim = this.play(me, "leap", BEAT.bigfoot.leapUp);
      await anim.hit;
      // The jump follows an arc in code; the animation lands on its smash frame as the arc ends.
      const startX = me.sprite.x, endX = foe.home - me.dir * 330;
      const flight = ((BEAT.bigfoot.leapDown - BEAT.bigfoot.leapUp) / 13) * 1000;
      this.camFocus((startX + endX) / 2, FEET - 280, 1.06, flight);
      await new Promise((resolve) => this.tweens.addCounter({ from: 0, to: 1, duration: flight, ease: "Linear",
        onUpdate: (t) => {
          const k = t.getValue(), x = startX + (endX - startX) * k, lift = 300 * 4 * k * (1 - k);
          me.sprite.setPosition(x, FEET - lift);
          me.back.setPosition(x, FEET - 170 - lift);
          me.shadow.setPosition(x, FEET + 4).setScale(1 - 0.5 * Math.sin(Math.PI * k));
        }, onComplete: resolve }));
      this.burst(endX - me.dir * -120, FEET - 10, "dust", "strong");
      if (!REDUCED) { this.cameras.main.shake(260, 0.012); this.cameras.main.zoomTo(1.12, 90, "Quad.out", true); }
      this.planks.forEach((p) => { if (Math.abs(p.centerX - endX) < 340) this.tweens.add({ targets: p, y: NEAR_TOP - 10, duration: 70, yoyo: true }); });
      await this.hit(foe, r.damage, r.tier, "dust", { x: foe.home + 30, y: FEET - 160 });
      await anim.done;
      this.toIdle(me);
      this.camReset();
      // A short hop back home.
      await new Promise((resolve) => this.tweens.addCounter({ from: 0, to: 1, duration: 420, ease: "Linear",
        onUpdate: (t) => {
          const k = t.getValue(), x = endX + (me.home - endX) * k, lift = 90 * 4 * k * (1 - k);
          me.sprite.setPosition(x, FEET - lift); me.back.setPosition(x, FEET - 170 - lift); me.shadow.setPosition(x, FEET + 4);
        }, onComplete: resolve }));
    }

    async boulderThrow(me, foe, r) {
      const { hit, done } = this.play(me, "throw", BEAT.bigfoot.throw);
      await hit;
      done.then(() => this.toIdle(me));
      const from = { x: me.sprite.x, y: FEET - 462 }, to = { x: foe.home + 30, y: FEET - 190 };
      const rock = this.w(this.add.image(from.x, from.y, "boulder").setScale(SCALE).setDepth(6));
      const rockShadow = this.w(this.add.ellipse(from.x, FEET + 4, 120, 22, 0x02060c, 0.35).setDepth(3));
      this.camFocus((from.x + to.x) / 2, FEET - 300, 1.05, 600);
      await new Promise((resolve) => this.tweens.addCounter({ from: 0, to: 1, duration: 640, ease: "Linear",
        onUpdate: (t) => {
          const k = t.getValue();
          rock.setPosition(from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k - 120 * 4 * k * (1 - k));
          rock.setAngle(-k * 540);
          rockShadow.setX(rock.x).setScale(0.6 + 0.4 * k);
        }, onComplete: resolve }));
      rock.destroy(); rockShadow.destroy();
      // The rock shatters into chips.
      const chips = this.w(this.add.particles(to.x, to.y, "chip", {
        speed: { min: 300, max: 820 }, angle: { min: 180, max: 360 }, gravityY: 1700, lifespan: 1000,
        scale: { min: 5, max: 8 }, rotate: { min: 0, max: 360 }, emitting: false
      }).setDepth(7));
      chips.explode(34);
      this.burst(to.x, to.y + 40, "dust", "strong");
      this.time.delayedCall(1000, () => chips.destroy());
      this.flash(0xff8ae0, 0.25);
      this.camFocus(to.x + 80, FEET - 220, 1.14, 120);
      await this.hit(foe, r.damage, r.tier, "mega", to);
      this.camReset(420);
    }

    async attack(attacker, defender, r) {
      const moves = attacker.key === "ranger"
        ? [this.quickShot, this.tripleVolley, this.powerShot, this.arrowRain]
        : [this.clubSwing, this.groundPound, this.leapSmash, this.boulderThrow];
      const name = MOVES[attacker.key][r.move];
      this.moveLog.push(`${attacker.key}:${name}`);
      this.banner(`${name}!`, r.tier, attacker === this.you ? "left" : "right");
      this.time.delayedCall(560, () => this.checkpoint(`${attacker.key}-${name}-mid`));
      await moves[r.move].call(this, attacker, defender, r);
      this.slow(false);
    }

    async trade(you, cpu) {
      const order = you.damage >= cpu.damage ? [[this.you, this.cpu, you], [this.cpu, this.you, cpu]] : [[this.cpu, this.you, cpu], [this.you, this.cpu, you]];
      for (const [a, d, r] of order) {
        if (a.hp <= 0 || d.hp <= 0) break;
        await this.attack(a, d, r);
        await this.wait(380);
      }
      this.camReset(200);
      const loser = this.you.hp <= 0 ? this.you : this.cpu.hp <= 0 ? this.cpu : null;
      if (!loser) { await this.wait(400); this.nextRound(); return; }
      await this.play(loser, "defeat").done;
      await this.wait(500);
      this.showEnd(loser === this.cpu);
    }

    showEnd(won) {
      if (won) {
        const big = Math.random() < 0.2;
        const coins = 20 + Math.round(MAX_HP / 10) + (big ? 25 : 0);
        this.overlay([
          { text: "You win!", style: T.display(132, "#fff1c9"), shadow: true, gap: 10 },
          { text: `You get ${coins} coins.`, style: T.display(60, "#ffd166"), gap: 18 },
          { text: big ? "Lucky you: a big coin was in the swamp. That is 25 more." : `You won in ${this.round} rounds.`, style: T.body(34, "#dbe8f5") }
        ], "Play again", () => this.newFight());
      } else {
        this.overlay([
          { text: "The computer player wins", style: T.display(92, "#fff1c9"), shadow: true, gap: 10 },
          { text: "You get 5 coins for a good fight.", style: T.display(52, "#ffd166"), gap: 18 },
          { text: "Fast and right answers unlock stronger moves.", style: T.body(34, "#dbe8f5") }
        ], "Try again", () => this.newFight());
      }
    }
  }

  const start = () => window.quotientQuest = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "stage",
    width: W,
    height: H,
    backgroundColor: "#0b1420",
    roundPixels: true,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.NO_CENTER },
    scene: Fight
  });
  const fonts = document.fonts ? Promise.race([
    Promise.all([document.fonts.load('64px "Lilita One"'), document.fonts.load('800 32px "Nunito"')]),
    new Promise((r) => setTimeout(r, 2500))
  ]) : Promise.resolve();
  fonts.then(start, start);
})();
