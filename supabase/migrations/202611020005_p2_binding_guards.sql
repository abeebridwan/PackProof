-- P2 follow-up: retain enrollment proof and seal device/challenge bindings.
ALTER TABLE packproof.enrollment_challenges ADD COLUMN proof_jws text;
CREATE FUNCTION packproof.guard_device_binding() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF ROW(NEW.id,NEW.actor_id,NEW.user_id,NEW.public_jwk,NEW.jwk_sha256,NEW.role,NEW.created_at,NEW.expires_at) IS DISTINCT FROM ROW(OLD.id,OLD.actor_id,OLD.user_id,OLD.public_jwk,OLD.jwk_sha256,OLD.role,OLD.created_at,OLD.expires_at) OR OLD.status='revoked' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'immutable_device_binding'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_device_binding BEFORE UPDATE ON packproof.device_keys FOR EACH ROW EXECUTE FUNCTION packproof.guard_device_binding();
CREATE FUNCTION packproof.guard_enrollment_binding() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF ROW(NEW.id,NEW.actor_id,NEW.user_id,NEW.key_id,NEW.payload,NEW.expires_at,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.actor_id,OLD.user_id,OLD.key_id,OLD.payload,OLD.expires_at,OLD.created_at) OR OLD.consumed_at IS NOT NULL AND NEW IS DISTINCT FROM OLD OR NEW.consumed_at IS NOT NULL AND NEW.proof_jws IS NULL THEN RAISE EXCEPTION 'immutable_enrollment_binding'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_enrollment_binding BEFORE UPDATE ON packproof.enrollment_challenges FOR EACH ROW EXECUTE FUNCTION packproof.guard_enrollment_binding();
REVOKE ALL ON FUNCTION packproof.guard_device_binding(),packproof.guard_enrollment_binding() FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION packproof.commit_transfer(p_id uuid,p_receipt_id uuid,p_receipt_data jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s packproof.transfer_sessions%ROWTYPE; i packproof.items%ROWTYPE; a jsonb; stamp timestamptz:=clock_timestamp();
BEGIN
 SELECT * INTO s FROM packproof.transfer_sessions WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR s.buyer_actor_id<>packproof.transfer_actor() THEN RAISE EXCEPTION 'transfer_not_found'; END IF;
 IF s.state='committed' THEN RETURN; END IF;
 a:=s.agreement_payload::jsonb;
 PERFORM packproof.lock_transfer_sources(s.item_id);
 PERFORM 1 FROM packproof.device_keys WHERE id IN(s.seller_device_key_id,s.buyer_device_key_id) ORDER BY id FOR SHARE;
 PERFORM 1 FROM packproof.actor_accounts WHERE actor_id IN(s.seller_actor_id,s.buyer_actor_id) ORDER BY actor_id FOR SHARE;
 SELECT * INTO i FROM packproof.items WHERE id=s.item_id FOR UPDATE;
 IF s.state<>'buyer_confirmed' OR s.expires_at<=stamp OR (a->>'policyVersion')<>'chainproof-online-1' OR NOT EXISTS(SELECT 1 FROM packproof.transfer_policies WHERE version=a->>'policyVersion' AND active) THEN RAISE EXCEPTION 'invalid_transfer_state'; END IF;
 IF i.owner_version<>(a->>'expectedOwnerVersion')::int OR i.registered_owner_id<>(a->>'expectedOwnerId')::uuid THEN RAISE EXCEPTION 'ownership_conflict'; END IF;
 IF i.lifecycle NOT IN('issued','transferred') THEN RAISE EXCEPTION 'ineligible_lifecycle'; END IF;
 IF i.mapping_record_id<>(a->>'mappingRecordId')::uuid OR NOT EXISTS(SELECT 1 FROM packproof.marking_relations m WHERE m.item_id=i.id AND m.record_id=i.mapping_record_id AND m.product_mark=i.unit_mark AND m.product_scope='unit' AND m.packaging_scope='unit') THEN RAISE EXCEPTION 'invalid_mapping'; END IF;
 IF i.registered_owner_id<>s.seller_actor_id AND NOT EXISTS(SELECT 1 FROM packproof.signed_records r WHERE r.record_type='delegation' AND r.payload->'data'->>'itemId'=i.id::text AND r.payload->'data'->>'ownerActorId'=i.registered_owner_id::text AND r.payload->'data'->>'delegateActorId'=s.seller_actor_id::text AND (r.payload->'data'->>'ownerVersion')::int=i.owner_version AND (r.payload->'data'->>'expiresAt')::timestamptz>stamp AND r.payload->'data'->>'revokedAt' IS NULL) THEN RAISE EXCEPTION 'seller_not_authorized'; END IF;
 IF (SELECT count(*) FROM packproof.device_keys k JOIN packproof.actor_accounts aa ON aa.actor_id=k.actor_id AND aa.user_id=k.user_id WHERE ((k.id=s.seller_device_key_id AND k.actor_id=s.seller_actor_id) OR(k.id=s.buyer_device_key_id AND k.actor_id=s.buyer_actor_id)) AND k.status='active' AND k.expires_at>stamp)<>2 THEN RAISE EXCEPTION 'device_revoked'; END IF;
 IF NOT EXISTS(SELECT 1 FROM packproof.transfer_authority_snapshots snap WHERE snap.id=s.authority_snapshot_id AND snap.item_id=i.id AND snap.owner_version=i.owner_version AND (snap.payload->'data'->>'asOf')::timestamptz<=stamp AND (snap.payload->'data'->>'asOf')::timestamptz>stamp-interval '24 hours') THEN RAISE EXCEPTION 'stale_authority'; END IF;
 IF s.buyer_offer IS NULL OR s.seller_consent IS NULL OR s.buyer_consent IS NULL OR s.seller_approval_hash<>encode(sha256(convert_to(s.seller_consent,'UTF8')),'hex') THEN RAISE EXCEPTION 'missing_approvals'; END IF;
 IF (SELECT count(*) FROM packproof.transfer_challenges c JOIN packproof.scan_reservations r ON r.id=c.reservation_id WHERE c.transfer_id=s.id AND c.consumed_at IS NOT NULL AND r.consumed_at IS NOT NULL AND c.expires_at>c.consumed_at AND r.scanned_at<=c.consumed_at AND c.consumed_at<=s.expires_at AND c.actor_id=r.actor_id AND c.direction=r.direction AND c.actor_id=CASE WHEN c.direction='buyer-to-seller' THEN s.seller_actor_id ELSE s.buyer_actor_id END AND c.payload::jsonb->>'agreementHash'=s.agreement_hash AND jsonb_array_length((r.proof->>'serialized')::jsonb->'frameHashes')=3 AND (SELECT count(*) FROM packproof.transfer_frames f WHERE f.transfer_id=s.id AND f.direction=c.direction AND f.frame_hash IN(SELECT jsonb_array_elements_text((r.proof->>'serialized')::jsonb->'frameHashes')) AND f.signature IS NOT NULL AND f.consumed_by=c.actor_id AND f.not_before<=r.scanned_at AND f.expires_at>r.scanned_at)=3)<>2 THEN RAISE EXCEPTION 'missing_consumed_consent'; END IF;
 IF p_receipt_data->>'transferId'<>s.id::text OR p_receipt_data->>'agreementPayload'<>s.agreement_payload OR p_receipt_data->>'agreementHash'<>s.agreement_hash OR p_receipt_data->>'sellerConsent'<>s.seller_consent OR p_receipt_data->>'buyerConsent'<>s.buyer_consent OR p_receipt_data->>'buyerOffer'<>s.buyer_offer OR (p_receipt_data->>'fromVersion')::int<>i.owner_version OR (p_receipt_data->>'toVersion')::int<>i.owner_version+1 THEN RAISE EXCEPTION 'invalid_receipt_data'; END IF;
 INSERT INTO packproof.accepted_transfers VALUES(s.id,i.id,s.seller_actor_id,s.buyer_actor_id,i.registered_owner_id,i.owner_version,i.owner_version+1,s.agreement_payload,s.agreement_hash,s.buyer_offer,s.seller_consent,s.buyer_consent,p_receipt_id,p_receipt_data,(p_receipt_data->>'committedAt')::timestamptz);
 UPDATE packproof.items SET registered_owner_id=s.buyer_actor_id,owner_version=owner_version+1,lifecycle='transferred' WHERE id=i.id;
 UPDATE packproof.transfer_sessions SET state='committed' WHERE id=s.id;
 INSERT INTO packproof.receipt_outbox(transfer_id) VALUES(s.id);
 INSERT INTO packproof.transfer_events(transfer_id,actor_id,event) VALUES(s.id,s.buyer_actor_id,'committed');
END $$;
