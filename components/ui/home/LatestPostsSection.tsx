// components/ui/home/LatestPostsSection.tsx
// Server wrapper for the homepage News & Events band.
//
// The fetch lives in lib/home-data.ts rather than here. This component used to
// run its own uncached service-client query against `posts` with a different
// visibility predicate (`is_published`) from the one getLatestPostCached uses
// (`status`), so the news band and <ThisWeekAtPtec> could in principle disagree
// about which posts are live. One fetcher, one predicate, one cache tag.
import LatestPosts from "./LatestPosts";
import { getLatestPostsCached } from "@/lib/home-data";

export default async function LatestPostsSection() {
  const recentPosts = await getLatestPostsCached();

  // <LatestPosts> returns null on an empty list, so a library with no
  // published posts yet simply has no news band.
  return <LatestPosts posts={recentPosts} />;
}
