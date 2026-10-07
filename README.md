# LLMSource AI Representation Gap Report

GitHub Pages serves the password-protected v9 report. `index.html` contains the AES-256-GCM encrypted report. The comment panel appears after the report is unlocked.

## Comments

Anyone who can unlock the report can leave a comment with a display name. They can comment on a selected passage or a whole page, and reply to threads. Names are self-entered and are not verified. The black Comments button, green count, desktop side panel, and mobile bottom sheet live in `comments.css` and `comments.js`.

The encrypted report includes a random 256-bit comments access token. The token is generated once at `.private/comments-token`, which is ignored by Git. Supabase stores only its MD5 verifier in a private table. Its browser publishable key in `comments-config.js` is intentionally public and cannot access the comments table directly. Keep a separate secure backup of `.private/comments-token`; deleting it requires rotating the database verifier and publishing a new encrypted report. Do not publish the plaintext preview HTML.

## Setup

1. Run `supabase/schema.sql` in the project's SQL Editor. The tables have RLS enabled and no direct client grants. The read and post RPCs check the encrypted report token.
2. Generate the local token and preview with `python3 scripts/publish_comments.py --preview`. Insert the MD5 hash of `.private/comments-token` into `private.comment_access` through the SQL Editor. Never insert the token itself.
3. Add the Project URL and **publishable** key to `comments-config.js`. Never use a secret or service-role key in the browser.
4. To resolve a thread, the project owner can update `public.report_comments.resolved_at` in the Supabase dashboard. Visitors cannot resolve threads.

## Build

From this repository, run `python3 scripts/publish_comments.py --preview` for a local plaintext preview in `../v9-share/`. To regenerate the encrypted Pages entry point, set `PAGE_PASSWORD` in your shell and run `python3 scripts/publish_comments.py`. Do not copy the preview HTML into this repository.

Before pushing, verify password unlock, a saved comment and reply, reload persistence, mobile layout, and direct table access denial.
