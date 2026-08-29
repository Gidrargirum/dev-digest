/* Project Context Folder — /repos/:repoId/context. Thin route: the whole
   feature lives in _components/ProjectContextView. */
"use client";

import { useParams } from "next/navigation";
import { ProjectContextView } from "./_components/ProjectContextView";

export default function ProjectContextPage() {
  const params = useParams<{ repoId: string }>();
  return <ProjectContextView repoId={params.repoId} />;
}
