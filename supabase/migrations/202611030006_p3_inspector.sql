-- Capture metadata and observations are private append-only evidence, never issuer or owner records.
CREATE TABLE packproof.capture_details (
 capture_id uuid PRIMARY KEY REFERENCES packproof.captures(id),
 investigation_id uuid NOT NULL REFERENCES packproof.investigations(id),
 uploader_session_hash text NOT NULL CHECK(uploader_session_hash ~ '^[a-f0-9]{64}$'),
 details jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE packproof.inspection_observations (
 id uuid PRIMARY KEY, investigation_id uuid NOT NULL REFERENCES packproof.investigations(id),
 capture_id uuid NOT NULL REFERENCES packproof.captures(id),
 question text NOT NULL CHECK(question IN ('product_mark','package_mark','printed_expiry')),
 observation jsonb NOT NULL CHECK(octet_length(observation::text)<1500000),
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(capture_id,question)
);
CREATE INDEX inspection_by_investigation ON packproof.inspection_observations(investigation_id,created_at);
CREATE FUNCTION packproof.bind_inspection_capture() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE c packproof.captures%ROWTYPE; i packproof.investigations%ROWTYPE;
BEGIN
 SELECT * INTO c FROM packproof.captures WHERE id=NEW.capture_id AND investigation_id=NEW.investigation_id;
 SELECT * INTO i FROM packproof.investigations WHERE id=NEW.investigation_id;
 IF c.id IS NULL OR i.id IS NULL OR NOT (c.revision=i.revision OR (TG_TABLE_NAME='inspection_observations' AND c.revision=i.revision-1 AND i.input->>'captureId'=c.id::text)) THEN RAISE EXCEPTION 'capture_revision_mismatch'; END IF;
 IF TG_TABLE_NAME='capture_details' THEN
  IF NEW.uploader_session_hash IS DISTINCT FROM current_setting('packproof.session_hash',true) THEN RAISE EXCEPTION 'foreign_uploader'; END IF;
 ELSE
  IF NEW.observation->>'captureId' IS DISTINCT FROM c.id::text OR NEW.observation->>'investigationId' IS DISTINCT FROM i.id::text OR NEW.observation->>'sourceSha256' IS DISTINCT FROM c.sha256 OR NEW.observation->>'captureRevision' IS DISTINCT FROM c.revision::text OR NEW.observation->>'question' IS DISTINCT FROM NEW.question THEN RAISE EXCEPTION 'capture_binding_mismatch'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION packproof.bind_inspection_capture() FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['capture_details','inspection_observations'] LOOP
  EXECUTE format('ALTER TABLE packproof.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE packproof.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON packproof.%I FROM PUBLIC,anon,authenticated,service_role',t);
  EXECUTE format('GRANT SELECT,INSERT ON packproof.%I TO packproof_investigator',t);
  EXECUTE format('CREATE POLICY scoped_inspection ON packproof.%I FOR ALL TO packproof_investigator USING(EXISTS(SELECT 1 FROM packproof.investigations i WHERE i.id=investigation_id)) WITH CHECK(EXISTS(SELECT 1 FROM packproof.investigations i WHERE i.id=investigation_id))',t);
  EXECUTE format('CREATE TRIGGER bind_capture BEFORE INSERT ON packproof.%I FOR EACH ROW EXECUTE FUNCTION packproof.bind_inspection_capture()',t);
 END LOOP;
END $$;
