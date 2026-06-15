# Mobile Audit & Redesign Plan (PTEC Library)

## 1. Route Map
The application uses the Next.js App Router. The primary routes are grouped under `app/(public)`:
- `/home` - The landing page with a hero section, featured collections, new arrivals, and recent posts.
- `/books` - The main catalogue page with search, filters, and pagination.
- `/books/[slug]` - The book detail page, featuring metadata, a PDF reader, and a review section.
- `/posts` - The news and announcements listing.
- `/posts/[slug]` - The individual post detail page.
- `/about`, `/contact`, `/policy`, `/rules` - Static informational pages.
- `/dashboard` - User dashboard (for reading history, saved books).
- `/auth/login` - Authentication.

## 2. Component Inventory
Shared components are stored in `components/`:
- **Layout (`components/layout/`)**:
  - `Navbar.tsx` (Server) / `NavbarClient.tsx` (Client) - Desktop top navigation.
  - `MobileBottomNav.tsx` (Client) - Fixed bottom bar for phones.
  - `MobileMenu.tsx` (Client) - Slide-in drawer for phones (hamburger menu).
  - `Footer.tsx` (Server) - Global footer.
- **UI (`components/ui/`)**:
  - `BookCard.tsx`, `HeroBookStack.tsx`, `CatalogCard.tsx` - Display primitives for books.
  - `PDFViewer.tsx`, `PDFViewerClient.tsx`, `PDFCover.tsx` - PDF rendering components.
  - `Pagination.tsx`, `SearchBar.tsx`, `FilterSidebar.tsx` - Interactive catalogue controls.
  - `ReviewList.tsx`, `ReviewForm.tsx`, `RatingStars.tsx` - Review system.

## 3. Design System Summary
Extracted from `app/globals.css`:
- **Colors**:
  - `brand` (`#1E3A8A`), `brand-hover` (`#182E6E`), `brand-contrast` (`#FFFFFF`).
  - `accent` (`#DDB022` - Gold), `success` (`#15803D`), `danger` (`#B91C1C`).
  - Surfaces: `bg-bg-app` (`#F3F4F6`), `bg-bg-surface` (`#FFFFFF`), `bg-paper` (`#F3F4F6`).
- **Typography**:
  - `font-sans`: Inter/Arial (English UI).
  - `font-serif`: Playfair Display/Georgia (English headings).
  - `font-khmer-serif`: Noto Serif Khmer (Khmer headings, needs `leading-[1.4]`).
  - `font-body`: Battambang (Khmer body, needs `leading-[1.8]`).
- **Breakpoints**: Tailwind defaults (`sm: 640px`, `md: 768px`, `lg: 1024px`, `xl: 1280px`).
- **~~Inconsistencies Found~~** ✅ DONE: `MobileMenu.tsx` and `MobileBottomNav.tsx` no longer use hardcoded hex colors — all replaced with `brand` tokens.

## 4. Current Mobile Architecture
- **Desktop (`lg`+)**: Uses `Navbar.tsx` and `NavbarClient.tsx`.
- **Mobile (`< lg`)**: 
  - `MobileBottomNav.tsx` sits fixed at the bottom (`h-16`).
  - `MobileMenu.tsx` is a slide-in drawer.
  - **Issue:** Tablets (`md` to `lg`) currently get the mobile layout. This is acceptable for touch devices, but we must ensure the mobile layout scales up cleanly to 1024px.
  - **~~Issue:~~** ✅ DONE: "My Dashboard", "Saved Books", and "Settings" now available in both `MobileBottomNav` sheet and `MobileMenu` drawer.
  - **~~Issue:~~** ✅ DONE: Profile sheet no longer shows the email twice when `user.full_name` is null.

## 5. Per-Screen Mobile Problem List
- **~~Global~~**: ✅ DONE: `app/(public)/layout.tsx` now has `pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0`.
- **`/books`**: The filter row (categories) uses a flex container without `min-w-0`, causing horizontal overflow on very small screens.
- **`/books/[slug]`**: 
  - `<dl>` metadata values (like ISBNs) do not wrap, causing horizontal scroll.
  - The "Continue reading" bar text can get cramped or push the viewport width on 360px screens.
  - PDF reader needs to ensure `max-w-full` behavior.
- **`/posts`**: Khmer typography needs careful line-height (`leading-relaxed` or `1.8`) and padding adjustments for optimal reading.

## 6. Proposed Redesign Plan (Design Decisions)
1. **Breakpoint Strategy**: Mobile-first (`base` classes for phones). `sm` (640px) and `md` (768px) will handle larger phones and tablets. Desktop starts at `lg` (1024px).
2. **Navigation Model**:
   - ✅ DONE: `MobileBottomNav` sheet and `MobileMenu` drawer now have "Dashboard", "Saved Books", and "Settings" links.
   - ✅ DONE: All hardcoded hex colors replaced with `brand` tokens.
   - ✅ DONE: Profile sheet no longer duplicates email.
3. **Typography Scale**: Ensure all interactive text is ≥13px. Apply `.khmer` or `font-khmer-serif` utility classes consistently with appropriate line-heights.
4. **Layout Primitives**: 
   - Apply a global `pb-[calc(4.5rem+env(safe-area-inset-bottom))]` to `app/(public)/layout.tsx`.
   - Ensure all flex/grid children with text have `min-w-0` and `break-words`.
   - Ensure tap targets (buttons, links) have adequate padding (e.g., `py-3` on mobile).
