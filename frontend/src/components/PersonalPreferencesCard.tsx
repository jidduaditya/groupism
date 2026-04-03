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
    activity_categories?: string[];
    activity_details?: string;
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

const ACTIVITY_CATEGORIES = [
  { value: "chill", label: "Chill", emoji: "\u{1F305}" },
  { value: "shopping", label: "Shopping", emoji: "\u{1F6CD}\u{FE0F}" },
  { value: "experiences", label: "Experiences", emoji: "\u{1F3AD}" },
  { value: "exploration", label: "Exploration", emoji: "\u{1F9ED}" },
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
  const [activityCategories, setActivityCategories] = useState<string[]>(
    existingPrefs?.activity_categories ?? []
  );
  const [activityDetails, setActivityDetails] = useState<string>(
    existingPrefs?.activity_details ?? ""
  );
  const [notes, setNotes] = useState<string>(existingPrefs?.notes ?? "");
  const [savedVisible, setSavedVisible] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const detailDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialMount = useRef(true);
  const recognitionRef = useRef<any>(null);

  const toggleCategory = (cat: string) => {
    setActivityCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const save = useCallback(async () => {
    const payload: Record<string, unknown> = {
      accommodation_tier: accommodation || undefined,
      transport_pref: transport || undefined,
      dining_style: dining || undefined,
      activity_categories:
        activityCategories.length > 0 ? activityCategories : undefined,
      activity_details: activityDetails || undefined,
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
    activityCategories,
    activityDetails,
    notes,
    joinToken,
    onRefresh,
  ]);

  // 1s debounce for non-textarea fields
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
  }, [accommodation, transport, dining, activityCategories, notes, save]);

  // 1.5s debounce for detail textarea
  useEffect(() => {
    if (isInitialMount.current) return;

    if (detailDebounceRef.current) clearTimeout(detailDebounceRef.current);
    detailDebounceRef.current = setTimeout(() => {
      save();
    }, 1500);

    return () => {
      if (detailDebounceRef.current) clearTimeout(detailDebounceRef.current);
    };
  }, [activityDetails, save]);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      if (detailDebounceRef.current) clearTimeout(detailDebounceRef.current);
    };
  }, []);

  const startRecording = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setActivityDetails((prev) =>
        prev ? `${prev} ${transcript}` : transcript
      );
    };
    recognition.onend = () => setIsRecording(false);
    recognition.onerror = () => setIsRecording(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  };

  const stopRecording = () => {
    recognitionRef.current?.stop();
    setIsRecording(false);
  };

  const labelClass =
    "font-ui text-xs text-t-tertiary uppercase tracking-wider mb-2 block";

  const segmentedBtn = (selected: boolean) =>
    cn(
      "h-[44px] px-4 rounded-[4px] text-sm transition-colors",
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
              onClick={() =>
                setTransport(transport === opt.value ? "" : opt.value)
              }
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
              onClick={() =>
                setDining(dining === opt.value ? "" : opt.value)
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Activities — 4 category cards */}
      <div className="mb-5">
        <label className={labelClass}>What do you want to do?</label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {ACTIVITY_CATEGORIES.map((cat) => {
            const selected = activityCategories.includes(cat.value);
            return (
              <button
                key={cat.value}
                type="button"
                onClick={() => toggleCategory(cat.value)}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 h-[72px] rounded-[8px] transition-all",
                  selected
                    ? "border-2 border-amber bg-surface"
                    : "bg-elevated border border-b-mid"
                )}
              >
                <span className="text-xl">{cat.emoji}</span>
                <span
                  className={cn(
                    "font-ui text-sm",
                    selected ? "text-t-primary font-medium" : "text-t-secondary"
                  )}
                >
                  {cat.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Detail textarea — shown when any category is selected */}
        {activityCategories.length > 0 && (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <label className="font-ui text-xs text-t-tertiary">
                Tell us more
              </label>
              <button
                type="button"
                onClick={isRecording ? stopRecording : startRecording}
                className={cn(
                  "flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-ui transition-colors",
                  isRecording
                    ? "bg-terra/20 text-terra"
                    : "bg-elevated text-t-secondary hover:bg-hover"
                )}
              >
                {isRecording && (
                  <span className="w-2 h-2 rounded-full bg-terra animate-pulse" />
                )}
                <span>{isRecording ? "Stop" : "\u{1F3A4} Record"}</span>
              </button>
            </div>
            <textarea
              rows={3}
              placeholder="E.g. we love water sports, want a cooking class, or just want to chill by the pool..."
              className="w-full px-3 py-2 bg-surface border border-b-mid rounded-[4px] text-t-primary font-ui text-sm focus:outline-none focus:border-t-secondary transition-colors resize-none"
              value={activityDetails}
              onChange={(e) => setActivityDetails(e.target.value)}
            />
          </div>
        )}
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
