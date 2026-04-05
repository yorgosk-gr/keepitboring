-- Add processing_error column to track why newsletter processing failed
ALTER TABLE public.newsletters
  ADD COLUMN IF NOT EXISTS processing_error TEXT DEFAULT NULL;

COMMENT ON COLUMN public.newsletters.processing_error IS 'Stores the error message when processing fails. NULL means no error.';
