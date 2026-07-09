import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import AskWidget from "@/components/ui/ask/AskWidget";
import { createClient } from "@/lib/supabase/server";

export default async function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="flex min-h-screen flex-col overflow-x-clip pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">
      <Navbar />
      <main id="main-content" className="flex-grow">{children}</main>
      <Footer />
      <AskWidget isLoggedIn={!!user} />
    </div>
  );
}
