const FRAME_SIZE = 160;
const SHEET_COLUMNS = 10;
const IDLE_FRAMES = 9;
const FRAMES_PER_SECOND = 8;
// The ranger's idle frames all fit in this box of art pixels.
const CROP = { x: 40, y: 64, width: 80, height: 96 };
const TARGET_CSS_HEIGHT = 96;

export function skinPreview(sheetUrl: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.className = "qq-skin";
  const ratio = window.devicePixelRatio || 1;
  const pixelScale = Math.max(1, Math.round((TARGET_CSS_HEIGHT * ratio) / CROP.height));
  canvas.width = CROP.width * pixelScale;
  canvas.height = CROP.height * pixelScale;
  canvas.style.width = `${canvas.width / ratio}px`;
  canvas.style.height = `${canvas.height / ratio}px`;

  const context = canvas.getContext("2d");
  const sheet = new Image();
  sheet.src = sheetUrl;
  if (!context) return canvas;
  context.imageSmoothingEnabled = false;

  let shown = false;
  const draw = (time: number) => {
    if (canvas.isConnected) shown = true;
    else if (shown) return;
    const frame = Math.floor((time / 1000) * FRAMES_PER_SECOND) % IDLE_FRAMES;
    const sourceX = (frame % SHEET_COLUMNS) * FRAME_SIZE + CROP.x;
    const sourceY = Math.floor(frame / SHEET_COLUMNS) * FRAME_SIZE + CROP.y;
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (sheet.complete) {
      context.drawImage(sheet, sourceX, sourceY, CROP.width, CROP.height, 0, 0, canvas.width, canvas.height);
    }
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
  return canvas;
}
