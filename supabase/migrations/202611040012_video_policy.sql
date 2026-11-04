-- The parent video's read policy also reads frames. An INSERT check that reads
-- that parent recurses during RLS expansion. The existing SECURITY DEFINER
-- bind_video_frame trigger performs the owner and source/hash checks without
-- invoking either read policy; keep it as the sole INSERT authority check.
ALTER POLICY add_video_frame ON packproof.video_frames WITH CHECK(true);
