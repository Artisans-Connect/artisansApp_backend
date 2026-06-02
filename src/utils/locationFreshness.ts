import { MATCHING } from "../constants/enums";

export function isLocationFresh(locationAt: string | null | undefined): boolean {
  if (!locationAt) return false;
  return Date.now() - new Date(locationAt).getTime() < MATCHING.LOCATION_STALE_MS;
}
