export interface Box {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * A `clip-path` that shows only the `inner` box of an element currently occupying `outer`.
 * Used to grow/shrink the expanded chat tile without stretching its content.
 */
export function insetClip(inner: Box, outer: Box, radius: number): string {
  const px = (n: number) => `${Math.max(0, Math.round(n))}px`;
  return `inset(${px(inner.top - outer.top)} ${px(outer.right - inner.right)} ${px(outer.bottom - inner.bottom)} ${px(
    inner.left - outer.left,
  )} round ${px(radius)})`;
}
