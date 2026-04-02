import { useState } from "react";
import Header from "@/components/Header";
import DestinationCard from "@/components/DestinationCard";
import ReadinessBar from "@/components/ReadinessBar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const mockMembers = [
  { name: "Arjun", initials: "AR", status: "confirmed" as const },
  { name: "Priya", initials: "PR", status: "confirmed" as const },
  { name: "Rahul", initials: "RA", status: "voted" as const },
  { name: "Neha", initials: "NE", status: "confirmed" as const },
  { name: "Vikram", initials: "VI", status: "none" as const },
  { name: "Aisha", initials: "AI", status: "confirmed" as const },
  { name: "Karan", initials: "KA", status: "none" as const },
  { name: "Meera", initials: "ME", status: "confirmed" as const },
];

const mockDestinations = [
  {
    name: "Goa",
    tagline: "Beach energy, good food, iconic India",
    votes: 7,
    pros: ["Great for groups of mixed ages", "Flights are reasonable in March"],
    cons: ["Can get overcrowded on weekends", "Some areas feel tourist-trapped"],
    bestFor: "mixed friend groups",
    estCost: "₹8,000 – ₹12,000 pp",
  },
  {
    name: "Pondicherry",
    tagline: "French Quarter charm, quiet cafés, slower pace",
    votes: 4,
    pros: ["Beautiful architecture and vibe", "Great food scene"],
    cons: ["Beaches aren't great for swimming", "Limited nightlife"],
    bestFor: "couples and calm groups",
    estCost: "₹6,000 – ₹10,000 pp",
  },
  {
    name: "Kasol",
    tagline: "Mountains, trekking, bonfire nights",
    votes: 2,
    pros: ["Stunning scenery on budget", "Great for adventure groups"],
    cons: ["Long travel from most cities", "Weather can be unpredictable"],
    bestFor: "adventure-seeking friends",
    estCost: "₹5,000 – ₹9,000 pp",
  },
];

const TripRoom = () => {
  const [destinations, setDestinations] = useState(mockDestinations);
  const [votedIdx, setVotedIdx] = useState<number | null>(null);
  const [budgetConfirmed, setBudgetConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);

  const isOrganiser = true;
  const unresponded = mockMembers.filter((m) => m.status === "none").length;
  const confirmed = mockMembers.filter((m) => m.status === "confirmed").length;
  const percentage = Math.round((confirmed / mockMembers.length) * 100);

  const handleVote = (idx: number) => {
    setDestinations((prev) =>
      prev.map((d, i) => ({
        ...d,
        votes: i === idx ? (votedIdx === idx ? d.votes - 1 : d.votes + 1) : votedIdx === i ? d.votes - 1 : d.votes,
      }))
    );
    setVotedIdx(votedIdx === idx ? null : idx);
  };

  const handleCopyInvite = () => {
    navigator.clipboard.writeText("TRIP-X7K9");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const maxVotes = Math.max(...destinations.map((d) => d.votes));

  return (
    <div className="min-h-screen relative z-10">
      <Header />
      <div className="max-w-2xl mx-auto px-6 pt-24 pb-20">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between mb-2">
          <div>
            <h1 className="font-display text-[32px] md:text-[36px] font-bold leading-[1.05] text-t-primary">
              Goa March 2026
            </h1>
            <p className="font-mono text-[13px] text-t-secondary mt-1.5">
              ₹8,000 – ₹15,000  ·  15–18 Mar  ·  {mockMembers.length} people
            </p>
          </div>
          <div className="flex gap-3 mt-4 md:mt-0">
            <Button variant="outline-strong" size="sm" onClick={handleCopyInvite}>
              {copied ? "Copied!" : "Copy Link"}
            </Button>
          </div>
        </div>

        {/* Readiness */}
        <div className="section-divider mt-12">
          <span>Trip Readiness — <span className="font-mono text-amber">{percentage}%</span></span>
        </div>
        <ReadinessBar members={mockMembers} />
        {isOrganiser && unresponded > 0 && (
          <p className="mt-3 font-ui text-sm text-terra">
            {unresponded} people haven't voted yet.{" "}
            <button className="underline hover:no-underline transition-all">
              Nudge them →
            </button>
          </p>
        )}

        {/* Destinations */}
        <div className="section-divider mt-12">
          <span>Where are we going</span>
        </div>
        <div className="divide-y divide-b-subtle">
          {destinations.map((d, i) => (
            <DestinationCard
              key={i}
              {...d}
              hasVoted={votedIdx === i}
              isWinning={d.votes === maxVotes && d.votes > 0}
              onVote={() => handleVote(i)}
            />
          ))}
        </div>
        <button className="mt-4 font-ui text-sm text-t-secondary hover:text-t-primary transition-colors">
          + Add your own destination
        </button>

        {/* Members */}
        <div className="section-divider mt-12">
          <span>Who's in</span>
        </div>
        <div className="flex flex-wrap gap-4">
          {mockMembers.map((member, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center font-ui text-xs font-medium bg-elevated text-t-primary transition-all",
                  member.status === "confirmed" && "ring-2 ring-green",
                  member.status === "voted" && "ring-2 ring-amber/50",
                  member.status === "none" && "opacity-40"
                )}
              >
                {member.initials}
              </div>
              <span className="font-ui text-xs text-t-secondary">{member.name}</span>
            </div>
          ))}
        </div>

        {/* Budget */}
        <div className="section-divider mt-12">
          <span>Budget</span>
        </div>
        <p className="font-display text-[28px] font-bold text-t-primary mb-4">
          ₹8,000 – ₹15,000
        </p>
        {budgetConfirmed ? (
          <p className="font-ui text-sm text-green flex items-center gap-2">
            <span>✓</span> You've confirmed the budget
          </p>
        ) : (
          <Button variant="outline-strong" onClick={() => setBudgetConfirmed(true)}>
            I'm okay with this budget
          </Button>
        )}
      </div>
    </div>
  );
};

export default TripRoom;
