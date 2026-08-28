/* ReviewFocus — the full-width "REVIEW FOCUS — READ THESE FIRST" block below
   the Intent/Blast grid and above the PR description (AC-23). Each item is a
   bullet (real element, not `::marker`) with clickable monospace file
   references that deep-link into the normal diff (AC-24). Hidden when the
   Brief has no review-focus items. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, SectionLabel } from "@devdigest/ui";
import type { ReviewFocusItem } from "@devdigest/shared";
import { parseFileRef } from "../../helpers";
import { s } from "./styles";

interface ReviewFocusProps {
  items: ReviewFocusItem[];
  onOpenFile?: (path: string, line: number | null) => void;
}

export function ReviewFocus({ items, onOpenFile }: ReviewFocusProps) {
  const t = useTranslations("prReview");
  if (items.length === 0) return null;

  return (
    <section>
      <SectionLabel icon="ListChecks" right={<Badge>{items.length}</Badge>}>
        {t("reviewFocus.title")}
      </SectionLabel>
      <ul style={s.list}>
        {items.map((item, i) => (
          <li key={`${item.label}:${i}`} style={s.item}>
            <span style={s.bullet} aria-hidden="true">
              •
            </span>
            <span style={s.itemBody}>
              {item.file_refs.map((ref, j) => {
                const { path, line } = parseFileRef(ref);
                return (
                  <button
                    key={`${ref}:${j}`}
                    type="button"
                    style={s.ref}
                    onClick={() => onOpenFile?.(path, line)}
                  >
                    {ref}
                  </button>
                );
              })}
              {item.file_refs.length > 0 && <span style={s.dash}>— </span>}
              {item.label}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
