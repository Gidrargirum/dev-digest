/* /skills/:id — Skills list + detail (S1). */
"use client";

import { useParams } from "next/navigation";
import { SkillsView } from "../_components/SkillsView";

export default function SkillDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <SkillsView selectedId={id} />;
}
