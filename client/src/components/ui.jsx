import { forwardRef } from 'react';
import { motion } from 'framer-motion';
import { STATUS_LABELS, STATUS_TONE, STATUS_GLYPH, initials } from '../lib/format';
import { Star as StarIcon } from '../lib/icons';

const cx = (...parts) => parts.filter(Boolean).join(' ');
export { cx };

/* ── Button ─────────────────────────────────────────────── */
const VARIANTS = {
  primary: 'bg-ink text-white hover:bg-ink/90 disabled:bg-ink/40',
  accent: 'bg-accent text-accentInk hover:brightness-95 disabled:opacity-50',
  soft: 'bg-sunken text-ink hover:bg-hairline disabled:opacity-50',
  outline: 'border border-hairline bg-surface text-ink hover:border-ink/30 disabled:opacity-50',
  ghost: 'text-muted hover:text-ink hover:bg-sunken',
  danger: 'bg-danger/10 text-danger hover:bg-danger/20',
};
const SIZES = {
  sm: 'h-9 px-4 text-[13px]',
  md: 'h-11 px-6 text-sm',
  lg: 'h-14 px-8 text-[15px]',
};

export const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', className, loading, children, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      {...props}
      disabled={props.disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition',
        'active:scale-[.98] disabled:cursor-not-allowed',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
});

export function Spinner({ className = '' }) {
  return (
    <span
      className={cx('h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent', className)}
    />
  );
}

/* ── Surfaces ───────────────────────────────────────────── */
export function Card({ className, as: As = 'div', ...props }) {
  return <As {...props} className={cx('card p-6', className)} />;
}

export function Section({ title, action, children, className }) {
  return (
    <section className={className}>
      {(title || action) && (
        <header className="mb-3 flex items-center justify-between px-1">
          <h2 className="text-[15px] font-bold">{title}</h2>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, right }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {right}
    </header>
  );
}

/* ── Form controls ──────────────────────────────────────── */
export function Field({ label, hint, error, children, className }) {
  return (
    <div className={className}>
      {label && <label className="label">{label}</label>}
      {children}
      {error ? (
        <p className="mt-1.5 ml-1 text-[13px] font-medium text-danger">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 ml-1 text-[13px] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef(function Input({ className, icon: Icon, ...props }, ref) {
  if (!Icon) return <input ref={ref} {...props} className={cx('field', className)} />;
  return (
    <div className="relative">
      <Icon size={18} className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-muted" />
      <input ref={ref} {...props} className={cx('field pl-12', className)} />
    </div>
  );
});

export const Select = forwardRef(function Select({ className, children, ...props }, ref) {
  return (
    <select ref={ref} {...props} className={cx('field appearance-none pr-10', className)}>
      {children}
    </select>
  );
});

export const Textarea = forwardRef(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} {...props} className={cx('field rounded-tile', className)} />;
});

/** Pill switcher — used for service type, tabs and dashboard filters. */
export function Segmented({ value, onChange, options, className, size = 'md' }) {
  return (
    <div className={cx('inline-flex rounded-full bg-sunken p-1', className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cx(
              'relative rounded-full font-semibold transition',
              size === 'sm' ? 'px-3.5 py-1.5 text-[13px]' : 'px-5 py-2 text-sm',
              active ? 'text-white' : 'text-muted hover:text-ink'
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${options.map((x) => x.value).join('')}`}
                className="absolute inset-0 rounded-full bg-ink"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              />
            )}
            <span className="relative flex items-center gap-1.5">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ── Bits ───────────────────────────────────────────────── */
export function Avatar({ src, name = '', size = 44, className }) {
  return src ? (
    <img
      src={src}
      alt={name}
      style={{ width: size, height: size }}
      className={cx('shrink-0 rounded-full object-cover', className)}
    />
  ) : (
    <span
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      className={cx('grid shrink-0 place-items-center rounded-full bg-ink/90 font-bold text-white', className)}
    >
      {initials(name)}
    </span>
  );
}

export function Rating({ value = 0, count, size = 14, className }) {
  return (
    <span className={cx('inline-flex items-center gap-1 text-[13px] font-semibold', className)}>
      <StarIcon size={size} className="fill-amber-400 text-amber-400" />
      <span className="tabular">{Number(value).toFixed(1)}</span>
      {count !== undefined && <span className="font-medium text-muted">({count})</span>}
    </span>
  );
}

export function StatusPill({ status, className }) {
  const glyph = STATUS_GLYPH[status];
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold',
        STATUS_TONE[status],
        className
      )}
    >
      {glyph && (
        <span aria-hidden="true" className="text-[10px] leading-none">
          {glyph}
        </span>
      )}
      {STATUS_LABELS[status] || status}
    </span>
  );
}

export function Stat({ label, value, tone = 'default', icon: Icon }) {
  return (
    <div
      className={cx(
        'rounded-tile p-4',
        tone === 'accent' ? 'bg-accent text-accentInk' : tone === 'ink' ? 'bg-ink text-white' : 'bg-sunken'
      )}
    >
      <div className="flex items-center gap-2 text-[13px] font-semibold opacity-70">
        {Icon && <Icon size={16} />}
        {label}
      </div>
      <div className="tabular mt-1 text-2xl font-extrabold">{value}</div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, body, action, tone = 'default' }) {
  return (
    <div className="card grid place-items-center px-6 py-14 text-center">
      {Icon && (
        <span
          className={cx(
            'mb-4 grid h-14 w-14 place-items-center rounded-full',
            tone === 'accent' ? 'bg-accentSoft text-accentDeep' : 'bg-sunken text-muted'
          )}
        >
          <Icon size={24} />
        </span>
      )}
      <h3 className="text-base font-bold">{title}</h3>
      {body && <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }) {
  return <div className={cx('skeleton rounded-tile', className)} />;
}

export function ErrorNote({ error, className }) {
  if (!error) return null;
  return (
    <p className={cx('rounded-tile bg-danger/10 px-4 py-3 text-sm font-medium text-danger', className)}>
      {error.message || String(error)}
    </p>
  );
}

/* ── Modal ──────────────────────────────────────────────── */
export function Modal({ open, onClose, title, children, footer, wide }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center">
      <div className="absolute inset-0 bg-ink/30 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className={cx(
          'relative max-h-[92vh] w-full overflow-y-auto rounded-t-card bg-surface p-6 shadow-lift sm:rounded-card',
          wide ? 'sm:max-w-2xl' : 'sm:max-w-md'
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="rounded-full p-1.5 text-muted hover:bg-sunken hover:text-ink">
            ✕
          </button>
        </div>
        {children}
        {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
      </motion.div>
    </div>
  );
}
