-- Extend the existing Inspector observation, not its authority or signing role.
ALTER TABLE packproof.inspection_observations DROP CONSTRAINT inspection_observations_question_check;
ALTER TABLE packproof.inspection_observations ADD CONSTRAINT inspection_observations_question_check CHECK(question IN ('product_mark','package_mark','printed_expiry','packaging_condition'));
