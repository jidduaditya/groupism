import { cn } from "@/lib/utils";

interface CollapsibleSectionProps {
  title: string;
  summary?: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  className?: string;
  complete?: boolean;
}

export default function CollapsibleSection({
  title,
  summary,
  isOpen,
  onToggle,
  children,
  className,
  complete,
}: CollapsibleSectionProps) {
  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "w-full flex items-center justify-between min-h-[52px] px-5 py-3",
          "rounded-[4px] border border-b-subtle bg-surface/50 hover:bg-surface transition-colors cursor-pointer",
          className
        )}
      >
        <span className="flex items-center gap-2 font-display text-lg font-bold text-t-primary text-left">
          {complete && (
            <span className="inline-block w-2 h-2 rounded-full bg-green flex-shrink-0" />
          )}
          {title}
        </span>
        <div className="flex items-center gap-3 flex-shrink-0 ml-4">
          {summary && (
            <span className="font-mono text-xs text-t-tertiary hidden sm:block truncate max-w-[220px]">
              {summary}
            </span>
          )}
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="text-t-tertiary flex-shrink-0"
          >
            <path d="M4 6l4 4 4-4" />
          </svg>
        </div>
      </button>
    );
  }

  return (
    <div className={cn("relative", className)}>
      {children}
      <button
        type="button"
        onClick={onToggle}
        className="absolute top-1.5 right-1.5 w-7 h-7 flex items-center justify-center rounded-[4px] hover:bg-hover text-t-tertiary transition-colors cursor-pointer z-10"
        aria-label="Collapse section"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M4 10l4-4 4 4" />
        </svg>
      </button>
    </div>
  );
}
