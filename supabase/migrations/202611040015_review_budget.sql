-- Explicit operator approval: raise the existing shared allowance to $10 total.
-- The amount changes separately after compatible runtimes are deployed.
-- Existing calls, reservations, grants and privileges remain intact.
ALTER TABLE packproof.review_budget DROP CONSTRAINT review_budget_limit_cents_check;
ALTER TABLE packproof.review_budget ADD CONSTRAINT review_budget_limit_cents_check
 CHECK(limit_cents IN(500,1000));
