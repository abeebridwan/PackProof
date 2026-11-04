-- Public pack artifacts are append-only; source ownership and receipts remain untouched.
DO $$ BEGIN CREATE ROLE packproof_pack NOLOGIN NOINHERIT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT packproof_pack TO postgres;
GRANT USAGE ON SCHEMA packproof TO packproof_pack;
CREATE TABLE packproof.offline_directories(version bigint PRIMARY KEY CHECK(version>0),jws text NOT NULL,sha256 text NOT NULL UNIQUE CHECK(sha256=encode(sha256(convert_to(jws,'UTF8')),'hex')),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE packproof.pack_sequences(scope_key text PRIMARY KEY CHECK(length(scope_key)<=256),sequence bigint NOT NULL CHECK(sequence>0));
CREATE TABLE packproof.offline_exports(id uuid PRIMARY KEY,scope_key text NOT NULL,sequence bigint NOT NULL,manifest_jws text NOT NULL,sha256 text NOT NULL CHECK(sha256=encode(sha256(convert_to(manifest_jws,'UTF8')),'hex')),bytes integer NOT NULL CHECK(bytes>0 AND bytes<=2097152),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(scope_key,sequence));
CREATE TABLE packproof.public_offline_snapshots(id uuid PRIMARY KEY,item_id uuid NOT NULL REFERENCES packproof.items,owner_version integer NOT NULL CHECK(owner_version>0),jws text NOT NULL,sha256 text NOT NULL CHECK(sha256=encode(sha256(convert_to(jws,'UTF8')),'hex')),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE packproof.pack_export_limits(user_id uuid NOT NULL,bucket timestamptz NOT NULL,requests integer NOT NULL CHECK(requests>0),PRIMARY KEY(user_id,bucket));
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['offline_directories','offline_exports','public_offline_snapshots'] LOOP
 EXECUTE format('CREATE TRIGGER immutable_offline BEFORE UPDATE OR DELETE OR TRUNCATE ON packproof.%I FOR EACH STATEMENT EXECUTE FUNCTION packproof.reject_claim_mutation()',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['offline_directories','pack_sequences','offline_exports','public_offline_snapshots','pack_export_limits'] LOOP
 EXECUTE format('ALTER TABLE packproof.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE packproof.%I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON packproof.%I FROM PUBLIC,anon,authenticated,service_role',t);
 EXECUTE format('GRANT SELECT ON packproof.%I TO packproof_pack',t);
 EXECUTE format('CREATE POLICY offline_server_read ON packproof.%I FOR SELECT TO packproof_pack USING(true)',t);
 END LOOP;
END $$;
GRANT INSERT ON packproof.offline_exports,packproof.public_offline_snapshots TO packproof_pack;
CREATE POLICY offline_export_insert ON packproof.offline_exports FOR INSERT TO packproof_pack WITH CHECK(true);
CREATE POLICY offline_snapshot_insert ON packproof.public_offline_snapshots FOR INSERT TO packproof_pack WITH CHECK(true);
GRANT INSERT,UPDATE ON packproof.pack_sequences,packproof.pack_export_limits TO packproof_pack;
CREATE POLICY sequence_insert ON packproof.pack_sequences FOR INSERT TO packproof_pack WITH CHECK(true);
CREATE POLICY sequence_update ON packproof.pack_sequences FOR UPDATE TO packproof_pack USING(true) WITH CHECK(true);
CREATE POLICY limit_insert ON packproof.pack_export_limits FOR INSERT TO packproof_pack WITH CHECK(true);
CREATE POLICY limit_update ON packproof.pack_export_limits FOR UPDATE TO packproof_pack USING(true) WITH CHECK(true);
-- Private receipt reads are server-only inputs for validating the public owner projection.
-- No app role can assume packproof_pack; it cannot write source evidence or ownership.
GRANT SELECT ON packproof.actors,packproof.items,packproof.signed_records TO packproof_pack;
CREATE POLICY pack_source_actors ON packproof.actors FOR SELECT TO packproof_pack USING(demo);
CREATE POLICY pack_source_items ON packproof.items FOR SELECT TO packproof_pack USING(namespace='packproof-demo');
CREATE POLICY pack_source_records ON packproof.signed_records FOR SELECT TO packproof_pack USING(namespace='packproof-demo');
