export interface DmContext {
  name: string | null;
}

// Deliberately short and link-free — the point of a first DM is to start a
// reply, not to pitch. Add more variants over time as you see what gets
// replies; identical repeated text is one of the more obvious automation
// signals X's systems look for.
const VARIANTS: ((ctx: DmContext) => string)[] = [
  (ctx) => `hey${ctx.name ? " " + ctx.name : ""} — saw your post, what are you building right now?`,
  (ctx) => `hi${ctx.name ? " " + ctx.name : ""}, curious what you're working on — looked interesting from your post`,
  (_ctx) => `hey — that post about needing dev help caught my eye, what's the project?`,
];

export function renderDm(variantIndex: number, ctx: DmContext): string {
  return VARIANTS[variantIndex % VARIANTS.length](ctx);
}

export const DM_VARIANT_COUNT = VARIANTS.length;
