/* HoverCard — a floating panel shown while the pointer (or keyboard focus) is on
   its trigger. There is no tooltip/popover primitive in @devdigest/ui; this is
   the shared one. Fixed-positioned off the trigger rect so it escapes the
   table's `overflow: hidden`, and flipped above the trigger when it would fall
   off the viewport. */
"use client";

import React from "react";
import {
  OPEN_DELAY_MS,
  CLOSE_DELAY_MS,
  PANEL_WIDTH,
  VIEWPORT_MARGIN,
  MIN_SPACE_BELOW,
} from "./constants";
import { s } from "./styles";

let panelSeq = 0;

export function HoverCard({
  children,
  panel,
  label,
  width = PANEL_WIDTH,
}: {
  /** The trigger content. */
  children: React.ReactNode;
  /** Rendered inside the floating panel; only mounted while open. */
  panel: React.ReactNode;
  /** Accessible name of the trigger button. */
  label: string;
  width?: number;
}) {
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState<{ top: number; left: number; above: boolean } | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const openTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelId = React.useMemo(() => `hovercard-${++panelSeq}`, []);

  const clearTimers = React.useCallback(() => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  }, []);

  React.useEffect(() => clearTimers, [clearTimers]);

  const place = React.useCallback(() => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, r.left),
      Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN),
    );
    // Flip above the trigger when the panel would not fit below it. The panel
    // is then pulled up by its own height with a transform, since we only know
    // the trigger's geometry at this point.
    const below = window.innerHeight - r.bottom;
    const above = below < MIN_SPACE_BELOW && r.top > below;
    setPos({ top: above ? r.top - 8 : r.bottom + 8, left, above });
  }, [width]);

  const show = React.useCallback(
    (immediate = false) => {
      clearTimers();
      const run = () => {
        place();
        setOpen(true);
      };
      if (immediate) run();
      else openTimer.current = setTimeout(run, OPEN_DELAY_MS);
    },
    [clearTimers, place],
  );

  const hide = React.useCallback(
    (immediate = false) => {
      clearTimers();
      if (immediate) setOpen(false);
      else closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
    },
    [clearTimers],
  );

  // Scrolling or resizing invalidates a fixed position that was measured once.
  React.useEffect(() => {
    if (!open) return;
    const onScroll = () => setOpen(false);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? panelId : undefined}
        // The PR row underneath is clickable — the trigger must not navigate.
        onClick={(e) => {
          e.stopPropagation();
          if (open) hide(true);
          else show(true);
        }}
        onMouseEnter={() => show()}
        onMouseLeave={() => hide()}
        onFocus={() => show(true)}
        onBlur={() => hide(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") hide(true);
        }}
        style={s.trigger}
      >
        {children}
      </button>
      {open && pos && (
        <div
          id={panelId}
          role="tooltip"
          onMouseEnter={() => clearTimers()}
          onMouseLeave={() => hide()}
          onClick={(e) => e.stopPropagation()}
          style={s.panel(pos, width)}
        >
          {panel}
        </div>
      )}
    </>
  );
}

export default HoverCard;
