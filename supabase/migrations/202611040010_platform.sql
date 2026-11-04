-- Additive account/evidence layer. No existing identity, grant, device or owner is rewritten.
CREATE ROLE packproof_platform NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
GRANT packproof_platform TO postgres;
GRANT USAGE ON SCHEMA packproof TO packproof_platform;
CREATE FUNCTION packproof.platform_user() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('packproof.user_id',true),'')::uuid $$;
CREATE FUNCTION packproof.platform_actor() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('packproof.actor_id',true),'')::uuid $$;
REVOKE ALL ON FUNCTION packproof.platform_user(),packproof.platform_actor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION packproof.platform_user(),packproof.platform_actor() TO packproof_platform;
CREATE TABLE packproof.account_profiles(user_id uuid PRIMARY KEY REFERENCES auth.users(id),actor_id uuid NOT NULL UNIQUE REFERENCES packproof.actors(id),account_type text NOT NULL CHECK(account_type IN ('manufacturer','regular')),display_name text NOT NULL CHECK(length(display_name) BETWEEN 2 AND 100),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE packproof.product_drafts(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id),actor_id uuid NOT NULL REFERENCES packproof.actors(id),data jsonb NOT NULL CHECK(octet_length(data::text)<8192),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE packproof.handover_evidence(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id),actor_id uuid NOT NULL REFERENCES packproof.actors(id),capture_id uuid NOT NULL REFERENCES packproof.captures(id),investigation_id uuid NOT NULL REFERENCES packproof.investigations(id),revision integer NOT NULL,source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),draft_id uuid REFERENCES packproof.product_drafts(id),transfer_id uuid REFERENCES packproof.transfer_sessions(id),side text NOT NULL CHECK(side IN ('origin','dispatch','arrival')),seller_actor_id uuid REFERENCES packproof.actors(id),buyer_actor_id uuid REFERENCES packproof.actors(id),condition_note text NOT NULL CHECK(length(condition_note)<=1000),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(capture_id,draft_id),UNIQUE(capture_id,transfer_id),CHECK((side='origin' AND draft_id IS NOT NULL AND transfer_id IS NULL) OR (side IN ('dispatch','arrival') AND transfer_id IS NOT NULL AND draft_id IS NULL)));
CREATE TABLE packproof.dual_comparisons(id uuid PRIMARY KEY,transfer_id uuid NOT NULL REFERENCES packproof.transfer_sessions(id),seller_actor_id uuid NOT NULL,buyer_actor_id uuid NOT NULL,result jsonb NOT NULL CHECK(octet_length(result::text)<64000),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE packproof.developer_keys(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id),label text NOT NULL CHECK(length(label) BETWEEN 1 AND 80),token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'),scopes text[] NOT NULL CHECK(cardinality(scopes) BETWEEN 1 AND 6 AND scopes<@ARRAY['evidence:read','investigation:read','investigation:write','transfer:read','transfer:propose','pack:read']),expires_at timestamptz NOT NULL,revoked_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE packproof.platform_limits(bucket timestamptz NOT NULL,subject text NOT NULL,count integer NOT NULL,PRIMARY KEY(bucket,subject));
CREATE FUNCTION packproof.bind_platform_evidence() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE i packproof.investigations%ROWTYPE;c packproof.captures%ROWTYPE;t packproof.transfer_sessions%ROWTYPE;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM packproof.actor_accounts WHERE user_id=NEW.user_id AND actor_id=NEW.actor_id) OR NEW.user_id IS DISTINCT FROM packproof.platform_user() OR NEW.actor_id IS DISTINCT FROM packproof.platform_actor() THEN RAISE EXCEPTION 'foreign_identity'; END IF;
 SELECT * INTO c FROM packproof.captures WHERE id=NEW.capture_id;
 SELECT * INTO i FROM packproof.investigations WHERE id=c.investigation_id;
 IF c.id IS NULL OR i.owner_user_id IS DISTINCT FROM NEW.user_id OR i.session_hash IS DISTINCT FROM current_setting('packproof.session_hash',true) OR c.investigation_id IS DISTINCT FROM NEW.investigation_id OR c.sha256 IS DISTINCT FROM NEW.source_sha256 OR c.revision IS DISTINCT FROM NEW.revision THEN RAISE EXCEPTION 'foreign_or_mismatched_capture'; END IF;
 IF NEW.side='origin' THEN
  IF NOT EXISTS(SELECT 1 FROM packproof.product_drafts d WHERE d.id=NEW.draft_id AND d.user_id=NEW.user_id) THEN RAISE EXCEPTION 'foreign_draft'; END IF;
  NEW.seller_actor_id:=NULL;NEW.buyer_actor_id:=NULL;
 ELSE
  SELECT * INTO t FROM packproof.transfer_sessions WHERE id=NEW.transfer_id;
  IF t.id IS NULL OR (NEW.side='dispatch' AND t.seller_actor_id IS DISTINCT FROM NEW.actor_id) OR (NEW.side='arrival' AND t.buyer_actor_id IS DISTINCT FROM NEW.actor_id) THEN RAISE EXCEPTION 'wrong_handover_participant'; END IF;
  NEW.seller_actor_id:=t.seller_actor_id;NEW.buyer_actor_id:=t.buyer_actor_id;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION packproof.bind_platform_evidence() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER bind_platform_evidence BEFORE INSERT ON packproof.handover_evidence FOR EACH ROW EXECUTE FUNCTION packproof.bind_platform_evidence();
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['account_profiles','product_drafts','handover_evidence','dual_comparisons','developer_keys','platform_limits'] LOOP
 EXECUTE format('ALTER TABLE packproof.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE packproof.%I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON packproof.%I FROM PUBLIC,anon,authenticated,service_role',t);
