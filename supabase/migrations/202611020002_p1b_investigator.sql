-- P1B: private investigation execution only. No ownership/claim write grants.
DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='packproof_investigator') THEN CREATE ROLE packproof_investigator NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; END IF; END $$;
GRANT packproof_investigator TO postgres;
GRANT USAGE ON SCHEMA packproof TO packproof_investigator;
ALTER TABLE packproof.investigations ALTER COLUMN owner_user_id DROP NOT NULL;
ALTER TABLE packproof.investigations ADD COLUMN session_hash text CHECK(session_hash ~ '^[a-f0-9]{64}$'), ADD COLUMN input jsonb, ADD COLUMN evidence_request jsonb, ADD COLUMN finding jsonb, ADD COLUMN error_code text, ADD COLUMN reserved_cents integer NOT NULL DEFAULT 0 CHECK(reserved_cents BETWEEN 0 AND 50), ADD COLUMN model_requests integer NOT NULL DEFAULT 0 CHECK(model_requests BETWEEN 0 AND 12);
ALTER TABLE packproof.investigations ADD CONSTRAINT investigation_has_owner CHECK(owner_user_id IS NOT NULL OR session_hash IS NOT NULL);
ALTER TABLE packproof.investigations DROP CONSTRAINT investigations_status_check;
ALTER TABLE packproof.investigations ADD CONSTRAINT investigations_status_check CHECK(status IN ('created','running','needs_input','complete','unavailable'));
CREATE INDEX investigation_session ON packproof.investigations(session_hash,id);
CREATE POLICY investigator_session ON packproof.investigations FOR ALL TO packproof_investigator USING(session_hash=current_setting('packproof.session_hash',true) AND (owner_user_id IS NULL OR owner_user_id::text=current_setting('packproof.user_id',true))) WITH CHECK(session_hash=current_setting('packproof.session_hash',true) AND (owner_user_id IS NULL OR owner_user_id::text=current_setting('packproof.user_id',true)) AND namespace='packproof-demo');
GRANT SELECT,INSERT,UPDATE ON packproof.investigations TO packproof_investigator;
CREATE TABLE packproof.investigation_operations (
 investigation_id uuid NOT NULL REFERENCES packproof.investigations(id), operation_key text NOT NULL CHECK(length(operation_key)<=200),
 argument_sha256 text NOT NULL CHECK(argument_sha256 ~ '^[a-f0-9]{64}$'), kind text NOT NULL CHECK(kind IN ('model','tool','retry','resume')),
 status text NOT NULL CHECK(status IN ('reserved','complete','failed')), result jsonb, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(investigation_id,operation_key)
);
CREATE TABLE packproof.captures (
 id uuid PRIMARY KEY,investigation_id uuid NOT NULL REFERENCES packproof.investigations(id),revision integer NOT NULL CHECK(revision>0),
 sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),mime text NOT NULL CHECK(mime IN ('image/jpeg','image/png')),
 width integer NOT NULL CHECK(width BETWEEN 1 AND 4096),height integer NOT NULL CHECK(height BETWEEN 1 AND 4096),bytes integer NOT NULL CHECK(bytes BETWEEN 1 AND 2097152),
 source text NOT NULL CHECK(source IN ('live-camera','imported')),captured_at timestamptz,uploaded_at timestamptz NOT NULL DEFAULT now(),object_path text NOT NULL UNIQUE
);
CREATE INDEX capture_investigation ON packproof.captures(investigation_id,revision);
CREATE TABLE packproof.request_limits (key_hash text NOT NULL CHECK(key_hash ~ '^[a-f0-9]{64}$'),window_start bigint NOT NULL,count integer NOT NULL CHECK(count>0),PRIMARY KEY(key_hash,window_start));
ALTER TABLE packproof.tool_events ADD COLUMN result_json jsonb, ADD COLUMN event_source text NOT NULL DEFAULT 'model_tool' CHECK(event_source IN ('model_tool','mandatory_finalizer'));
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['investigation_operations','captures'] LOOP
  EXECUTE format('ALTER TABLE packproof.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE packproof.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON packproof.%I FROM PUBLIC,anon,authenticated,service_role',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON packproof.%I TO packproof_investigator',t);
  EXECUTE format('CREATE POLICY scoped_session ON packproof.%I FOR ALL TO packproof_investigator USING(EXISTS(SELECT 1 FROM packproof.investigations i WHERE i.id=investigation_id)) WITH CHECK(EXISTS(SELECT 1 FROM packproof.investigations i WHERE i.id=investigation_id))',t);
 END LOOP;
END $$;
ALTER TABLE packproof.request_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE packproof.request_limits FORCE ROW LEVEL SECURITY;
REVOKE ALL ON packproof.request_limits FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON packproof.request_limits TO packproof_investigator;
CREATE POLICY backend_rate_counter ON packproof.request_limits FOR ALL TO packproof_investigator USING(true) WITH CHECK(true);
GRANT SELECT,INSERT ON packproof.tool_events TO packproof_investigator;
CREATE POLICY investigator_events ON packproof.tool_events FOR ALL TO packproof_investigator USING(EXISTS(SELECT 1 FROM packproof.investigations i WHERE i.id=investigation_id)) WITH CHECK(EXISTS(SELECT 1 FROM packproof.investigations i WHERE i.id=investigation_id));
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['actors','signed_records','issuer_bindings','directory_changes','items','marking_relations','notices','custody_history'] LOOP
  EXECUTE format('GRANT SELECT ON packproof.%I TO packproof_investigator',t);
  EXECUTE format('CREATE POLICY investigator_source_read ON packproof.%I FOR SELECT TO packproof_investigator USING(true)',t);
 END LOOP;
END $$;
-- Checkpoint tables are installed by the pinned official PostgresSaver.setup(), then hardened.
CREATE SCHEMA packproof_graph;
REVOKE ALL ON SCHEMA packproof_graph FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA packproof_graph TO packproof_investigator;
