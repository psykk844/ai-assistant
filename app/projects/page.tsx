import { requireHardcodedSession } from "@/lib/auth/session";
import { resolveSessionUserId } from "@/lib/auth/session-user";
import { loadProjectBoard } from "@/lib/projects/repository";
import { isProjectArea } from "@/lib/projects/status";
import { ProjectsBoardClient } from "./projects-board-client";

export const dynamic = "force-dynamic";

type ProjectsPageProps = {
  searchParams?: { area?: string; project?: string } | Promise<{ area?: string; project?: string }>;
};

export default async function ProjectsPage({ searchParams }: ProjectsPageProps) {
  await requireHardcodedSession();
  const userId = await resolveSessionUserId();
  const params = await Promise.resolve(searchParams);
  const area = isProjectArea(params?.area) ? params.area : "demand";
  const board = await loadProjectBoard(userId, params?.project ?? null, area);

  return <ProjectsBoardClient initialArea={area} initialBoard={board} />;
}
