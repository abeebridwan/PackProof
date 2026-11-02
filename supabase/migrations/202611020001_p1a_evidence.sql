-- P1A only. Additive isolated-project migration; no transfer/device protocol.
CREATE SCHEMA packproof;
REVOKE ALL ON SCHEMA packproof FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA packproof TO authenticated, service_role;
CREATE TABLE packproof.schema_migrations(version text PRIMARY KEY, sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'), applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE packproof.actors (
 id uuid PRIMARY KEY, kind text NOT NULL CHECK(kind IN ('issuer','shop','reviewer')),
 public_label text NOT NULL CHECK(length(public_label) BETWEEN 1 AND 256), demo boolean NOT NULL CHECK(demo)
);
CREATE TABLE packproof.actor_accounts (
 actor_id uuid PRIMARY KEY REFERENCES packproof.actors(id), user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id)
);
CREATE TABLE packproof.signed_records (
 id uuid PRIMARY KEY, namespace text NOT NULL CHECK(namespace ~ '^[a-z][a-z0-9-]{0,63}$'),
 record_type text NOT NULL CHECK(record_type IN ('issuer_binding','directory_change','issuance','mapping','notice','custody','custody_snapshot','gap','correction','audit')),
 issuer_id uuid NOT NULL REFERENCES packproof.actors(id), key_id uuid NOT NULL,
 scope text NOT NULL CHECK(scope IN ('model','batch','unit','container')),
 issued_at timestamptz NOT NULL, received_at timestamptz NOT NULL CHECK(received_at >= issued_at),
 revision integer NOT NULL CHECK(revision > 0), visibility text NOT NULL CHECK(visibility IN ('public','restricted')),
 demo boolean NOT NULL CHECK(demo), jws text NOT NULL CHECK(length(jws) BETWEEN 16 AND 256000 AND jws ~ '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'),
 sha256 text NOT NULL UNIQUE CHECK(sha256 = encode(sha256(convert_to(jws,'UTF8')),'hex')),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND (payload->>'id')::uuid=id AND payload->>'namespace'=namespace AND payload->>'type'=record_type AND (payload->>'issuerId')::uuid=issuer_id AND (payload->>'keyId')::uuid=key_id AND payload->>'scope'=scope AND (payload->>'demo')::boolean=true)
);
CREATE INDEX signed_records_namespace_type ON packproof.signed_records(namespace,record_type,issued_at);
CREATE INDEX signed_records_subjects ON packproof.signed_records USING gin ((payload->'subjectIds'));
CREATE TABLE packproof.issuer_bindings (
 record_id uuid PRIMARY KEY REFERENCES packproof.signed_records(id), issuer_id uuid NOT NULL REFERENCES packproof.actors(id),
 key_id uuid NOT NULL, public_jwk jsonb NOT NULL CHECK(public_jwk->>'kty'='EC' AND public_jwk->>'crv'='P-256' AND NOT(public_jwk ? 'd')),
 namespaces text[] NOT NULL CHECK(cardinality(namespaces)>0), record_types text[] NOT NULL CHECK(cardinality(record_types)>0),
 valid_from timestamptz NOT NULL, valid_until timestamptz NOT NULL CHECK(valid_until>valid_from), revoked_at timestamptz
);
CREATE INDEX issuer_binding_keys ON packproof.issuer_bindings(key_id);
CREATE TABLE packproof.directory_changes (
 record_id uuid PRIMARY KEY REFERENCES packproof.signed_records(id), namespace text NOT NULL,
 version integer NOT NULL CHECK(version>0), binding_record_id uuid NOT NULL UNIQUE REFERENCES packproof.issuer_bindings(record_id),
 previous_directory_hash text, UNIQUE(namespace,version)
);
CREATE TABLE packproof.items (
 id uuid PRIMARY KEY, namespace text NOT NULL, unit_mark text NOT NULL, model_code text NOT NULL, batch_code text NOT NULL,
 issuance_record_id uuid NOT NULL UNIQUE REFERENCES packproof.signed_records(id), mapping_record_id uuid NOT NULL UNIQUE REFERENCES packproof.signed_records(id),
 owner_record_id uuid NOT NULL REFERENCES packproof.signed_records(id), registered_owner_id uuid NOT NULL REFERENCES packproof.actors(id),
 owner_version integer NOT NULL CHECK(owner_version>0), lifecycle text NOT NULL CHECK(lifecycle='issued'), UNIQUE(namespace,unit_mark)
);
CREATE TABLE packproof.marking_relations (
 record_id uuid PRIMARY KEY REFERENCES packproof.signed_records(id), item_id uuid NOT NULL UNIQUE REFERENCES packproof.items(id),
 namespace text NOT NULL, product_mark text NOT NULL, packaging_mark text NOT NULL, carton_mark text,
 product_scope text NOT NULL DEFAULT 'unit' CHECK(product_scope='unit'), packaging_scope text NOT NULL DEFAULT 'unit' CHECK(packaging_scope='unit'),
 container_scope text NOT NULL DEFAULT 'container' CHECK(container_scope='container'), CHECK(product_mark<>packaging_mark),
 UNIQUE(namespace,product_mark), UNIQUE(namespace,packaging_mark)
);
CREATE INDEX shared_carton_lookup ON packproof.marking_relations(namespace,carton_mark);
CREATE TABLE packproof.notices (
 record_id uuid PRIMARY KEY REFERENCES packproof.signed_records(id), namespace text NOT NULL, model_code text NOT NULL,
 batch_codes text[] NOT NULL, effective_from timestamptz NOT NULL, effective_until timestamptz NOT NULL CHECK(effective_until>effective_from)
);
CREATE TABLE packproof.custody_history (
 record_id uuid PRIMARY KEY REFERENCES packproof.signed_records(id), item_id uuid NOT NULL REFERENCES packproof.items(id),
 kind text NOT NULL CHECK(kind IN ('custody','custody_snapshot','gap'))
);
CREATE INDEX custody_item ON packproof.custody_history(item_id);
CREATE TABLE packproof.investigations (
 id uuid PRIMARY KEY, owner_user_id uuid NOT NULL REFERENCES auth.users(id), namespace text NOT NULL,
 status text NOT NULL DEFAULT 'created' CHECK(status IN ('created','needs_input','complete','unavailable')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0), actions integer NOT NULL DEFAULT 0 CHECK(actions BETWEEN 0 AND 8),
 recaptures integer NOT NULL DEFAULT 0 CHECK(recaptures BETWEEN 0 AND 3), retries integer NOT NULL DEFAULT 0 CHECK(retries BETWEEN 0 AND 2),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX investigation_owner ON packproof.investigations(owner_user_id,id);
CREATE TABLE packproof.tool_events (
 id uuid PRIMARY KEY, investigation_id uuid NOT NULL REFERENCES packproof.investigations(id),
 tool_name text NOT NULL CHECK(tool_name IN ('lookup_product','lookup_seller','get_product_notices','get_custody_history','inspect_product_image','request_additional_evidence')),
 operation_key text NOT NULL, argument_sha256 text NOT NULL CHECK(argument_sha256 ~ '^[a-f0-9]{64}$'),
 record_ids uuid[] NOT NULL, status text NOT NULL CHECK(status IN ('supported','blocked','needs_evidence','unavailable','stale')),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(investigation_id,operation_key)
);
-- A deliberately small read projection. No account, owner, device, media or location fields.
CREATE TABLE public.pp_public_products (
 item_id uuid PRIMARY KEY REFERENCES packproof.items(id), namespace text NOT NULL, unit_mark text NOT NULL,
 packaging_mark text NOT NULL, model_code text NOT NULL, batch_code text NOT NULL, carton_mark text,
 issuance_record_id uuid NOT NULL REFERENCES packproof.signed_records(id), mapping_record_id uuid NOT NULL REFERENCES packproof.signed_records(id),
 demo boolean NOT NULL CHECK(demo), label text NOT NULL CHECK(label='Fictional PackProof demonstration data'), UNIQUE(namespace,unit_mark)
);
CREATE FUNCTION packproof.reject_claim_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'Signed claims and directory audit history are immutable' USING ERRCODE='42501'; END $$;
REVOKE ALL ON FUNCTION packproof.reject_claim_mutation() FROM PUBLIC, anon, authenticated, service_role;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['signed_records','issuer_bindings','directory_changes','custody_history'] LOOP
  EXECUTE format('CREATE TRIGGER immutable_claim BEFORE UPDATE OR DELETE OR TRUNCATE ON packproof.%I FOR EACH STATEMENT EXECUTE FUNCTION packproof.reject_claim_mutation()', t);
 END LOOP;
END $$;
DO $$ DECLARE t record; BEGIN
 FOR t IN SELECT schemaname,tablename FROM pg_tables WHERE schemaname='packproof' OR (schemaname='public' AND tablename='pp_public_products') LOOP
  EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',t.schemaname,t.tablename);
  EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY',t.schemaname,t.tablename);
  EXECUTE format('REVOKE ALL ON %I.%I FROM PUBLIC,anon,authenticated,service_role',t.schemaname,t.tablename);
 END LOOP;
END $$;
-- The serving backend can read source data, but has no claim or projection write grant.
GRANT SELECT ON packproof.actors,packproof.signed_records,packproof.issuer_bindings,packproof.directory_changes,packproof.items,packproof.marking_relations,packproof.notices,packproof.custody_history,packproof.investigations,packproof.tool_events TO service_role;
GRANT SELECT ON public.pp_public_products TO anon,authenticated,service_role;
CREATE POLICY public_demo_read ON public.pp_public_products FOR SELECT TO anon,authenticated USING (demo=true AND namespace='packproof-demo');
GRANT SELECT ON packproof.investigations,packproof.tool_events TO authenticated;
-- Clients may create only their own empty investigation, not counters/status/tool results.
GRANT INSERT(id,owner_user_id,namespace) ON packproof.investigations TO authenticated;
CREATE POLICY investigation_read ON packproof.investigations FOR SELECT TO authenticated USING(owner_user_id=(SELECT auth.uid()));
CREATE POLICY investigation_create ON packproof.investigations FOR INSERT TO authenticated WITH CHECK(owner_user_id=(SELECT auth.uid()) AND namespace='packproof-demo');
CREATE POLICY tool_event_read ON packproof.tool_events FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM packproof.investigations i WHERE i.id=investigation_id AND i.owner_user_id=(SELECT auth.uid())));
-- No transfer RPC, enrollment table, AI loop or offline package is introduced here.
