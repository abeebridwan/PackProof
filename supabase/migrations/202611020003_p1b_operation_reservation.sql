-- Batch existing operation reservation checks. No claim/ownership privileges.
-- VOLATILE preserves the fresh post-lock snapshot for the idempotency read.
CREATE FUNCTION packproof.reserve_investigation_operation(
 p_id uuid,p_key text,p_hash text,p_kind text,p_recapture boolean,p_cents integer,p_cap integer
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path=pg_catalog AS $$
DECLARE
 inv packproof.investigations%ROWTYPE;
 old packproof.investigation_operations%ROWTYPE;
BEGIN
 SELECT * INTO inv FROM packproof.investigations WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
 SELECT * INTO old FROM packproof.investigation_operations WHERE investigation_id=p_id AND operation_key=p_key;
 IF FOUND THEN
  IF old.argument_sha256<>p_hash THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
  IF old.status<>'complete' THEN RAISE EXCEPTION 'operation_in_doubt'; END IF;
  RETURN jsonb_build_object('cached',true,'value',old.result);
 END IF;
 IF p_cents IS NULL OR p_cap IS NULL OR p_cents<0 OR p_cap<0 OR p_cap>50 OR p_cents>p_cap OR inv.reserved_cents>p_cap-p_cents THEN RAISE EXCEPTION 'budget_exhausted'; END IF;
 IF p_kind IS NULL OR p_kind NOT IN ('model','tool','retry','resume') THEN RAISE EXCEPTION 'invalid_operation'; END IF;
 IF p_kind='tool' AND inv.actions>=8 THEN RAISE EXCEPTION 'action_limit'; END IF;
 IF p_recapture AND inv.recaptures>=3 THEN RAISE EXCEPTION 'recapture_limit'; END IF;
 IF p_kind='retry' AND inv.retries>=2 THEN RAISE EXCEPTION 'retry_limit'; END IF;
 IF p_kind='model' AND inv.model_requests>=12 THEN RAISE EXCEPTION 'model_limit'; END IF;
 UPDATE packproof.investigations SET
  actions=actions+CASE WHEN p_kind='tool' THEN 1 ELSE 0 END,
  recaptures=recaptures+CASE WHEN p_recapture THEN 1 ELSE 0 END,
  retries=retries+CASE WHEN p_kind='retry' THEN 1 ELSE 0 END,
  reserved_cents=reserved_cents+p_cents,
  model_requests=model_requests+CASE WHEN p_kind='model' THEN 1 ELSE 0 END
 WHERE id=p_id;
 INSERT INTO packproof.investigation_operations(investigation_id,operation_key,argument_sha256,kind,status)
 VALUES(p_id,p_key,p_hash,p_kind,'reserved');
 RETURN jsonb_build_object('cached',false,'value',NULL);
END $$;
REVOKE ALL ON FUNCTION packproof.reserve_investigation_operation(uuid,text,text,text,boolean,integer,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION packproof.reserve_investigation_operation(uuid,text,text,text,boolean,integer,integer) TO packproof_investigator;
