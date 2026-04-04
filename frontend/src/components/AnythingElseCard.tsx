"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

interface AnythingElseCardProps {
  joinToken: string;
  trip: {
    group_anything_else?: string | null;
  };
  onRefresh: () => void;
}

export default function AnythingElseCard({
  joinToken,
  trip,
  onRefresh,
}: AnythingElseCardProps) {
  const [text, setText] = useState<string>(trip.group_anything_else ?? "");
  const [isRecording, setIsRecording] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recognitionRef = useRef<any>(null);

  // Sync from props (Realtime updates)
  useEffect(() => {
    setText(trip.group_anything_else ?? "");
  }, [trip.group_anything_else]);

  const saveNotes = useCallback(
    async (value: string) => {
      try {
        await api.patch(
          `/api/trips/${joinToken}/notes`,
          { group_anything_else: value },
          joinToken
        );
      } catch {
        // silent fail
      }
    },
    [joinToken]
  );

  const handleChange = (value: string) => {
    setText(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      saveNotes(value);
    }, 1500);
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
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
      setText((prev) => {
        const updated = prev ? `${prev} ${transcript}` : transcript;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => saveNotes(updated), 1500);
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
    <div className="rounded-[4px] border border-b-mid bg-surface p-6">
      <h2 className="font-display text-2xl font-bold text-t-primary mb-1">
        Anything else?
      </h2>
      <p className="font-ui font-light text-sm text-t-secondary mb-4">
        Anything the group should know — dietary restrictions, accessibility
        needs, special occasions, hard no's?
      </p>

      <div className="relative">
        <textarea
          placeholder="e.g. Priya is vegetarian, it's Rahul's birthday..."
          className="w-full min-h-[80px] bg-surface border border-b-mid rounded-[4px] font-ui text-sm text-t-primary p-3 pr-12 resize-none focus:outline-none focus:border-accent-amber"
          value={text}
          onChange={(e) => handleChange(e.target.value)}
        />
        <button
          type="button"
          onClick={isRecording ? stopRecording : startRecording}
          aria-label={isRecording ? "Stop recording" : "Record voice note"}
          className={cn(
            "absolute right-3 bottom-3 flex items-center justify-center w-8 h-8 rounded-full text-xs transition-colors",
            isRecording
              ? "bg-terra/20 text-terra"
              : "bg-elevated text-t-secondary hover:bg-hover"
          )}
        >
          {isRecording ? (
            <span className="w-2 h-2 rounded-full bg-terra animate-pulse" />
          ) : (
            "\u{1F3A4}"
          )}
        </button>
      </div>
    </div>
  );
}
