"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

const ACTIVITIES = [
  { value: "chill", label: "Chill" },
  { value: "shopping", label: "Shopping" },
  { value: "experiences", label: "Experiences" },
  { value: "exploration", label: "Exploration" },
];

interface WhatDoYouWantToDoCardProps {
  joinToken: string;
  existingPrefs: {
    activity_categories?: string[] | null;
    activity_notes?: string | null;
  } | null;
  onRefresh: () => void;
}

export default function WhatDoYouWantToDoCard({
  joinToken,
  existingPrefs,
  onRefresh,
}: WhatDoYouWantToDoCardProps) {
  const [categories, setCategories] = useState<string[]>(
    existingPrefs?.activity_categories ?? []
  );
  const [groupNotes, setGroupNotes] = useState<string>(
    existingPrefs?.activity_notes ?? ""
  );
  const [isRecording, setIsRecording] = useState(false);

  const categoryDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notesDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialMount = useRef(true);
  const recognitionRef = useRef<any>(null);

  // Sync from props
  useEffect(() => {
    setCategories(existingPrefs?.activity_categories ?? []);
  }, [existingPrefs?.activity_categories]);

  useEffect(() => {
    setGroupNotes(existingPrefs?.activity_notes ?? "");
  }, [existingPrefs?.activity_notes]);

  const toggleCategory = (cat: string) => {
    setCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  // Save categories (per-member)
  const saveCategories = useCallback(
    async (cats: string[]) => {
      try {
        await api.post(
          `/api/trips/${joinToken}/budget/preferences`,
          { activity_categories: cats.length > 0 ? cats : undefined },
          joinToken
        );
        onRefresh();
      } catch {
        // silent fail — auto-save
      }
    },
    [joinToken, onRefresh]
  );

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (categoryDebounceRef.current) clearTimeout(categoryDebounceRef.current);
    categoryDebounceRef.current = setTimeout(() => {
      saveCategories(categories);
    }, 1000);
    return () => {
      if (categoryDebounceRef.current) clearTimeout(categoryDebounceRef.current);
    };
  }, [categories, saveCategories]);

  // Save activity notes (per-member)
  const saveNotes = useCallback(
    async (text: string) => {
      try {
        await api.post(
          `/api/trips/${joinToken}/budget/preferences`,
          { activity_notes: text },
          joinToken
        );
        onRefresh();
      } catch {
        // silent fail
      }
    },
    [joinToken, onRefresh]
  );

  const handleNotesChange = (value: string) => {
    setGroupNotes(value);
    if (notesDebounceRef.current) clearTimeout(notesDebounceRef.current);
    notesDebounceRef.current = setTimeout(() => {
      saveNotes(value);
    }, 1500);
  };

  useEffect(() => {
    return () => {
      if (notesDebounceRef.current) clearTimeout(notesDebounceRef.current);
      if (categoryDebounceRef.current) clearTimeout(categoryDebounceRef.current);
    };
  }, []);

  // Voice recording
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
      setGroupNotes((prev) => {
        const updated = prev ? `${prev} ${transcript}` : transcript;
        // Trigger save after voice input
        if (notesDebounceRef.current) clearTimeout(notesDebounceRef.current);
        notesDebounceRef.current = setTimeout(() => saveNotes(updated), 1500);
        return updated;
      });
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

  return (
    <div className="rounded-[4px] border border-b-mid bg-surface p-6 min-h-[280px]">
      <h2 className="font-display text-2xl font-bold text-t-primary mb-1">
        What do you want to do?
      </h2>
      <p className="font-ui font-light text-sm text-t-secondary mb-5">
        Pick activities the group is into.
      </p>

      {/* Activity toggle buttons */}
      <div className="flex flex-wrap gap-2 mb-5">
        {ACTIVITIES.map((act) => {
          const selected = categories.includes(act.value);
          return (
            <button
              key={act.value}
              type="button"
              onClick={() => toggleCategory(act.value)}
              className={cn(
                "rounded-[4px] px-4 py-2 font-ui text-sm transition-all duration-150 active:scale-[0.95]",
                selected
                  ? "border border-accent-amber bg-accent-amber text-[var(--bg-base)] font-medium shadow-[0_0_12px_rgba(184,122,8,0.4)]"
                  : "border border-b-mid bg-elevated text-t-secondary"
              )}
            >
              {act.label}
            </button>
          );
        })}
      </div>

      {/* Tell us more — always visible */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="font-ui text-xs text-t-tertiary">
            Tell us more
          </label>
          <button
            type="button"
            onClick={isRecording ? stopRecording : startRecording}
            aria-label={isRecording ? "Stop recording" : "Record voice note"}
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
            <span>{isRecording ? "Stop" : "\u{1F3A4}"}</span>
          </button>
        </div>
        <textarea
          placeholder='e.g. "Love street food, hate crowds..."'
          className="w-full min-h-[80px] bg-surface border border-b-mid rounded-[4px] font-ui text-sm text-t-primary p-3 resize-none focus:outline-none focus:border-accent-amber"
          value={groupNotes}
          onChange={(e) => handleNotesChange(e.target.value)}
        />
      </div>
    </div>
  );
}
