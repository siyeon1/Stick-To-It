export const COLORS = [
  "#E8D9B4",
  "#D9E2B8",
  "#E9C9B7",
  "#C8D7CD",
  "#EBD7C5",
] as const;

export function randomColor(): string {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}
