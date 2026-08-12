/** Constants for the shared HoverCard. */

/** Pointer dwell before the panel opens — long enough not to flash while
 *  sweeping the cursor across a table row. */
export const OPEN_DELAY_MS = 120;

/** Grace period after leaving the trigger, so the pointer can travel into the
 *  panel without it closing under it. */
export const CLOSE_DELAY_MS = 140;

/** Default panel width. */
export const PANEL_WIDTH = 460;

/** Minimum gap kept between the panel and the viewport edges. */
export const VIEWPORT_MARGIN = 12;

/** Below this much room under the trigger, the panel flips above it. */
export const MIN_SPACE_BELOW = 260;
