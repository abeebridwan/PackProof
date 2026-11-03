-- P2: authenticated device keys, private two-way handovers and durable receipt outbox.
-- Only the Node transfer service can assume this NOLOGIN role; no public commit RPC.
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='packproof_transfer') THEN CREATE ROLE packproof_transfer NOLOGIN NOINHERIT; END IF; END $$;
GRANT packproof_transfer TO postgres;
GRANT USAGE ON SCHEMA packproof TO packproof_transfer;
ALTER TABLE packproof.actors DROP CONSTRAINT actors_kind_check;
ALTER TABLE packproof.actors ADD CONSTRAINT actors_kind_check CHECK(kind IN ('issuer','shop','reviewer','consumer'));
ALTER TABLE packproof.signed_records DROP CONSTRAINT signed_records_record_type_check;
ALTER TABLE packproof.signed_records ADD CONSTRAINT signed_records_record_type_check CHECK(record_type IN ('issuer_binding','directory_change','issuance','mapping','notice','custody','custody_snapshot','gap','correction','audit','delegation','transfer_receipt'));
ALTER TABLE packproof.items DROP CONSTRAINT items_lifecycle_check;
ALTER TABLE packproof.items ADD CONSTRAINT items_lifecycle_check CHECK(lifecycle IN ('issued','transferred','opened','consumed','returned','retired','stolen'));
CREATE TABLE packproof.transfer_policies(version text PRIMARY KEY,active boolean NOT NULL,session_seconds integer NOT NULL CHECK(session_seconds=120),consent_seconds integer NOT NULL CHECK(consent_seconds=30));
INSERT INTO packproof.transfer_policies VALUES('chainproof-online-1',true,120,30);
CREATE TABLE packproof.device_keys(
 id uuid PRIMARY KEY,actor_id uuid NOT NULL REFERENCES packproof.actors,user_id uuid NOT NULL REFERENCES auth.users,
 public_jwk jsonb NOT NULL CHECK(public_jwk->>'kty'='EC' AND public_jwk->>'crv'='P-256' AND NOT public_jwk ? 'd'),
 jwk_sha256 text NOT NULL UNIQUE CHECK(jwk_sha256 ~ '^[a-f0-9]{64}$'),status text NOT NULL CHECK(status IN ('active','revoked')),
 role text NOT NULL CHECK(role='participant'),created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,revoked_at timestamptz,
 CHECK(expires_at>created_at),CHECK((status='revoked')=(revoked_at IS NOT NULL))
);
CREATE UNIQUE INDEX one_active_device ON packproof.device_keys(actor_id) WHERE status='active';
CREATE TABLE packproof.enrollment_challenges(id uuid PRIMARY KEY,actor_id uuid NOT NULL REFERENCES packproof.actors,user_id uuid NOT NULL REFERENCES auth.users,key_id uuid NOT NULL UNIQUE,payload text NOT NULL,expires_at timestamptz NOT NULL,consumed_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX enrollment_actor_expiry ON packproof.enrollment_challenges(actor_id,expires_at);
-- Additional signed, restricted present-state snapshots. Original P1 public snapshots stay intact.
CREATE TABLE packproof.transfer_authority_snapshots(id uuid PRIMARY KEY,item_id uuid NOT NULL REFERENCES packproof.items,owner_version integer NOT NULL CHECK(owner_version>0),jws text NOT NULL,sha256 text NOT NULL UNIQUE CHECK(sha256=encode(sha256(convert_to(jws,'UTF8')),'hex')),payload jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),CHECK(payload->>'type'='custody_snapshot' AND (payload->'data'->>'itemId')::uuid=item_id AND payload->>'visibility'='restricted'));
CREATE INDEX authority_snapshot_item_version ON packproof.transfer_authority_snapshots(item_id,owner_version,created_at DESC);
CREATE TRIGGER immutable_authority BEFORE UPDATE OR DELETE OR TRUNCATE ON packproof.transfer_authority_snapshots FOR EACH STATEMENT EXECUTE FUNCTION packproof.reject_claim_mutation();
CREATE TABLE packproof.transfer_sessions(
 id uuid PRIMARY KEY,item_id uuid NOT NULL REFERENCES packproof.items,seller_actor_id uuid NOT NULL REFERENCES packproof.actors,buyer_actor_id uuid NOT NULL REFERENCES packproof.actors,
 seller_device_key_id uuid NOT NULL REFERENCES packproof.device_keys,buyer_device_key_id uuid NOT NULL REFERENCES packproof.device_keys,
 agreement_payload text NOT NULL,agreement_hash text NOT NULL CHECK(agreement_hash=encode(sha256(convert_to(agreement_payload,'UTF8')),'hex')),
 state text NOT NULL CHECK(state IN ('offered','seller_approved','buyer_confirmed','committed','blocked','expired','cancelled')),
 buyer_offer text,seller_consent text,buyer_consent text,seller_approval_hash text,
 authority_snapshot_id uuid NOT NULL REFERENCES packproof.transfer_authority_snapshots,
 expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),reason text,
 CHECK(seller_actor_id<>buyer_actor_id),CHECK(seller_device_key_id<>buyer_device_key_id),
 CHECK((agreement_payload::jsonb->>'transferId')::uuid=id AND (agreement_payload::jsonb->>'itemId')::uuid=item_id AND (agreement_payload::jsonb->>'sellerActorId')::uuid=seller_actor_id AND (agreement_payload::jsonb->>'buyerActorId')::uuid=buyer_actor_id AND (agreement_payload::jsonb->>'sellerDeviceKeyId')::uuid=seller_device_key_id AND (agreement_payload::jsonb->>'buyerDeviceKeyId')::uuid=buyer_device_key_id)
);
CREATE INDEX transfer_participant_lookup ON packproof.transfer_sessions(buyer_actor_id,created_at DESC);
CREATE INDEX transfer_seller_lookup ON packproof.transfer_sessions(seller_actor_id,created_at DESC);
CREATE TABLE packproof.transfer_frames(
 handle text PRIMARY KEY CHECK(handle ~ '^cp2_[a-f0-9]{32}$'),transfer_id uuid NOT NULL REFERENCES packproof.transfer_sessions,
 direction text NOT NULL CHECK(direction IN ('buyer-to-seller','seller-to-buyer')),sequence integer NOT NULL CHECK(sequence BETWEEN 0 AND 149),
 payload text NOT NULL,signature text,frame_hash text,not_before timestamptz NOT NULL,expires_at timestamptz NOT NULL,consumed_by uuid,
 UNIQUE(transfer_id,direction,sequence),CHECK(expires_at>not_before)
);
CREATE TABLE packproof.scan_reservations(
 id uuid PRIMARY KEY,transfer_id uuid NOT NULL REFERENCES packproof.transfer_sessions,actor_id uuid NOT NULL REFERENCES packproof.actors,
 direction text NOT NULL CHECK(direction IN ('buyer-to-seller','seller-to-buyer')),proof jsonb NOT NULL,proof_hash text NOT NULL CHECK(proof_hash=encode(sha256(convert_to(proof->>'serialized','UTF8')),'hex')),
 scanned_at timestamptz NOT NULL,consumed_at timestamptz,UNIQUE(transfer_id,direction)
);
CREATE TABLE packproof.transfer_challenges(
 id uuid PRIMARY KEY,transfer_id uuid NOT NULL REFERENCES packproof.transfer_sessions,actor_id uuid NOT NULL REFERENCES packproof.actors,
 direction text NOT NULL CHECK(direction IN ('buyer-to-seller','seller-to-buyer')),reservation_id uuid NOT NULL UNIQUE REFERENCES packproof.scan_reservations,
 payload text NOT NULL,expires_at timestamptz NOT NULL,consumed_at timestamptz,UNIQUE(transfer_id,direction)
);
CREATE TABLE packproof.accepted_transfers(
 id uuid PRIMARY KEY REFERENCES packproof.transfer_sessions,item_id uuid NOT NULL REFERENCES packproof.items,
 seller_actor_id uuid NOT NULL REFERENCES packproof.actors,buyer_actor_id uuid NOT NULL REFERENCES packproof.actors,
 from_owner_id uuid NOT NULL REFERENCES packproof.actors,from_version integer NOT NULL,to_version integer NOT NULL CHECK(to_version=from_version+1),
 agreement_payload text NOT NULL,agreement_hash text NOT NULL,buyer_offer text NOT NULL,seller_consent text NOT NULL,buyer_consent text NOT NULL,
 receipt_id uuid NOT NULL UNIQUE,receipt_data jsonb NOT NULL,committed_at timestamptz NOT NULL,
 UNIQUE(item_id,from_version),UNIQUE(item_id,to_version)
);
CREATE TRIGGER immutable_transfer BEFORE UPDATE OR DELETE OR TRUNCATE ON packproof.accepted_transfers FOR EACH STATEMENT EXECUTE FUNCTION packproof.reject_claim_mutation();
CREATE TABLE packproof.receipt_outbox(
 transfer_id uuid PRIMARY KEY REFERENCES packproof.accepted_transfers,status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','ready','failed')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),receipt_jws text,receipt_sha256 text,next_attempt_at timestamptz NOT NULL DEFAULT now(),
 CHECK((status='ready')=(receipt_jws IS NOT NULL)),CHECK(receipt_jws IS NULL OR receipt_sha256=encode(sha256(convert_to(receipt_jws,'UTF8')),'hex'))
);
CREATE TABLE packproof.transfer_operations(actor_id uuid NOT NULL REFERENCES packproof.actors,operation text NOT NULL,idempotency_key uuid NOT NULL,payload_hash text NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(actor_id,operation,idempotency_key));
CREATE TABLE packproof.transfer_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),transfer_id uuid NOT NULL REFERENCES packproof.transfer_sessions,actor_id uuid NOT NULL REFERENCES packproof.actors,event text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TRIGGER immutable_transfer_events BEFORE UPDATE OR DELETE OR TRUNCATE ON packproof.transfer_events FOR EACH STATEMENT EXECUTE FUNCTION packproof.reject_claim_mutation();
-- Context comes only from the server after Supabase /user authentication. Browser roles cannot assume it.
CREATE FUNCTION packproof.transfer_actor() RETURNS uuid LANGUAGE sql STABLE SET search_path='' AS $$ SELECT nullif(current_setting('packproof.actor_id',true),'')::uuid $$;
REVOKE ALL ON FUNCTION packproof.transfer_actor() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION packproof.transfer_actor() TO packproof_transfer;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['transfer_policies','device_keys','enrollment_challenges','transfer_authority_snapshots','transfer_sessions','transfer_frames','scan_reservations','transfer_challenges','accepted_transfers','receipt_outbox','transfer_operations','transfer_events'] LOOP
  EXECUTE format('ALTER TABLE packproof.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE packproof.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON packproof.%I FROM PUBLIC,anon,authenticated,service_role',t);
 END LOOP;
