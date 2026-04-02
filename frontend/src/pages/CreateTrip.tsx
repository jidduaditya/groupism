import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import DestinationCard from "@/components/DestinationCard";
import { api, setTokens } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

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

interface Destination {
  id: string;
  name: string;
  tagline: string;
  votes: number;
  pros: string[];
  cons: string[];
  bestFor: string;
  estCost: string;
}

function formatCost(min: number, max: number): string {
  return `₹${min.toLocaleString("en-IN")} – ₹${max.toLocaleString("en-IN")} pp`;
}

const CreateTrip = () => {
  const navigate = useNavigate();
  const [tripName, setTripName] = useState("");
  const [organiserName, setOrganiserName] = useState("");
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
  const [destinations, setDestinations] = useState<Destination[] | null>(null);

  // Stored after trip creation so we can call ai-suggest and navigate
  const [joinToken, setJoinToken] = useState<string | null>(null);

  const currentStep = step2Done ? 3 : step1Done ? 2 : 1;

  useEffect(() => {
    if (!loading) return;
    const interval = setInterval(() => {
      setLoadingMsgIdx((prev) => (prev + 1) % loadingMessages.length);
    }, 1500);
    return () => clearInterval(interval);
  }, [loading]);

  // Create the trip first (if not already created), then call AI suggest
  const handleGetSuggestions = async () => {
    setLoading(true);
    try {
      let token = joinToken;

      // Create trip if we haven't yet
      if (!token) {
        const trip = await api.post("/api/trips", {
          name: tripName,
          organiser_name: organiserName || "Organiser",
          budget_min: Number(budgetMin) || undefined,
          budget_max: Number(budgetMax) || undefined,
          travel_from: dateFrom || undefined,
          travel_to: dateTo || undefined,
          deadline: confirmBy || undefined,
        });

        token = trip.join_token;
        setJoinToken(token);
        setTokens(token, {
          memberToken: trip.member_token,
          memberId: trip.member_id,
          organiserToken: trip.organiser_token,
        });
      }

      // Call AI suggestions
      const res = await api.post(
        `/api/trips/${token}/ai-suggest`,
        {
          group_size: groupSize,
          budget_min: Number(budgetMin) || 5000,
          budget_max: Number(budgetMax) || 15000,
          travel_from: dateFrom,
          travel_to: dateTo,
          notes,
        },
        token
      );

      const mapped: Destination[] = (res.destinations || []).map((d: any) => ({
        id: d.id || "",
        name: d.name,
        tagline: d.tagline || "",
        votes: 0,
        pros: d.pros || [],
        cons: d.cons || [],
        bestFor: d.best_for || "",
        estCost: formatCost(d.estimated_cost_min || 0, d.estimated_cost_max || 0),
      }));

      setDestinations(mapped);
    } catch (err: any) {
      toast({
        title: "AI suggestions unavailable",
        description: err.message || "You can still create the trip and add destinations manually.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRoom = async () => {
    try {
      let token = joinToken;

      // Create trip if AI was skipped
      if (!token) {
        const trip = await api.post("/api/trips", {
          name: tripName,
          organiser_name: organiserName || "Organiser",
          budget_min: Number(budgetMin) || undefined,
          budget_max: Number(budgetMax) || undefined,
          travel_from: dateFrom || undefined,
          travel_to: dateTo || undefined,
          deadline: confirmBy || undefined,
        });

        token = trip.join_token;
        setJoinToken(token);
        setTokens(token, {
          memberToken: trip.member_token,
          memberId: trip.member_id,
          organiserToken: trip.organiser_token,
        });
      }

      navigate(`/trip/${token}`);
    } catch (err: any) {
      toast({
        title: "Failed to create trip",
        description: err.message,
        variant: "destructive",
      });
    }
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
              <label className="eyebrow block mb-3">YOUR NAME</label>
              <input
                type="text"
                value={organiserName}
                onChange={(e) => setOrganiserName(e.target.value)}
                placeholder="Aditya"
                className="w-full text-lg font-ui bg-transparent border-b border-b-mid pb-2 text-t-primary placeholder:text-t-tertiary focus:outline-none focus:border-t-secondary transition-colors"
              />
            </div>

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
                disabled={!tripName || !organiserName}
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
                  {destinations.map((d) => (
                    <DestinationCard key={d.id || d.name} {...d} />
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