END LOOP; END $$;
CREATE POLICY own_profile ON packproof.account_profiles TO packproof_platform USING(user_id=packproof.platform_user()) WITH CHECK(user_id=packproof.platform_user() AND actor_id=packproof.platform_actor());
CREATE POLICY own_draft ON packproof.product_drafts TO packproof_platform USING(user_id=packproof.platform_user()) WITH CHECK(user_id=packproof.platform_user() AND actor_id=packproof.platform_actor() AND EXISTS(SELECT 1 FROM packproof.account_profiles p WHERE p.user_id=packproof.platform_user() AND p.account_type='manufacturer'));
CREATE POLICY read_link ON packproof.handover_evidence FOR SELECT TO packproof_platform USING(user_id=packproof.platform_user() OR packproof.platform_actor() IN(seller_actor_id,buyer_actor_id));
CREATE POLICY write_link ON packproof.handover_evidence FOR INSERT TO packproof_platform WITH CHECK(user_id=packproof.platform_user() AND actor_id=packproof.platform_actor());
CREATE POLICY participant_comparison ON packproof.dual_comparisons TO packproof_platform USING(packproof.platform_actor() IN(seller_actor_id,buyer_actor_id)) WITH CHECK(EXISTS(SELECT 1 FROM packproof.transfer_sessions t WHERE t.id=transfer_id AND t.seller_actor_id=dual_comparisons.seller_actor_id AND t.buyer_actor_id=dual_comparisons.buyer_actor_id AND packproof.platform_actor() IN(t.seller_actor_id,t.buyer_actor_id)));
CREATE POLICY own_developer_key ON packproof.developer_keys TO packproof_platform USING(user_id=packproof.platform_user()) WITH CHECK(user_id=packproof.platform_user());
CREATE POLICY backend_platform_limit ON packproof.platform_limits TO packproof_platform USING(true) WITH CHECK(true);
GRANT SELECT,INSERT ON packproof.account_profiles,packproof.product_drafts,packproof.handover_evidence,packproof.dual_comparisons,packproof.developer_keys TO packproof_platform;
GRANT UPDATE(account_type,display_name) ON packproof.account_profiles TO packproof_platform;
GRANT UPDATE(revoked_at) ON packproof.developer_keys TO packproof_platform;
GRANT SELECT,INSERT,UPDATE ON packproof.platform_limits TO packproof_platform;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['actors','items','signed_records','marking_relations'] LOOP
 EXECUTE format('GRANT SELECT ON packproof.%I TO packproof_platform',t);
 EXECUTE format('CREATE POLICY platform_source_read ON packproof.%I FOR SELECT TO packproof_platform USING(true)',t);
END LOOP; END $$;
GRANT SELECT ON packproof.transfer_sessions TO packproof_platform;
CREATE POLICY platform_participant_session ON packproof.transfer_sessions FOR SELECT TO packproof_platform USING(packproof.platform_actor() IN(seller_actor_id,buyer_actor_id));
GRANT SELECT ON packproof.investigations,packproof.captures,packproof.inspection_observations TO packproof_platform;
CREATE POLICY platform_own_investigation ON packproof.investigations FOR SELECT TO packproof_platform USING(owner_user_id=packproof.platform_user() AND session_hash=current_setting('packproof.session_hash',true));
CREATE POLICY platform_linked_capture ON packproof.captures FOR SELECT TO packproof_platform USING(EXISTS(SELECT 1 FROM packproof.handover_evidence e WHERE e.capture_id=captures.id));
CREATE POLICY platform_linked_observation ON packproof.inspection_observations FOR SELECT TO packproof_platform USING(EXISTS(SELECT 1 FROM packproof.handover_evidence e WHERE e.capture_id=inspection_observations.capture_id));
-- Hash lookup alone is permitted to the server. No raw developer key is stored.
CREATE FUNCTION packproof.resolve_developer_key(p_hash text) RETURNS TABLE(user_id uuid,scopes text[],key_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT user_id,scopes,id FROM packproof.developer_keys WHERE token_hash=p_hash AND revoked_at IS NULL AND expires_at>now() $$;
REVOKE ALL ON FUNCTION packproof.resolve_developer_key(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION packproof.resolve_developer_key(text) TO packproof_platform;
