import { LANE_LABELS, LANE_ORDER, type LaneKey } from "../shared/lane";

export const MOBILE_QUICK_ADD_LANES: Array<{ key: LaneKey; label: string }> = LANE_ORDER.map((lane) => ({
  key: lane,
  label: LANE_LABELS[lane],
}));
