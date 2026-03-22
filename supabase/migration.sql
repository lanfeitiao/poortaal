-- Poortaal: user_words and user_history tables
-- Run this in Supabase Dashboard → SQL Editor

-- user_words: stores per-user word stats and cached data
CREATE TABLE IF NOT EXISTS user_words (
  id serial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  word text NOT NULL,
  lookups integer DEFAULT 0,
  practices integer DEFAULT 0,
  reviews jsonb DEFAULT '[]'::jsonb,
  level integer DEFAULT 0,
  last_seen bigint,
  word_data jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, word)
);

ALTER TABLE user_words ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own words" ON user_words
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own words" ON user_words
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own words" ON user_words
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own words" ON user_words
  FOR DELETE USING (auth.uid() = user_id);

-- user_history: stores per-user lookup history
CREATE TABLE IF NOT EXISTS user_history (
  id serial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  word text NOT NULL,
  word_data jsonb,
  timestamp bigint,
  UNIQUE(user_id, word)
);

ALTER TABLE user_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own history" ON user_history
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own history" ON user_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own history" ON user_history
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own history" ON user_history
  FOR DELETE USING (auth.uid() = user_id);