END $$;
GRANT SELECT ON packproof.actors,packproof.actor_accounts,packproof.signed_records,packproof.issuer_bindings,packproof.directory_changes,packproof.items,packproof.marking_relations,packproof.custody_history,packproof.notices,packproof.transfer_policies,packproof.transfer_authority_snapshots TO packproof_transfer;
-- Existing source tables are forced RLS. The authenticated Node role only reads sources.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['actors','actor_accounts','signed_records','issuer_bindings','directory_changes','items','marking_relations','custody_history','notices','transfer_policies','transfer_authority_snapshots'] LOOP
  EXECUTE format('CREATE POLICY p2_source_read ON packproof.%I FOR SELECT TO packproof_transfer USING(true)',t);
 END LOOP;
END $$;
GRANT SELECT,INSERT,UPDATE ON packproof.device_keys,packproof.enrollment_challenges,packproof.transfer_sessions,packproof.transfer_frames,packproof.scan_reservations,packproof.transfer_challenges,packproof.receipt_outbox,packproof.transfer_operations TO packproof_transfer;
GRANT SELECT ON packproof.accepted_transfers TO packproof_transfer;
GRANT SELECT,INSERT ON packproof.transfer_events TO packproof_transfer;
CREATE POLICY own_device ON packproof.device_keys TO packproof_transfer USING(actor_id=packproof.transfer_actor()) WITH CHECK(actor_id=packproof.transfer_actor());
-- Public counterpart keys are readable only for participants in that active transfer (or selected registered sellers).
CREATE POLICY counterpart_device ON packproof.device_keys FOR SELECT TO packproof_transfer USING(status='active');
CREATE POLICY own_enrollment ON packproof.enrollment_challenges TO packproof_transfer USING(actor_id=packproof.transfer_actor()) WITH CHECK(actor_id=packproof.transfer_actor());
CREATE POLICY participant_session ON packproof.transfer_sessions TO packproof_transfer USING(packproof.transfer_actor() IN (seller_actor_id,buyer_actor_id)) WITH CHECK(packproof.transfer_actor() IN (seller_actor_id,buyer_actor_id));
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['transfer_frames','scan_reservations','transfer_challenges','receipt_outbox','transfer_events'] LOOP
  EXECUTE format('CREATE POLICY participant_only ON packproof.%I TO packproof_transfer USING(EXISTS(SELECT 1 FROM packproof.transfer_sessions s WHERE s.id=transfer_id AND packproof.transfer_actor() IN(s.seller_actor_id,s.buyer_actor_id))) WITH CHECK(EXISTS(SELECT 1 FROM packproof.transfer_sessions s WHERE s.id=transfer_id AND packproof.transfer_actor() IN(s.seller_actor_id,s.buyer_actor_id)))',t);
 END LOOP;
