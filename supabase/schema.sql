-- Generated study material, shared between users of the same document.
-- Run this once in the Supabase dashboard: SQL Editor > New query > Run.
--
-- cache_key is a SHA-256 of the document text, format, model and prompt, so a row
-- can only be found by someone who uploads exactly the same text. PDFs and their
-- text are never stored.
create table if not exists public.material_cache (
  cache_key  text primary key,
  mode       text not null,
  material   jsonb not null,
  created_at timestamptz not null default now()
);

-- With row level security on and no policies, the public API keys can't touch this
-- table. Only the server's secret key can, because it bypasses RLS.
alter table public.material_cache enable row level security;
