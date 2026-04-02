import { useState } from "react";
import { cn } from "@/lib/utils";

interface DestinationCardProps {
  id?: string;
  name: string;
  tagline: string;
  votes: number;
  pros: string[];
  cons: string[];
  bestFor: string;
  estCost: string;
  hasVoted?: boolean;
  isWinning?: boolean;
  onVote?: () => void;
}

const DestinationCard = ({
  name,
  tagline,
  votes,
  pros,
  cons,
  bestFor,
  estCost,
  hasVoted = false,
  isWinning = false,
  onVote,
}: DestinationCardProps) => {
  const [animating, setAnimating] = useState(false);

  const handleVote = () => {
    if (onVote) {
      setAnimating(true);
      onVote();
      setTimeout(() => setAnimating(false), 200);
    }
  };

  return (
    <div
      className={cn(
        "py-8 border-l-[3px] pl-6 md:pl-8",
        hasVoted
          ? "border-l-amber"
          : isWinning
          ? "border-l-green"
          : "border-l-transparent"
      )}
    >
      {/* Vote count */}
      <div
        className={cn(
          "font-mono text-[48px] md:text-[72px] leading-none mb-2",
          votes > 0 ? "text-amber" : "text-t-tertiary",
          animating && "animate-vote-scale"
        )}
      >
        {String(votes).padStart(2, "0")}
      </div>

      {/* Destination name */}
      <h3 className="font-display text-[32px] md:text-[40px] font-bold leading-[1.05] text-t-primary mb-1">
        {name}
      </h3>
      <p className="font-ui font-light text-t-secondary text-sm mb-6">
        {tagline}
      </p>

      {/* Pros & Cons */}
      <div className="space-y-1.5 mb-5">
        {pros.map((pro, i) => (
          <div key={`pro-${i}`} className="flex items-start gap-2 text-sm font-ui">
            <span className="text-green mt-0.5">✓</span>
            <span className="text-t-primary">{pro}</span>
          </div>
        ))}
        {cons.map((con, i) => (
          <div key={`con-${i}`} className="flex items-start gap-2 text-sm font-ui">
            <span className="text-terra mt-0.5">✗</span>
            <span className="text-t-primary">{con}</span>
          </div>
        ))}
      </div>

      {/* Meta */}
      <div className="space-y-0.5 mb-6">
        <p className="font-ui font-light text-xs text-t-tertiary">
          Best for: {bestFor}
        </p>
        <p className="font-ui font-light text-xs text-t-tertiary">
          Est. cost: {estCost}
        </p>
      </div>

      {/* CTA */}
      <button
        onClick={handleVote}
        className={cn(
          "h-[44px] rounded-[4px] font-ui text-sm font-medium transition-all duration-150 active:scale-[0.97]",
          hasVoted
            ? "border-l-[3px] border-l-amber text-amber bg-transparent px-6"
            : "bg-transparent border border-b-mid text-t-primary hover:bg-hover px-6"
        )}
      >
        {hasVoted ? "✓ Voted" : `Vote for ${name}`}
      </button>
    </div>
  );
};

export default DestinationCard;
