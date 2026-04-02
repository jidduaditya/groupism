import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import DestinationCard from "@/components/DestinationCard";

const budgetPresets = ["₹5K", "₹10K", "₹15K", "₹25K+"];

const presetToValue: Record<string, string> = {
  "₹5K": "5000",
  "₹10K": "10000",
  "₹15K": "15000",
  "₹25K+": "25000",
};

const loadingMessages = [
  "Reading the vibe...",
  "Checking travel windows...",
  "Writing honest tradeoffs...",
];

const mockDestinations = [
  {
    name: "Goa",
    tagline: "Beach energy, good food, iconic India",
    votes: 0,
    pros: ["Great for groups of mixed ages", "Flights are reasonable in March"],
    cons: ["Can get overcrowded on weekends", "Some areas feel tourist-trapped"],
    bestFor: "mixed friend groups",
    estCost: "₹8,000 – ₹12,000 pp",
  },
  {
    name: "Pondicherry",
    tagline: "French Quarter charm, quiet cafés, slower pace",
    votes: 0,
    pros: ["Beautiful architecture and vibe", "Great food scene"],
    cons: ["Beaches aren't great for swimming", "Limited nightlife"],
    bestFor: "couples and calm groups",
    estCost: "₹6,000 – ₹10,000 pp",
  },
  {
    name: "Kasol",
    tagline: "Mountains, trekking, bonfire nights",
    votes: 0,
    pros: ["Stunning scenery on budget", "Great for adventure groups"],
    cons: ["Long travel from most cities", "Weather can be unpredictable"],
    bestFor: "adventure-seeking friends",
    estCost: "₹5,000 – ₹9,000 pp",
  },
];

