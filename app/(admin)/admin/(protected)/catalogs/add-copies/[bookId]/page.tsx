// app/admin/catalogs/add-copies/[bookId]/page.tsx
// Physical copies are managed in one place: the "Physical Copies" tab of the
// book editor. This route stays only so old links/bookmarks keep working.

import { redirect } from "next/navigation";

export default async function AddCopiesPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = await params;
  redirect(`/admin/catalogs/edit/${bookId}?tab=copies`);
}
