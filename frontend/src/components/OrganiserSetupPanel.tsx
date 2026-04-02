import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import DestinationCard from "@/components/DestinationCard";
import { api } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

interface TripData {
  budget_min: number | null;
  budget_max: number | null;
  travel_from: string | null;
  travel_to: string | null;
  deadline: string | null;
}

interface OrganiserSetupPanelProps {
  joinToken: string;
  trip: TripData;
  onTripUpdated: () => void;
  onComplete: () => void;
}

type SetupStep = "budget" | "dates" | "ai";

const budgetPresets = [
  { label: "₹5K", min: 3000, max: 5000 },
  { label: "₹10K", min: 7000, max: 10000 },
  { label: "₹15K", min: 10000, max: 15000 },
  { label: "₹25K+", min: 18000, max: 25000 },
];

const loadingMessages = [
  "Reading the vibe...",
  "Checking travel windows...",
  "Writing honest tradeoffs...",
];

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

interface Destination {
  id: string;
  name: string;
  tagline: string;
  pros: string[];
  cons: string[];
  best_for: string;
  estimated_cost_min: number;
  estimated_cost_max: number;
}

const OrganiserSetupPanel = ({
  joinToken,
  trip,
  onTripUpdated,
  onComplete,
}: OrganiserSetupPanelProps) => {
  const initialStep: SetupStep =
    trip.budget_min === null
      ? "budget"
      : trip.travel_from === null
      ? "dates"
      : "ai";

  const [setupStep, setSetupStep] = useState<SetupStep>(initialStep);
  const [saving, setSaving] = useState(false);

  // Budget fields
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");

  // Date fields
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [confirmBy, setConfirmBy] = useState("");

  // AI fields
  const [notes, setNotes] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const [destinations, setDestinations] = useState<Destination[] | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    if (!aiLoading) return;
    const interval = setInterval(() => {
      setLoadingMsgIdx((prev) => (prev + 1) % loadingMessages.length);
    }, 1500);
    return () => clearInterval(interval);
  }, [aiLoading]);

  const handleSaveBudget = async () => {
    const min = Number(budgetMin);
    const max = Number(budgetMax);
    if (!min || !max || min > max) {
      toast({ title: "Enter a valid budget range", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/api/trips/${joinToken}`, { budget_min: min, budget_max: max }, joinToken);
      await onTripUpdated();
      setSetupStep("dates");
    } catch (err: any) {
      toast({ title: "Failed to save budget", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDates = async () => {
    if (!dateFrom || !dateTo) {
      toast({ title: "Set travel dates", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await api.patch(
        `/api/trips/${joinToken}`,
        { travel_from: dateFrom, travel_to: dateTo, deadline: confirmBy || undefined },
        joinToken
      );
      await onTripUpdated();
      setSetupStep("ai");
    } catch (err: any) {
      toast({ title: "Failed to save dates", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleGetSuggestions = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const groupSize = parseInt(
        localStorage.getItem(`triphaus:${joinToken}:group_size`) ?? "4"
      );
      const res = await api.post(
        `/api/trips/${joinToken}/ai-suggest`,
        {
          group_size: groupSize,
          budget_min: trip.budget_min,
          budget_max: trip.budget_max,
          travel_from: trip.travel_from,
          travel_to: trip.travel_to,
          notes,
        },
        joinToken
      );
      setDestinations(res.destinations || []);
      // Small delay for the staggered animation to feel right, then complete
      setTimeout(() => {
        onTripUpdated();
        onComplete();
      }, 800);
    } catch (err: any) {
      if (err.message?.includes("503") || err.message?.includes("unavailable")) {
        setAiError("AI suggestions unavailable. Add destinations manually below.");
      } else {
        setAiError(err.message || "Something went wrong.");
      }
    } finally {
      setAiLoading(false);
    }
  };

  const handleSkipAI = () => {
    onTripUpdated();
    onComplete();
  };

  // Budget saved summary
  const budgetSaved = trip.budget_min !== null;
  // Dates saved summary
  const datesSaved = trip.travel_from !== null;

  return (
    <div className="mb-12 border-l-[3px] border-l-amber pl-6 md:pl-8">
      {/* Section 1 — Budget */}
      {setupStep === "budget" && !budgetSaved && (
        <section className="mb-8">
          <h2 className="font-display text-2xl font-bold text-t-primary mb-6">
            Set the budget range
          </h2>
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <label className="eyebrow block mb-2">MIN (₹)</label>
                <input
                  type="number"
                  value={budgetMin}
                  onChange={(e) => setBudgetMin(e.target.value)}
                  placeholder="5,000"
                  className="w-full h-11 px-3 bg-surface border border-b-mid rounded-[4px] text-t-primary font-mono text-sm focus:outline-none focus:border-t-secondary transition-colors"
                />
              </div>
              <span className="text-t-tertiary mt-6">—</span>
              <div className="flex-1">
                <label className="eyebrow block mb-2">MAX (₹)</label>
                <input
                  type="number"
                  value={budgetMax}
                  onChange={(e) => setBudgetMax(e.target.value)}
                  placeholder="15,000"
                  className="w-full h-11 px-3 bg-surface border border-b-mid rounded-[4px] text-t-primary font-mono text-sm focus:outline-none focus:border-t-secondary transition-colors"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {budgetPresets.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => {
                    setBudgetMin(String(preset.min));
                    setBudgetMax(String(preset.max));
                  }}
                  className="px-3 py-1.5 font-ui font-light text-xs border border-b-mid rounded-[4px] text-t-secondary hover:text-t-primary hover:border-b-strong transition-colors"
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <Button
              variant="amber"
              className="w-full h-11"
              disabled={!budgetMin || !budgetMax || saving}
              onClick={handleSaveBudget}
            >
              {saving ? "Saving..." : "Set budget →"}
            </Button>
          </div>
        </section>
      )}

      {/* Budget collapsed summary */}
      {budgetSaved && setupStep !== "budget" && (
        <p className="font-mono text-sm text-green mb-6">
          ₹{(trip.budget_min!).toLocaleString("en-IN")} – ₹{(trip.budget_max!).toLocaleString("en-IN")} per person  ✓
        </p>
      )}

      {/* Section 2 — Dates */}
      {setupStep === "dates" && !datesSaved && (
        <section className="mb-8">
          <h2 className="font-display text-2xl font-bold text-t-primary mb-6">
            When are you going?
          </h2>
          <div className="space-y-6">
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="eyebrow block mb-2">FROM</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full h-11 px-3 bg-surface border border-b-mid rounded-[4px] text-t-primary font-ui text-sm focus:outline-none focus:border-t-secondary transition-colors"
                />
              </div>
              <div className="flex-1">
                <label className="eyebrow block mb-2">TO</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full h-11 px-3 bg-surface border border-b-mid rounded-[4px] text-t-primary font-ui text-sm focus:outline-none focus:border-t-secondary transition-colors"
                />
              </div>
            </div>
            <div>
              <label className="eyebrow block mb-2">MEMBERS CONFIRM BY</label>
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
            <Button
              variant="amber"
              className="w-full h-11"
              disabled={!dateFrom || !dateTo || saving}
              onClick={handleSaveDates}
            >
              {saving ? "Saving..." : "Set dates →"}
            </Button>
          </div>
        </section>
      )}

      {/* Dates collapsed summary */}
      {datesSaved && setupStep !== "dates" && (
        <p className="font-mono text-sm text-green mb-6">
          {formatDate(trip.travel_from!)} – {formatDate(trip.travel_to!)}
          {trip.deadline && `  ·  Confirm by ${formatDate(trip.deadline)}`}  ✓
        </p>
      )}

      {/* Section 3 — AI Suggestions */}
      {setupStep === "ai" && (
        <section className="mb-8">
          <h2 className="font-display text-2xl font-bold text-t-primary mb-6">
            Get destination suggestions
          </h2>
          <div className="space-y-6">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="anything the group cares about? (no beach, needs to be family-friendly, budget conscious...)"
              className="w-full h-24 p-4 bg-transparent border border-b-mid rounded-[4px] text-t-primary font-ui text-sm placeholder:text-t-tertiary focus:outline-none focus:border-t-secondary transition-colors resize-none"
            />

            {!destinations && !aiLoading && !aiError && (
              <>
                <Button
                  variant="amber"
                  className="w-full h-[52px] font-display text-lg"
                  onClick={handleGetSuggestions}
                >
                  Get AI Suggestions
                </Button>
                <button
                  onClick={handleSkipAI}
                  className="block w-full text-center font-ui text-sm text-t-tertiary hover:text-t-secondary transition-colors"
                >
                  Skip — I'll add destinations manually
                </button>
              </>
            )}

            {aiLoading && (
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

            {aiError && (
              <div className="py-4">
                <p className="font-ui text-sm text-terra">{aiError}</p>
                <button
                  onClick={handleSkipAI}
                  className="mt-3 font-ui text-sm text-t-secondary hover:text-t-primary transition-colors underline"
                >
                  Continue without AI suggestions
                </button>
              </div>
            )}

            {destinations && (
              <div className="divide-y divide-b-subtle">
                {destinations.map((d, i) => (
                  <div
                    key={d.id || d.name}
                    className="animate-in fade-in"
                    style={{ animationDelay: `${i * 150}ms` }}
                  >
                    <DestinationCard
                      name={d.name}
                      tagline={d.tagline || ""}
                      votes={0}
                      pros={d.pros || []}
                      cons={d.cons || []}
                      bestFor={d.best_for || ""}
                      estCost={`₹${(d.estimated_cost_min || 0).toLocaleString("en-IN")} – ₹${(d.estimated_cost_max || 0).toLocaleString("en-IN")} pp`}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
};

export default OrganiserSetupPanel;
