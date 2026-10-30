export const expansionSpaces = {
  "space-1": { title: "새 공간 1", x: 124.5, signX: 117, signY: 33, area: { left: 102, top: 34, width: 30, height: 44 } },
  "space-2": { title: "새 공간 2", x: 140, signX: 141, signY: 43, area: { left: 133, top: 44, width: 20, height: 34 } },
  "space-3": { title: "새 공간 3", x: 167.5, signX: 167, signY: 27, area: { left: 154, top: 29, width: 28, height: 49 } },
  "space-4": { title: "새 공간 4", x: 190.8, signX: 190, signY: 34, area: { left: 183, top: 35, width: 17, height: 43 } },
} as const;

export type ExpansionSpaceId = keyof typeof expansionSpaces;
export const expansionSpaceIds = Object.keys(expansionSpaces) as ExpansionSpaceId[];
export const WORLD_SIZE = 200;
export const WORLD_RIGHT_EDGE = 195;
export const worldPercent = (coordinate: number) => coordinate / WORLD_SIZE * 100;

export function isExpansionSpaceId(value: unknown): value is ExpansionSpaceId {
  return typeof value === "string" && Object.hasOwn(expansionSpaces, value);
}
