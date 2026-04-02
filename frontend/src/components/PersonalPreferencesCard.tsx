"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

interface PersonalPreferencesCardProps {
  joinToken: string;
  existingPrefs: {
    accommodation_tier?: string;
    transport_pref?: string;
    dining_style?: string;
    activities?: string[];
    daily_budget_min?: number;
    daily_budget_max?: number;
    notes?: string;
  } | null;
  onRefresh: () => void;
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

export default function PersonalPreferencesCard({
  joinToken,
  existingPrefs,
  onRefresh,
}: PersonalPreferencesCardProps) {
  const [accommodation, setAccommodation] = useState<string>(
    existingPrefs?.accommodation_tier ?? ""
  );
  const [transport, setTransport] = useState<string>(
    existingPrefs?.transport_pref ?? ""
  );
  const [dining, setDining] = useState<string>(
    existingPrefs?.dining_style ?? ""
  );
  const [activities, setActivities] = useState<string[]>(
    existingPrefs?.activities ?? []
  );
  const [dailyMin, setDailyMin] = useState<number | undefined>(
    existingPrefs?.daily_budget_min
  );
  const [dailyMax, setDailyMax] = useState<number | undefined>(
    existingPrefs?.daily_budget_max
  );
  const [notes, setNotes] = useState<string>(existingPrefs?.notes ?? "");
  const [savedVisible, setSavedVisible] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialMount = useRef(true);

  const toggleActivity = (activity: string) => {
    setActivities((prev) =>
      prev.includes(activity)
        ? prev.filter((a) => a !== activity)
        : [...prev, activity]
    );
  };

  const save = useCallback(async () => {
    const payload: Record<string, unknown> = {
      accommodation_tier: accommodation || undefined,
      transport_pref: transport || undefined,
      dining_style: dining || undefined,
      activities: activities.length > 0 ? activities : undefined,
      daily_budget_min: dailyMin,
      daily_budget_max: dailyMax,
      notes: notes || undefined,
    };

    try {
      await api.post(
        `/api/trips/${joinToken}/budget/preferences`,
        payload,
        joinToken
      );
      setSavedVisible(true);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSavedVisible(false), 2000);
      onRefresh();
    } catch {
      // silent fail — auto-save is best-effort
    }
  }, [
    accommodation,
    transport,
    dining,
    activities,
    dailyMin,
    dailyMax,
    notes,
    joinToken,
    onRefresh,
  ]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      save();
    }, 1000);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [accommodation, transport, dining, activities, dailyMin, dailyMax, notes, save]);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  const labelClass =
    "font-ui text-xs text-t-tertiary uppercase tracking-wider mb-2 block";

  const segmentedBtn = (
    selected: boolean
  ) =>
    cn(
      "h-[44px] px-4 rounded-[4px] text-sm transition-colors",
      selected
        ? "bg-amber text-[#1c1a15] font-medium"
        : "bg-elevated text-t-secondary hover:bg-hover"
    );

  const pillBtn = (selected: boolean) =>
    cn(
      "rounded-full h-[36px] px-3 text-sm transition-colors",
      selected
        ? "bg-amber text-[#1c1a15] font-medium"
        : "bg-elevated text-t-secondary hover:bg-hover"
    );

  return (
    <div className="rounded-[4px] border border-b-mid bg-surface p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-display text-2xl font-bold text-t-primary">
          Personal preferences
        </h2>
        {savedVisible && (
          <span className="font-ui text-xs text-green">Saved ✓</span>
        )}
      </div>
      <p className="font-ui font-light text-sm text-t-secondary mb-6">
        Tell us what you care about. This helps with planning.
      </p>

      {/* Accommodation */}
      <div className="mb-5">
        <label className={labelClass}>Accommodation</label>
        <div className="flex gap-2 flex-wrap">
          {ACCOMMODATION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={segmentedBtn(accommodation === opt.value)}
              onClick={() =>
                setAccommodation(accommodation === opt.value ? "" : opt.value)
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Getting around */}
      <div className="mb-5">
        <label className={labelClass}>Getting around</label>
        <div className="flex gap-2 flex-wrap">
          {TRANSPORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={segmentedBtn(transport === opt.value)}
              onClick={() => setTransport(transport === opt.value ? "" : opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Food */}
      <div className="mb-5">
        <label className={labelClass}>Food</label>
        <div className="flex gap-2 flex-wrap">
          {DINING_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={segmentedBtn(dining === opt.value)}
              onClick={() => setDining(dining === opt.value ? "" : opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Activities */}
      <div className="mb-5">
        <label className={labelClass}>Activities</label>
        <div className="flex gap-2 flex-wrap">
          {ACTIVITY_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              className={pillBtn(activities.includes(opt))}
              onClick={() => toggleActivity(opt)}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      {/* Daily budget range */}
      <div className="mb-5">
        <label className={labelClass}>Daily budget range</label>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <span className="font-mono text-sm text-t-secondary">₹</span>
            <input
              type="number"
              placeholder="Min"
              className="w-28 h-11 px-3 bg-surface border border-b-mid rounded-[4px] text-t-primary font-mono text-sm focus:outline-none focus:border-t-secondary transition-colors"
              value={dailyMin ?? ""}
              onChange={(e) =>
                setDailyMin(
                  e.target.value ? Number(e.target.value) : undefined
                )
              }
            />
          </div>
          <span className="text-t-tertiary text-sm">–</span>
          <div className="flex items-center gap-1">
            <span className="font-mono text-sm text-t-secondary">₹</span>
            <input
              type="number"
              placeholder="Max"
              className="w-28 h-11 px-3 bg-surface border border-b-mid rounded-[4px] text-t-primary font-mono text-sm focus:outline-none focus:border-t-secondary transition-colors"
              value={dailyMax ?? ""}
              onChange={(e) =>
                setDailyMax(
                  e.target.value ? Number(e.target.value) : undefined
                )
              }
            />
          </div>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className={labelClass}>Anything else?</label>
        <input
          type="text"
          placeholder="Optional notes..."
          className="w-full h-11 px-3 bg-surface border border-b-mid rounded-[4px] text-t-primary font-ui text-sm focus:outline-none focus:border-t-secondary transition-colors"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
    </div>
  );
}
