ALTER TABLE public.processed_links
  DROP CONSTRAINT IF EXISTS processed_links_platform_check;

ALTER TABLE public.processed_links
  ADD CONSTRAINT processed_links_platform_check
  CHECK (platform IN ('reddit', 'x', 'facebook', 'web'));
