ALTER TABLE "users"
  ADD CONSTRAINT "users_phone_international_format_check"
  CHECK ("phone" ~ '^\+[1-9][0-9]{7,14}$');

ALTER TABLE "deals"
  ADD CONSTRAINT "deals_amount_kobo_positive_check"
  CHECK ("amount_kobo" > 0);

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_kobo_positive_check"
  CHECK ("amount_kobo" > 0);

ALTER TABLE "ledger_entries"
  ADD CONSTRAINT "ledger_entries_amount_kobo_positive_check"
  CHECK ("amount_kobo" > 0);

CREATE FUNCTION "reject_ledger_entry_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Ledger entries are append-only';
END;
$$;

CREATE TRIGGER "ledger_entries_append_only"
BEFORE UPDATE OR DELETE ON "ledger_entries"
FOR EACH ROW
EXECUTE FUNCTION "reject_ledger_entry_mutation"();