-- Preserve existing hourly fees, including explicit negotiable (JSON null) amounts.
-- Other pricing records and all post content remain untouched.
UPDATE "Post"
SET "coaching" = ("coaching" - 'hourlyRate') || jsonb_build_object(
  'pricing', jsonb_build_object('type', 'HOURLY', 'amount', "coaching" -> 'hourlyRate')
)
WHERE jsonb_typeof("coaching") = 'object'
  AND "coaching" ? 'hourlyRate'
  AND NOT ("coaching" ? 'pricing');
