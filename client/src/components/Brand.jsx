import { Link } from 'react-router-dom';

export default function Brand({ to = '/' }) {
  return (
    <Link to={to} className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-ink text-accent">
        {/* A pulse trace — the one mark that reads as "monitoring" at 36px. */}
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 12h4l2.5-7 4 14 3-9 2 2h4" />
        </svg>
      </span>
      <span className="text-[17px] font-extrabold tracking-tight">VitalWatch</span>
    </Link>
  );
}
