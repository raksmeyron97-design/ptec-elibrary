// app/(auth)/auth/signup/page.tsx
import SignupContent from "./SignupContent";

/**
 * Signup is now a static shell: the redesigned left panel (AuthBrandPanel)
 * is fixed copy, not the old vision/missions/programs/live-stats panel, so
 * this page no longer needs to resolve site settings or run the four
 * queries the previous version fetched to populate it (getCollectionStats()
 * plus two full "select every published book and sum in JS" scans for
 * downloads/views, plus a profiles count). None of that is displayed
 * anymore — see AuthBrandPanel's docstring — so fetching it was pure waste
 * on the page every new reader lands on first. No Suspense boundary either:
 * there is no async work left to suspend on.
 */
export default function SignupPage() {
  return <SignupContent />;
}
