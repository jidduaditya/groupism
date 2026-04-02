import { Link } from "react-router-dom";
import { useAppVersion } from "@/hooks/useAppVersion";
import { cn } from "@/lib/utils";

const Header = () => {
  const [appVersion, setAppVersion] = useAppVersion();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 md:px-10">
      <Link to="/" className="font-display font-medium text-lg text-t-primary tracking-wide">
        Groupism
      </Link>

      <div className="flex items-center gap-0 bg-elevated border border-b-mid rounded-[4px] overflow-hidden">
        {(["v4", "v5"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setAppVersion(v)}
            className={cn(
              "px-3 py-1 font-mono text-xs transition-colors",
              appVersion === v
                ? "bg-amber text-[#1c1a15] font-medium"
                : "text-t-secondary hover:bg-hover"
            )}
          >
            {v.toUpperCase()}
          </button>
        ))}
      </div>
    </header>
  );
};

export default Header;
