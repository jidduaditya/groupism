import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface BudgetPreferenceFormProps {
  joinToken: string;
  onSubmitted: () => void;
}

const ACCOMMODATION_OPTIONS = [
  { value: "budget", label: "Budget" },
  { value: "mid", label: "Mid-range" },
  { value: "premium", label: "Premium" },
];

const TRANSPORT_OPTIONS = [
  { value: "bus_train", label: "Bus / Train" },
  { value: "flight", label: "Fly" },
  { value: "self_drive", label: "Self-drive" },
];

const DINING_OPTIONS = [
  { value: "local_cheap", label: "Local dhabas" },
  { value: "mixed", label: "Mix" },
  { value: "restaurants", label: "Restaurants" },
];

const ACTIVITY_OPTIONS = [
  "Trekking",
  "Beach",
  "Nightlife",
  "Sightseeing",
  "Food tours",
  "Spa",
  "Adventure sports",
  "None specific",
];

const BudgetPreferenceForm = ({ joinToken, onSubmitted }: BudgetPreferenceFormProps) => {
  const [accommodation, setAccommodation] = useState("mid");
  const [transport, setTransport] = useState("bus_train");
  const [dining, setDining] = useState("mixed");
  const [activities, setActivities] = useState<string[]>([]);
  const [dailyMin, setDailyMin] = useState("");
  const [dailyMax, setDailyMax] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const toggleActivity = (activity: string) => {
    setActivities((prev) =>
      prev.includes(activity) ? prev.filter((a) => a !== activity) : [...prev, activity]
    );
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await api.post(
        `/api/trips/${joinToken}/budget/preferences`,
        {
          accommodation_tier: accommodation,
          transport_pref: transport,
          dining_style: dining,
          activities,
          daily_budget_min: dailyMin ? Number(dailyMin) : null,
          daily_budget_max: dailyMax ? Number(dailyMax) : null,
          notes: notes || null,
        },
        joinToken
      );
      setSubmitted(true);
      onSubmitted();
    } catch (err: any) {
      toast({ title: "Failed to save preferences", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <p className="font-ui text-sm text-green flex items-center gap-2 py-4">
        <span>✓</span> Your preferences saved
      </p>
    );
  }

  return (
    <div className="space-y-6 py-4">
      {/* Accommodation */}
      <div>
        <label className="font-ui text-xs text-t-tertiary uppercase tracking-wider mb-2 block">
          Accommodation
        </label>
        <div className="flex gap-2">
          {ACCOMMODATION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setAccommodation(opt.value)}
              className={cn(
                "h-[44px] px-4 rounded-[4px] font-ui text-sm transition-all",
                accommodation === opt.value
                  ? "bg-amber text-[#1c1a15] font-medium"
                  : "bg-elevated text-t-secondary hover:bg-hover"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Transport */}
      <div>
        <label className="font-ui text-xs text-t-tertiary uppercase tracking-wider mb-2 block">
          Transport
        </label>
        <div className="flex gap-2">
          {TRANSPORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTransport(opt.value)}
              className={cn(
                "h-[44px] px-4 rounded-[4px] font-ui text-sm transition-all",
                transport === opt.value
                  ? "bg-amber text-[#1c1a15] font-medium"
                  : "bg-elevated text-t-secondary hover:bg-hover"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Dining */}
      <div>
        <label className="font-ui text-xs text-t-tertiary uppercase tracking-wider mb-2 block">
          Food
        </label>
        <div className="flex gap-2">
          {DINING_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setDining(opt.value)}
              className={cn(
                "h-[44px] px-4 rounded-[4px] font-ui text-sm transition-all",
                dining === opt.value
                  ? "bg-amber text-[#1c1a15] font-medium"
                  : "bg-elevated text-t-secondary hover:bg-hover"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Activities */}
      <div>
        <label className="font-ui text-xs text-t-tertiary uppercase tracking-wider mb-2 block">
          Activities
        </label>
        <div className="flex flex-wrap gap-2">
          {ACTIVITY_OPTIONS.map((activity) => (
            <button
              key={activity}
              onClick={() => toggleActivity(activity)}
              className={cn(
                "h-[36px] px-3 rounded-full font-ui text-sm transition-all",
                activities.includes(activity)
                  ? "bg-amber text-[#1c1a15] font-medium"
                  : "bg-elevated text-t-secondary hover:bg-hover"
              )}
            >
              {activity}
            </button>
          ))}
        </div>
      </div>

      {/* Daily budget range */}
      <div>
        <label className="font-ui text-xs text-t-tertiary uppercase tracking-wider mb-2 block">
          Daily budget per person (₹)
        </label>
        <div className="flex gap-3 items-center">
          <input
            type="number"
            value={dailyMin}
            onChange={(e) => setDailyMin(e.target.value)}
            placeholder="Min"
            className="w-28 h-11 px-3 bg-surface border border-b-mid rounded-[4px] text-t-primary font-mono text-sm focus:outline-none focus:border-t-secondary transition-colors"
          />
          <span className="text-t-tertiary font-ui text-sm">–</span>
          <input
            type="number"
            value={dailyMax}
            onChange={(e) => setDailyMax(e.target.value)}
            placeholder="Max"
            className="w-28 h-11 px-3 bg-surface border border-b-mid rounded-[4px] text-t-primary font-mono text-sm focus:outline-none focus:border-t-secondary transition-colors"
          />
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="font-ui text-xs text-t-tertiary uppercase tracking-wider mb-2 block">
          Anything else?
        </label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional notes"
          className="w-full h-11 px-3 bg-surface border border-b-mid rounded-[4px] text-t-primary font-ui text-sm focus:outline-none focus:border-t-secondary transition-colors"
        />
      </div>

      <Button variant="amber" onClick={handleSubmit} disabled={submitting}>
        {submitting ? "Saving..." : "Save my preferences"}
      </Button>
    </div>
  );
};

export default BudgetPreferenceForm;
