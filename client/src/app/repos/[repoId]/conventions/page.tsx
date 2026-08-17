/* Conventions Extractor — /repos/:repoId/conventions. Thin route: the whole
   feature lives in _components/ConventionsView. */
"use client";

import { useParams } from "next/navigation";
import { ConventionsView } from "./_components/ConventionsView";

export default function ConventionsPage() {
  const params = useParams<{ repoId: string }>();
  return <ConventionsView repoId={params.repoId} />;
}
