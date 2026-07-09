import { Link } from "@/i18n/navigation";
export default function PostNotFound() {
  return (
    <div className="min-h-screen bg-bg-app pt-[72px] flex items-center justify-center px-5">
      <div className="max-w-md w-full text-center py-20">
        {/* Icon */}
        <div className="mx-auto mb-6 w-20 h-20 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center">
          <svg
            width="36"
            height="36"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#1E3A8A"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 19.5V6a2 2 0 012-2h12v16H6.5a2.5 2.5 0 010-5H18" />
            <path d="M9 10h6M9 14h4" />
          </svg>
        </div>

        {/* Headline */}
        <h1 className="font-khmer-serif font-bold text-text-heading text-2xl mb-3">
          រកមិនឃើញអត្ថបទ
        </h1>
        <p className="font-khmer-serif text-2xl font-bold text-text-heading mb-1">Post not found</p>

        {/* Sub-text */}
        <p className="text-text-muted text-sm leading-relaxed mb-8 max-w-xs mx-auto">
          The post you are looking for does not exist, has been removed, or has not been published yet.
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/posts"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-brand px-6 py-2.5 text-sm font-bold text-white transition hover:bg-brand-hover shadow-sm"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
            </svg>
            ត្រឡប់ទៅព័ត៌មាន
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-full border border-divider bg-white px-6 py-2.5 text-sm font-semibold text-text-body transition hover:bg-paper"
          >
            ទំព័រដើម
          </Link>
        </div>
      </div>
    </div>
  );
}
