import type {
  DeviceLinkResponse,
  DevicesResponse,
  ErrorCode,
  MeResponse,
  NamesResponse,
  SecretCodeResponse,
  SignInResponse,
  SignUpResponse,
} from "../../shared/account";

export type Result<T> = { ok: true; data: T } | { ok: false; error: ErrorCode | "offline" };

async function request<T>(method: string, path: string, body?: unknown): Promise<Result<T>> {
  try {
    const response = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json();
    return response.ok ? { ok: true, data } : { ok: false, error: data.error ?? "bad_request" };
  } catch {
    return { ok: false, error: "offline" };
  }
}

// iPadOS Safari says it is a Mac; a touch screen tells them apart.
const touchMac = navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent);

export const api = {
  me: () => request<MeResponse>("GET", "/api/me"),
  names: () => request<NamesResponse>("GET", "/api/names"),
  signUp: (name: string) => request<SignUpResponse>("POST", "/api/players", { name, touchMac }),
  signIn: (code: string) => request<SignInResponse>("POST", "/api/sign-in", { code, touchMac }),
  redeemLink: (proof: { token: string } | { shortCode: string }) =>
    request<SignInResponse>("POST", "/api/link/redeem", { ...proof, touchMac }),
  remember: (remember: boolean) => request<{ ok: true }>("POST", "/api/session/remember", { remember }),
  secretCode: () => request<SecretCodeResponse>("GET", "/api/me/code"),
  newSecretCode: () => request<SecretCodeResponse>("POST", "/api/me/code"),
  devices: () => request<DevicesResponse>("GET", "/api/devices"),
  signOutDevice: (id: string) => request<{ ok: true }>("DELETE", `/api/devices/${id}`),
  signOut: () => request<{ ok: true }>("POST", "/api/sign-out"),
  deviceLink: () => request<DeviceLinkResponse>("POST", "/api/link"),
};
