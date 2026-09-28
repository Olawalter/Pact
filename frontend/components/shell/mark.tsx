/** PACT's mark: an agreement's lines, and the point where it was decided. */
export function Mark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label="PACT">
      <rect width="32" height="32" rx="6" fill="#0b0f14" />
      <path d="M8 9h16M8 14h11M8 19h7" stroke="#f7f9fc" strokeWidth="2" strokeLinecap="square" />
      <circle cx="22.5" cy="21.5" r="4.5" fill="#2563eb" />
      <path d="M20.4 21.6l1.6 1.6 3-3.2" stroke="#ffffff" strokeWidth="1.8" fill="none"
            strokeLinecap="square" />
    </svg>
  );
}
