import AdminThemeEnforcer from "@/components/layout/AdminThemeEnforcer";

export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <AdminThemeEnforcer />
      <div className="theme-light min-h-screen bg-bg-app text-text-body">
        {children}
      </div>
    </>
  );
}
