export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--primary)" />
      <path d="M9 9.5h3.2v13H9z" fill="#fff" />
      <path d="M14.5 9.5H24v3h-3.15v10H17.6v-10h-3.1z" fill="#fff" fillOpacity=".92" />
      <circle cx="24" cy="21" r="1.9" fill="#fff" fillOpacity=".75" />
    </svg>
  );
}

export function Logo({ name, sub }: { name: string; sub?: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="flex flex-col leading-none">
        <span className="text-[15px] font-semibold tracking-tight">{name}</span>
        {sub ? <span className="mt-0.5 text-[11px] text-muted">{sub}</span> : null}
      </span>
    </span>
  );
}
