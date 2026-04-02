import { cn } from "@/lib/utils";

interface ReadinessBarProps {
  members: Array<{
    name: string;
    status: "confirmed" | "voted" | "none";
  }>;
}

const ReadinessBar = ({ members }: ReadinessBarProps) => {
  const confirmed = members.filter((m) => m.status === "confirmed").length;

  return (
    <div>
      {/* Names cast list */}
      <div className="flex flex-wrap gap-x-6 gap-y-3 mt-4">
        {members.map((member, i) => (
          <span
            key={i}
            className={cn(
              "font-ui text-sm transition-all",
              member.status === "confirmed" && "text-t-primary border-b border-amber pb-0.5",
              member.status === "voted" && "text-t-primary border-b border-amber/40 pb-0.5 opacity-60",
              member.status === "none" && "text-t-primary opacity-[0.35]"
            )}
          >
            {member.name}
          </span>
        ))}
      </div>
      <p className="font-ui font-light text-sm text-t-secondary mt-4">
        {confirmed} of {members.length} people have confirmed.
      </p>
    </div>
  );
};

export default ReadinessBar;
