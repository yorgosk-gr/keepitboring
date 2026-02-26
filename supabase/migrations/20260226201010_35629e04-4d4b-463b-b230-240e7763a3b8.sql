
-- Allow service_role to insert into newsletters (bypasses RLS by default, but let's add an explicit permissive policy)
CREATE POLICY "Service role can insert newsletters"
ON public.newsletters
FOR INSERT
TO service_role
WITH CHECK (true);
