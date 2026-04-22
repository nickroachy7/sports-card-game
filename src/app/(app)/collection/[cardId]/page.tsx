import { redirect } from "next/navigation";

/**
 * Polish spec §34 (Phase 15) — legacy route redirect.
 *
 * Phase 13's sidebar-swap pattern made `?card=<id>` on the
 * collection page the canonical detail surface; this route was
 * orphaned (nothing links to it). Keep the URL addressable for any
 * bookmarks or external links — redirect to the sidebar detail.
 */
export default async function CardDetailRedirect({
  params,
}: {
  params: Promise<{ cardId: string }>;
}) {
  const { cardId } = await params;
  redirect(`/collection?card=${cardId}`);
}
