-- Bounded private video and decoded frame provenance. Images remain existing captures.
CREATE TABLE packproof.evidence_videos(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id),actor_id uuid NOT NULL REFERENCES packproof.actors(id),investigation_id uuid NOT NULL REFERENCES packproof.investigations(id),source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),mime text NOT NULL CHECK(mime IN ('video/mp4','video/webm')),bytes integer NOT NULL CHECK(bytes BETWEEN 16 AND 3145728),duration_ms integer NOT NULL CHECK(duration_ms BETWEEN 200 AND 8000),object_path text NOT NULL UNIQUE,decoder_version text NOT NULL CHECK(decoder_version='9.0.2'),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE packproof.video_frames(capture_id uuid PRIMARY KEY REFERENCES packproof.captures(id),video_id uuid NOT NULL REFERENCES packproof.evidence_videos(id),source_video_sha256 text NOT NULL CHECK(source_video_sha256 ~ '^[a-f0-9]{64}$'),timestamp_ms integer NOT NULL CHECK(timestamp_ms BETWEEN 0 AND 8000),frame_sha256 text NOT NULL CHECK(frame_sha256 ~ '^[a-f0-9]{64}$'));
DO $$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['evidence_videos','video_frames'] LOOP
 EXECUTE format('ALTER TABLE packproof.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE packproof.%I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON packproof.%I FROM PUBLIC,anon,authenticated,service_role',t);
 EXECUTE format('GRANT SELECT,INSERT ON packproof.%I TO packproof_platform',t);
END LOOP;END $$;
CREATE POLICY read_video_frame ON packproof.video_frames FOR SELECT TO packproof_platform USING(EXISTS(SELECT 1 FROM packproof.captures c WHERE c.id=capture_id));
CREATE POLICY add_video_frame ON packproof.video_frames FOR INSERT TO packproof_platform WITH CHECK(EXISTS(SELECT 1 FROM packproof.evidence_videos v WHERE v.id=video_id AND v.user_id=packproof.platform_user()));
CREATE POLICY video_owner_write ON packproof.evidence_videos FOR INSERT TO packproof_platform WITH CHECK(user_id=packproof.platform_user() AND actor_id=packproof.platform_actor() AND EXISTS(SELECT 1 FROM packproof.investigations i WHERE i.id=investigation_id));
CREATE POLICY video_owner_read ON packproof.evidence_videos FOR SELECT TO packproof_platform USING(user_id=packproof.platform_user() OR EXISTS(SELECT 1 FROM packproof.video_frames f JOIN packproof.handover_evidence e ON e.capture_id=f.capture_id WHERE f.video_id=evidence_videos.id));
CREATE POLICY platform_own_capture ON packproof.captures FOR SELECT TO packproof_platform USING(EXISTS(SELECT 1 FROM packproof.investigations i WHERE i.id=investigation_id));
GRANT SELECT ON packproof.video_frames TO packproof_investigator;
CREATE POLICY inspect_own_frame ON packproof.video_frames FOR SELECT TO packproof_investigator USING(EXISTS(SELECT 1 FROM packproof.captures c WHERE c.id=capture_id));
CREATE FUNCTION packproof.bind_video_frame() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v packproof.evidence_videos%ROWTYPE;c packproof.captures%ROWTYPE;
BEGIN
 SELECT * INTO v FROM packproof.evidence_videos WHERE id=NEW.video_id;
 SELECT * INTO c FROM packproof.captures WHERE id=NEW.capture_id;
 IF v.id IS NULL OR c.id IS NULL OR v.user_id IS DISTINCT FROM packproof.platform_user() OR c.investigation_id IS DISTINCT FROM v.investigation_id OR NEW.source_video_sha256 IS DISTINCT FROM v.source_sha256 OR NEW.frame_sha256 IS DISTINCT FROM c.sha256 OR NEW.timestamp_ms>v.duration_ms THEN RAISE EXCEPTION 'video_frame_binding_mismatch';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION packproof.bind_video_frame() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER bind_video_frame BEFORE INSERT ON packproof.video_frames FOR EACH ROW EXECUTE FUNCTION packproof.bind_video_frame();
