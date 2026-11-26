/**
 * Parts of the app held back from the public site until they're finished (user, 2026-11-25: Grand Party waits for a
 * later update). Off unless the build has the line below in `.env.local` (git-ignored, next to package.json), so the
 * published site never shows them; restart `npm run dev` after changing it.
 *
 *     VITE_GRAND_PARTY=1
 *
 * The code stays in place: turning a feature on is the whole release step.
 */
export const FEATURES = {
  /** The Grand Party mode, its settings and leaders, and reading GP screenshots. */
  grandParty: import.meta.env.VITE_GRAND_PARTY === "1",
};
