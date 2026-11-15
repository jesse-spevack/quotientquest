export function deviceName(userAgent: string, touchMac: boolean): string {
  const system = operatingSystem(userAgent, touchMac);
  if (system === "iPad" || system === "iPhone") return system;
  if (system === "Android") return /Mobile/.test(userAgent) ? "Android phone" : "Android tablet";

  const browser = browserName(userAgent);
  if (system && browser) return `${browser} on ${system}`;
  return system ?? browser ?? "A device";
}

function operatingSystem(userAgent: string, touchMac: boolean): string | null {
  if (/iPad/.test(userAgent)) return "iPad";
  if (/iPhone|iPod/.test(userAgent)) return "iPhone";
  if (/Android/.test(userAgent)) return "Android";
  if (/CrOS/.test(userAgent)) return "Chromebook";
  // iPadOS Safari reports a Mac, so the client tells us when the "Mac" has a touch screen.
  if (/Macintosh/.test(userAgent)) return touchMac ? "iPad" : "Mac";
  if (/Windows/.test(userAgent)) return "Windows";
  if (/Linux/.test(userAgent)) return "Linux";
  return null;
}

function browserName(userAgent: string): string | null {
  if (/Edg\//.test(userAgent)) return "Edge";
  if (/Firefox\//.test(userAgent)) return "Firefox";
  if (/Chrome\//.test(userAgent)) return "Chrome";
  if (/Safari\//.test(userAgent)) return "Safari";
  return null;
}
