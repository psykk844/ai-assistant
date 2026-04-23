-- User preferences table for AI classification feedback loop
-- Records user corrections to AI classifications so future prompts
-- can include learned preferences.

CREATE TABLE IF NOT EXISTS user_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  preference_type TEXT NOT NULL,  -- 'type_override' | 'lane_preference'
  pattern TEXT NOT NULL,          -- content snippet that triggered the correction
  from_value TEXT NOT NULL,       -- what the AI originally classified as
  to_value TEXT NOT NULL,         -- what the user corrected it to
  frequency INTEGER NOT NULL DEFAULT 1,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookup by user during classification
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id
  ON user_preferences(user_id);

-- Index for preference retrieval query (user + recency)
CREATE INDEX IF NOT EXISTS idx_user_preferences_lookup
  ON user_preferences(user_id, last_seen DESC);

-- RLS: users can only see their own preferences
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own preferences"
  ON user_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own preferences"
  ON user_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences"
  ON user_preferences FOR UPDATE
  USING (auth.uid() = user_id);
