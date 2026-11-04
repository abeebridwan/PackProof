-- Isolated reviewer access and one explicitly approved shared inference grant.
CREATE ROLE packproof_review NOLOGIN;
GRANT packproof_review TO postgres;
GRANT USAGE ON SCHEMA packproof TO packproof_review;
CREATE TABLE packproof.review_access(
 user_id uuid PRIMARY KEY REFERENCES auth.users(id), actor_id uuid NOT NULL REFERENCES packproof.actors(id),
 email text NOT NULL, role text NOT NULL CHECK(role IN ('buyer','seller')),pair_id uuid NOT NULL,
 invite_hash text NOT NULL UNIQUE CHECK(invite_hash ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz NOT NULL, revoked_at timestamptz
);
CREATE TABLE packproof.review_units(
 item_id uuid PRIMARY KEY REFERENCES packproof.items(id),pair_id uuid NOT NULL,
 product_mark text NOT NULL,packaging_mark text NOT NULL,seller_id uuid NOT NULL REFERENCES packproof.actors(id)
);
CREATE TABLE packproof.review_budget(
 id text PRIMARY KEY CHECK(id='review-live-2026-11-04'),limit_cents int NOT NULL CHECK(limit_cents=500),
 reserved_cents int NOT NULL DEFAULT 0 CHECK(reserved_cents BETWEEN 0 AND limit_cents),
 enabled boolean NOT NULL DEFAULT false,approval text NOT NULL,approved_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE packproof.review_calls(
 id uuid PRIMARY KEY,grant_id text NOT NULL REFERENCES packproof.review_budget(id),user_id uuid NOT NULL REFERENCES auth.users(id),
 operation_key text NOT NULL CHECK(length(operation_key)<=200),model text NOT NULL CHECK(model IN ('muse-spark-1.3','sam-3.1')),
 cents int NOT NULL CHECK(cents=CASE WHEN model='sam-3.1' THEN 1 ELSE 5 END),input_tokens int NOT NULL CHECK(input_tokens BETWEEN 0 AND 16000),retry boolean NOT NULL,
 state text NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','responded','failed','ambiguous')),
 response_id text,request_id text,usage jsonb,reserved_at timestamptz NOT NULL DEFAULT now(),settled_at timestamptz,
 UNIQUE(grant_id,operation_key)
);
CREATE INDEX review_calls_user_time ON packproof.review_calls(user_id,reserved_at);
CREATE TABLE packproof.review_login_limits(bucket timestamptz PRIMARY KEY,attempts int NOT NULL);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['review_access','review_units','review_budget','review_calls','review_login_limits'] LOOP
 EXECUTE format('ALTER TABLE packproof.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE packproof.%I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON packproof.%I FROM PUBLIC,anon,authenticated,service_role',t);
 EXECUTE format('CREATE POLICY review_backend ON packproof.%I TO packproof_review USING(true) WITH CHECK(true)',t);
END LOOP; END $$;
GRANT SELECT ON packproof.review_access,packproof.review_units,packproof.review_budget,packproof.review_calls TO packproof_review;
GRANT UPDATE(reserved_cents) ON packproof.review_budget TO packproof_review;
GRANT INSERT ON packproof.review_calls,packproof.review_login_limits TO packproof_review;
GRANT UPDATE(state,response_id,request_id,usage,settled_at) ON packproof.review_calls TO packproof_review;
GRANT SELECT,UPDATE ON packproof.review_login_limits TO packproof_review;
GRANT SELECT ON packproof.items,packproof.actors TO packproof_review;
CREATE POLICY review_item_read ON packproof.items FOR SELECT TO packproof_review USING(true);
CREATE POLICY review_actor_read ON packproof.actors FOR SELECT TO packproof_review USING(true);
