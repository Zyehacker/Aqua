import { state } from "../types/state";
import { baseMcVersion } from "./format";

export function activeProfileId(): string {
  if (state.selectedInstanceId) return state.selectedInstanceId;
  const match = state.userProfiles.find((p) => p.id === state.settings.version);
  if (match) return match.id;
  return state.settings.version;
}

export function activeMcVersion(): string {
  return baseMcVersion(activeProfileId());
}

export function hasActiveProfile(): boolean {
  return state.userProfiles.length > 0 || Boolean(state.selectedInstanceId);
}
