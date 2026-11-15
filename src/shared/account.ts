export type PlayerView = { name: string };

export type DeviceView = { id: string; name: string; lastSeenAt: number; current: boolean };

export type NamesResponse = { names: string[] };
export type SignUpResponse = { player: PlayerView; secretCode: string };
export type SignInResponse = { player: PlayerView };
export type MeResponse = { player: PlayerView | null; remember: boolean };
export type SecretCodeResponse = { secretCode: string };
export type DevicesResponse = { devices: DeviceView[] };
export type DeviceLinkResponse = { url: string; shortCode: string; expiresAt: number };

export type ErrorCode =
  | "bad_request"
  | "forbidden"
  | "name_taken"
  | "not_found"
  | "signed_out"
  | "too_many_tries"
  | "wrong_code"
  | "wrong_link";

export type ErrorResponse = { error: ErrorCode };

export const LINK_PATH = "/link";