const CreateTrip = () => {
  const navigate = useNavigate();
  const [tripName, setTripName] = useState("");
  const [groupSize, setGroupSize] = useState(6);
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [confirmBy, setConfirmBy] = useState("");
  const [notes, setNotes] = useState("");

  const [step1Done, setStep1Done] = useState(false);
  const [step2Done, setStep2Done] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const [destinations, setDestinations] = useState<typeof mockDestinations | null>(null);

  const currentStep = step2Done ? 3 : step1Done ? 2 : 1;

  useEffect(() => {
    if (!loading) return;
    const interval = setInterval(() => {
      setLoadingMsgIdx((prev) => (prev + 1) % loadingMessages.length);
    }, 1500);
    return () => clearInterval(interval);
  }, [loading]);

  const handleGetSuggestions = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setDestinations(mockDestinations);
    }, 4500);
  };

  const handleCreateRoom = () => {
    navigate("/trip/demo-trip-123");
  };

  return (
    <div className="min-h-screen relative z-10">
      <Header />
      <div className="max-w-xl mx-auto px-6 pt-24 pb-20">
        {/* Progress indicator */}
        <div className="flex gap-3 mb-12">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-[2px] flex-1 transition-colors duration-300 ${
                s <= currentStep ? "bg-t-primary" : "bg-b-mid"
              }`}
            />
          ))}
        </div>

        {/* Step 1 */}
        <section className="mb-16">
          <h2 className="font-display text-[36px] md:text-[40px] font-bold leading-[1.05] text-t-primary mb-8">
            Name the trip
          </h2>

          <div className="space-y-8">
            <input
              type="text"
              value={tripName}
              onChange={(e) => setTripName(e.target.value)}
              placeholder="Goa March '26"
              className="w-full text-[20px] md:text-[24px] font-ui font-medium bg-transparent border-b border-b-mid pb-3 text-t-primary placeholder:text-t-tertiary focus:outline-none focus:border-t-secondary transition-colors"
            />

            <div>
              <label className="eyebrow block mb-4">HOW MANY PEOPLE</label>
              <div className="flex items-center gap-6">
                <button
                  onClick={() => setGroupSize(Math.max(2, groupSize - 1))}
                  className="text-t-secondary text-2xl font-ui font-light hover:text-t-primary transition-colors h-11 w-11 flex items-center justify-center"
                >
                  −
                </button>
                <span className="font-mono text-[32px] text-t-primary w-12 text-center">
                  {groupSize}
                </span>
                <button
                  onClick={() => setGroupSize(groupSize + 1)}
                  className="text-t-secondary text-2xl font-ui font-light hover:text-t-primary transition-colors h-11 w-11 flex items-center justify-center"
                >
                  +
                </button>
              </div>
            </div>

            <div>
              <label className="eyebrow block mb-4">BUDGET PER PERSON (₹)</label>
              <div className="flex items-center gap-4 mb-4">
                <input
                  type="text"
                  value={budgetMin}
                  onChange={(e) => setBudgetMin(e.target.value)}
                  placeholder="min"
                  className="flex-1 text-lg font-ui bg-transparent border-b border-b-mid pb-2 text-t-primary placeholder:text-t-tertiary focus:outline-none focus:border-t-secondary transition-colors"
                />
                <span className="text-t-tertiary">—</span>
                <input
                  type="text"
                  value={budgetMax}
                  onChange={(e) => setBudgetMax(e.target.value)}
                  placeholder="max"
                  className="flex-1 text-lg font-ui bg-transparent border-b border-b-mid pb-2 text-t-primary placeholder:text-t-tertiary focus:outline-none focus:border-t-secondary transition-colors"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {budgetPresets.map((preset) => (
                  <button
                    key={preset}
                    onClick={() => setBudgetMax(presetToValue[preset] || "")}
                    className="px-3 py-1.5 font-ui font-light text-xs border border-b-mid rounded-[4px] text-t-secondary hover:text-t-primary hover:border-b-strong transition-colors"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {!step1Done && (
              <Button
                variant="amber"
                className="w-full h-11"
                disabled={!tripName}
                onClick={() => setStep1Done(true)}
              >
                Continue
              </Button>
            )}
          </div>
        </section>

        {/* Step 2 */}
        {step1Done && (
          <section className="mb-16">
            <h2 className="font-display text-[36px] md:text-[40px] font-bold leading-[1.05] text-t-primary mb-8">
              When are you going?
            </h2>

            <div className="space-y-8">
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="eyebrow block mb-3">FROM</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full h-11 px-3 bg-surface border border-b-mid rounded-[4px] text-t-primary font-ui text-sm focus:outline-none focus:border-t-secondary transition-colors"
                  />
                </div>
                <div className="flex-1">
                  <label className="eyebrow block mb-3">TO</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full h-11 px-3 bg-surface border border-b-mid rounded-[4px] text-t-primary font-ui text-sm focus:outline-none focus:border-t-secondary transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="eyebrow block mb-3">CONFIRM BY</label>
                <input
                  type="date"
                  value={confirmBy}
                  onChange={(e) => setConfirmBy(e.target.value)}
                  className="w-full h-11 px-3 bg-surface border border-b-mid rounded-[4px] text-t-primary font-ui text-sm focus:outline-none focus:border-t-secondary transition-colors"
                />
                <p className="font-ui font-light text-xs text-t-tertiary mt-2">
                  Members who don't respond by this date get nudged.
                </p>
              </div>

              {!step2Done && (
                <Button
                  variant="amber"
                  className="w-full h-11"
                  disabled={!dateFrom || !dateTo}
                  onClick={() => setStep2Done(true)}
                >
                  Continue
                </Button>
              )}
            </div>
          </section>
        )}

        {/* Step 3 */}
        {step2Done && (
          <section className="mb-16">
            <h2 className="font-display text-[36px] md:text-[40px] font-bold leading-[1.05] text-t-primary mb-8">
              Let AI suggest destinations
            </h2>

            <div className="space-y-6">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="anything to know about the group? (elders, kids, people who hate beaches...)"
                className="w-full h-24 p-4 bg-transparent border border-b-mid rounded-[4px] text-t-primary font-ui text-sm placeholder:text-t-tertiary focus:outline-none focus:border-t-secondary transition-colors resize-none"
              />

              {!destinations && !loading && (
                <Button
                  variant="amber"
                  className="w-full h-[52px] text-sm"
                  onClick={handleGetSuggestions}
                >
                  Get Suggestions from AI
                </Button>
              )}

              {loading && (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-48 bg-surface border-l-[3px] border-l-transparent overflow-hidden relative"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[rgba(240,234,214,0.04)] to-transparent animate-shimmer" />
                    </div>
                  ))}
                  <p className="font-ui font-light text-sm text-t-secondary">
                    {loadingMessages[loadingMsgIdx]}
                  </p>
                </div>
              )}

              {destinations && (
                <div className="divide-y divide-b-subtle">
                  {destinations.map((d, i) => (
                    <DestinationCard key={i} {...d} />
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* Final CTA */}
        {step1Done && (
          <Button
            variant="amber"
            className="w-full h-12 text-sm"
            onClick={handleCreateRoom}
          >
            Create Trip Room →
          </Button>
        )}
      </div>
    </div>
  );
};

export default CreateTrip;
