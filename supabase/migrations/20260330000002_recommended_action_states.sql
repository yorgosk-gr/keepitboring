-- Persist completed/dismissed state for recommended actions from portfolio analysis
CREATE TABLE IF NOT EXISTS public.recommended_action_states (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  analysis_id UUID NOT NULL,
  action_index INTEGER NOT NULL,
  action_text TEXT NOT NULL,
  completed BOOLEAN DEFAULT false,
  dismissed BOOLEAN DEFAULT false,
  dismiss_reason TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(analysis_id, action_index)
);

ALTER TABLE public.recommended_action_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own action states"
ON public.recommended_action_states
FOR ALL USING (auth.uid() = user_id);
