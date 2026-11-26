/**
 * Developer-only extras: the recorded test runs' teams (Saved teams) and their special units (Recent units).
 * Off unless the developer's own `.env.local` (git-ignored, next to package.json) has the line
 *
 *     VITE_DEV_EXTRAS=1
 *
 * It's read when the app is built or the dev server starts, so the web page can't turn it on, and the published site
 * (built without that file) never shows them. Restart `npm run dev` after changing it.
 */
export const DEV_EXTRAS = import.meta.env.VITE_DEV_EXTRAS === "1";