END $$;
-- accepted_transfers uses id as its session FK, not transfer_id.
CREATE POLICY accepted_participant ON packproof.accepted_transfers FOR SELECT TO packproof_transfer USING(packproof.transfer_actor() IN(seller_actor_id,buyer_actor_id));
CREATE POLICY own_operation ON packproof.transfer_operations TO packproof_transfer USING(actor_id=packproof.transfer_actor()) WITH CHECK(actor_id=packproof.transfer_actor());
-- Acquire item/source locks BEFORE cryptographic verification; locks last to the Node transaction commit.
CREATE FUNCTION packproof.lock_transfer_sources(p_item uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF packproof.transfer_actor() IS NULL THEN RAISE EXCEPTION 'actor_required'; END IF;
 PERFORM 1 FROM packproof.items WHERE id=p_item FOR UPDATE;
 LOCK TABLE packproof.signed_records,packproof.issuer_bindings,packproof.directory_changes,packproof.transfer_authority_snapshots,packproof.transfer_policies IN SHARE MODE;
END $$;
-- This cannot be called via anon/authenticated/service_role or a client RPC.
-- Node verifies ES256 while holding the above source/item locks. This routine separately
-- enforces owner/version/lifecycle/key/policy/challenge/scan constraints inside PostgreSQL.
CREATE FUNCTION packproof.commit_transfer(p_id uuid,p_receipt_id uuid,p_receipt_data jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s packproof.transfer_sessions%ROWTYPE; i packproof.items%ROWTYPE; a jsonb; stamp timestamptz:=clock_timestamp();
BEGIN
 SELECT * INTO s FROM packproof.transfer_sessions WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR s.buyer_actor_id<>packproof.transfer_actor() THEN RAISE EXCEPTION 'transfer_not_found'; END IF;
 IF s.state='committed' THEN RETURN; END IF;
 a:=s.agreement_payload::jsonb;
 SELECT * INTO i FROM packproof.items WHERE id=s.item_id FOR UPDATE;
 IF s.state<>'buyer_confirmed' OR s.expires_at<=stamp OR (a->>'policyVersion')<>'chainproof-online-1' OR NOT EXISTS(SELECT 1 FROM packproof.transfer_policies WHERE version=a->>'policyVersion' AND active) THEN RAISE EXCEPTION 'invalid_transfer_state'; END IF;
 IF i.owner_version<>(a->>'expectedOwnerVersion')::int OR i.registered_owner_id<>(a->>'expectedOwnerId')::uuid THEN RAISE EXCEPTION 'ownership_conflict'; END IF;
 IF i.lifecycle NOT IN('issued','transferred') THEN RAISE EXCEPTION 'ineligible_lifecycle'; END IF;
 IF i.mapping_record_id<>(a->>'mappingRecordId')::uuid OR NOT EXISTS(SELECT 1 FROM packproof.marking_relations m WHERE m.item_id=i.id AND m.record_id=i.mapping_record_id AND m.product_mark=i.unit_mark AND m.product_scope='unit' AND m.packaging_scope='unit') THEN RAISE EXCEPTION 'invalid_mapping'; END IF;
 IF i.registered_owner_id<>s.seller_actor_id AND NOT EXISTS(SELECT 1 FROM packproof.signed_records r WHERE r.record_type='delegation' AND r.payload->'data'->>'itemId'=i.id::text AND r.payload->'data'->>'ownerActorId'=i.registered_owner_id::text AND r.payload->'data'->>'delegateActorId'=s.seller_actor_id::text AND (r.payload->'data'->>'ownerVersion')::int=i.owner_version AND (r.payload->'data'->>'expiresAt')::timestamptz>stamp AND r.payload->'data'->>'revokedAt' IS NULL) THEN RAISE EXCEPTION 'seller_not_authorized'; END IF;
 IF (SELECT count(*) FROM packproof.device_keys k JOIN packproof.actor_accounts aa ON aa.actor_id=k.actor_id AND aa.user_id=k.user_id WHERE ((k.id=s.seller_device_key_id AND k.actor_id=s.seller_actor_id) OR(k.id=s.buyer_device_key_id AND k.actor_id=s.buyer_actor_id)) AND k.status='active' AND k.expires_at>stamp)<>2 THEN RAISE EXCEPTION 'device_revoked'; END IF;
 IF NOT EXISTS(SELECT 1 FROM packproof.transfer_authority_snapshots snap WHERE snap.id=s.authority_snapshot_id AND snap.item_id=i.id AND snap.owner_version=i.owner_version AND (snap.payload->'data'->>'asOf')::timestamptz<=stamp AND (snap.payload->'data'->>'asOf')::timestamptz>stamp-interval '24 hours') THEN RAISE EXCEPTION 'stale_authority'; END IF;
 IF s.buyer_offer IS NULL OR s.seller_consent IS NULL OR s.buyer_consent IS NULL OR s.seller_approval_hash<>encode(sha256(convert_to(s.seller_consent,'UTF8')),'hex') THEN RAISE EXCEPTION 'missing_approvals'; END IF;
 IF (SELECT count(*) FROM packproof.transfer_challenges c JOIN packproof.scan_reservations r ON r.id=c.reservation_id WHERE c.transfer_id=s.id AND c.consumed_at IS NOT NULL AND r.consumed_at IS NOT NULL AND c.expires_at>c.consumed_at AND r.scanned_at<=c.consumed_at AND c.consumed_at<=s.expires_at)<>2 THEN RAISE EXCEPTION 'missing_consumed_consent'; END IF;
 IF p_receipt_data->>'transferId'<>s.id::text OR p_receipt_data->>'agreementPayload'<>s.agreement_payload OR p_receipt_data->>'agreementHash'<>s.agreement_hash OR p_receipt_data->>'sellerConsent'<>s.seller_consent OR p_receipt_data->>'buyerConsent'<>s.buyer_consent OR p_receipt_data->>'buyerOffer'<>s.buyer_offer OR (p_receipt_data->>'fromVersion')::int<>i.owner_version OR (p_receipt_data->>'toVersion')::int<>i.owner_version+1 THEN RAISE EXCEPTION 'invalid_receipt_data'; END IF;
 INSERT INTO packproof.accepted_transfers VALUES(s.id,i.id,s.seller_actor_id,s.buyer_actor_id,i.registered_owner_id,i.owner_version,i.owner_version+1,s.agreement_payload,s.agreement_hash,s.buyer_offer,s.seller_consent,s.buyer_consent,p_receipt_id,p_receipt_data,(p_receipt_data->>'committedAt')::timestamptz);
 UPDATE packproof.items SET registered_owner_id=s.buyer_actor_id,owner_version=owner_version+1,lifecycle='transferred' WHERE id=i.id;
 UPDATE packproof.transfer_sessions SET state='committed' WHERE id=s.id;
 INSERT INTO packproof.receipt_outbox(transfer_id) VALUES(s.id);
 INSERT INTO packproof.transfer_events(transfer_id,actor_id,event) VALUES(s.id,s.buyer_actor_id,'committed');
END $$;
CREATE FUNCTION packproof.store_transfer_receipt(p_id uuid,p_payload jsonb,p_jws text,p_hash text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a packproof.accepted_transfers%ROWTYPE; BEGIN
 SELECT * INTO a FROM packproof.accepted_transfers WHERE id=p_id;
 IF NOT FOUND OR packproof.transfer_actor() NOT IN(a.buyer_actor_id,a.seller_actor_id) THEN RAISE EXCEPTION 'transfer_not_found'; END IF;
 PERFORM 1 FROM packproof.receipt_outbox WHERE transfer_id=p_id FOR UPDATE;
 IF (SELECT status FROM packproof.receipt_outbox WHERE transfer_id=p_id)='ready' THEN RETURN; END IF;
 IF p_payload->'data'<>a.receipt_data OR (p_payload->>'id')::uuid<>a.receipt_id OR p_payload->>'type'<>'transfer_receipt' OR p_payload->>'visibility'<>'restricted' OR p_hash<>encode(sha256(convert_to(p_jws,'UTF8')),'hex') THEN RAISE EXCEPTION 'invalid_receipt'; END IF;
 INSERT INTO packproof.signed_records(id,namespace,record_type,issuer_id,key_id,scope,issued_at,received_at,revision,visibility,demo,jws,sha256,payload) VALUES(a.receipt_id,p_payload->>'namespace','transfer_receipt',(p_payload->>'issuerId')::uuid,(p_payload->>'keyId')::uuid,'unit',(p_payload->>'issuedAt')::timestamptz,(p_payload->>'receivedAt')::timestamptz,(p_payload->>'revision')::int,'restricted',true,p_jws,p_hash,p_payload);
 UPDATE packproof.items SET owner_record_id=a.receipt_id WHERE id=a.item_id AND owner_version=a.to_version AND registered_owner_id=a.buyer_actor_id;
 UPDATE packproof.receipt_outbox SET status='ready',receipt_jws=p_jws,receipt_sha256=p_hash,attempts=attempts+1 WHERE transfer_id=p_id;
END $$;
REVOKE ALL ON FUNCTION packproof.lock_transfer_sources(uuid),packproof.commit_transfer(uuid,uuid,jsonb),packproof.store_transfer_receipt(uuid,jsonb,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION packproof.lock_transfer_sources(uuid),packproof.commit_transfer(uuid,uuid,jsonb),packproof.store_transfer_receipt(uuid,jsonb,text,text) TO packproof_transfer;
CREATE FUNCTION packproof.ensure_transfer_actor(p_user uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a uuid; BEGIN
 IF nullif(current_setting('packproof.user_id',true),'')::uuid IS DISTINCT FROM p_user OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user) THEN RAISE EXCEPTION 'authenticated_user_required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text,701));
 SELECT actor_id INTO a FROM packproof.actor_accounts WHERE user_id=p_user;
 IF a IS NULL THEN
  a:=gen_random_uuid();INSERT INTO packproof.actors VALUES(a,'consumer','Registered demo participant',true);
  INSERT INTO packproof.actor_accounts VALUES(a,p_user);
 END IF;
 RETURN a;
END $$;
REVOKE ALL ON FUNCTION packproof.ensure_transfer_actor(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION packproof.ensure_transfer_actor(uuid) TO packproof_transfer;
CREATE FUNCTION packproof.guard_transfer_agreement() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF ROW(NEW.id,NEW.item_id,NEW.seller_actor_id,NEW.buyer_actor_id,NEW.seller_device_key_id,NEW.buyer_device_key_id,NEW.agreement_payload,NEW.agreement_hash,NEW.expires_at,NEW.authority_snapshot_id) IS DISTINCT FROM ROW(OLD.id,OLD.item_id,OLD.seller_actor_id,OLD.buyer_actor_id,OLD.seller_device_key_id,OLD.buyer_device_key_id,OLD.agreement_payload,OLD.agreement_hash,OLD.expires_at,OLD.authority_snapshot_id) THEN RAISE EXCEPTION 'immutable_agreement'; END IF;
 IF OLD.state IN('committed','blocked','expired','cancelled') AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'terminal_transfer'; END IF;
 IF OLD.buyer_offer IS NOT NULL AND NEW.buyer_offer IS DISTINCT FROM OLD.buyer_offer OR OLD.seller_consent IS NOT NULL AND NEW.seller_consent IS DISTINCT FROM OLD.seller_consent OR OLD.buyer_consent IS NOT NULL AND NEW.buyer_consent IS DISTINCT FROM OLD.buyer_consent THEN RAISE EXCEPTION 'immutable_approval'; END IF;
 IF NEW.state<>OLD.state AND NOT ((OLD.state='offered' AND NEW.state='seller_approved') OR(OLD.state='seller_approved' AND NEW.state='buyer_confirmed') OR(OLD.state='buyer_confirmed' AND NEW.state='committed') OR NEW.state IN('blocked','expired','cancelled')) THEN RAISE EXCEPTION 'invalid_transition'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION packproof.guard_transfer_agreement() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable_agreement BEFORE UPDATE ON packproof.transfer_sessions FOR EACH ROW EXECUTE FUNCTION packproof.guard_transfer_agreement();
CREATE TABLE packproof.transfer_limits(actor_id uuid NOT NULL REFERENCES packproof.actors,bucket timestamptz NOT NULL,requests integer NOT NULL,PRIMARY KEY(actor_id,bucket));
ALTER TABLE packproof.transfer_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE packproof.transfer_limits FORCE ROW LEVEL SECURITY;
REVOKE ALL ON packproof.transfer_limits FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON packproof.transfer_limits TO packproof_transfer;
CREATE POLICY own_transfer_limit ON packproof.transfer_limits TO packproof_transfer USING(actor_id=packproof.transfer_actor()) WITH CHECK(actor_id=packproof.transfer_actor());
