import { requireHardcodedSession } from "@/lib/auth/session";
import { resolveSessionUserId } from "@/lib/auth/session-user";
import { loadProjectBoard } from "@/lib/projects/repository";
import { ProjectsBoardClient } from "./projects-board-client";

export const dynamic = "force-dynamic";

type ProjectsPageProps = {
  searchParams?: { project?: string } | Promise<{ project?: string }>;
};

export default async function ProjectsPage({ searchParams }: ProjectsPageProps) {
  await requireHardcodedSession();
  const userId = await resolveSessionUserId();
  const params = await Promise.resolve(searchParams);
  const board = await loadProjectBoard(userId, params?.project ?? null);

  return <ProjectsBoardClient initialBoard={board} />;
}
