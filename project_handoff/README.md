# PackProof v10

This directory was renamed from `info_files` to `project_handoff` on 30 October 2026. Existing build-state and build-log files remain here. Read `Product_Direction_Notes.md` for the user's Glimmer/POS/Android/radio clarification and evolving-product guidance.

Copy these files into your intended repository without replacing existing code or AGENTS.md. Read the implementation plan, then paste PackProof_v10_First_Codex_Prompt.md into Codex. It performs P0 only. The developer handoff contains the contracts and tests. PROMPT_GENERATOR.md helps a smaller model generate each later bounded prompt from actual build evidence.

Original v9 remains unchanged in its original location. This pack supersedes its sprint instructions. All app status starts unbuilt.

For a regular ChatGPT chat: upload this ZIP (or extract and upload the product Markdown, implementation plan, developer handoff, first prompt and build state). Paste PROMPT_GENERATOR.md. After each Codex phase, paste its completion report and updated BUILD_STATE.json there. The chat produces the next bounded prompt or a repair prompt; Codex performs the code changes and checks.
