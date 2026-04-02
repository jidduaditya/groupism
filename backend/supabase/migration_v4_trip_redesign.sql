-- V4 migration: Trip Room redesign — new columns on trips table
-- Run this in the Supabase SQL Editor

ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS group_size integer DEFAULT 4,
  ADD COLUMN IF NOT EXISTS selected_destination_id uuid REFERENCES destination_options(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS destination_summary jsonb;
