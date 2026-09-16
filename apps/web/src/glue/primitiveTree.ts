// Local copies of the shared/primitives contract types used by glue modules.
// Kept structurally identical to packages/shared and packages/primitives so
// glue code here is the same code that runs against the workspace packages;
// importing the packages directly is fine too, these are re-exports kept flat
// to keep glue tests independent of the sibling packages' build state.

/** zekel core/game.ts LegalMove: move_id + description ride the `move`. */
export interface LegalMove {
  move_id?: string;
  description?: string;
  move: Record<string, unknown>;
}

export interface SelectEvent {
  component: string;
  id: string;
  label: string;
}
