-- Run in this report's Supabase SQL Editor. The access-token hash is added
-- separately from the private local token created by scripts/publish_comments.py.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.comment_access (
  token_hash text primary key check (length(token_hash) = 32)
);
revoke all on private.comment_access from public, anon, authenticated;

create table if not exists public.report_comments (
  id uuid primary key default gen_random_uuid(),
  report_key text not null default 'v9' check (report_key = 'v9'),
  page_id text not null check (page_id ~ '^page-[0-9]{2}(-image)?$'),
  quote text check (quote is null or length(quote) between 1 and 600),
  start_path jsonb,
  end_path jsonb,
  start_offset integer,
  end_offset integer,
  body text not null check (length(trim(body)) between 1 and 2000),
  author_name text not null check (length(trim(author_name)) between 1 and 50),
  parent_id uuid references public.report_comments(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint anchored_comment_complete check (
    (quote is null and start_path is null and end_path is null and start_offset is null and end_offset is null)
    or
    (quote is not null and start_path is not null and end_path is not null and start_offset >= 0 and end_offset >= 0)
  ),
  constraint replies_have_no_anchor check (parent_id is null or quote is null)
);
create index if not exists report_comments_report_created_idx on public.report_comments(report_key, created_at);
create index if not exists report_comments_parent_idx on public.report_comments(parent_id);
alter table public.report_comments enable row level security;
revoke all on public.report_comments from public, anon, authenticated;

create or replace function public.report_token_valid(p_token text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select length(p_token) = 64 and exists (
    select 1 from private.comment_access where token_hash = pg_catalog.md5(p_token)
  );
$$;
revoke all on function public.report_token_valid(text) from public, anon, authenticated;

create or replace function public.list_report_comments(p_token text)
returns setof public.report_comments
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if public.report_token_valid(p_token) is not true then
    raise exception 'Report access denied';
  end if;
  return query select * from public.report_comments
    where report_key = 'v9' order by created_at;
end;
$$;
revoke all on function public.list_report_comments(text) from public;
grant execute on function public.list_report_comments(text) to anon, authenticated;

create or replace function public.post_report_comment(
  p_token text, p_page_id text, p_body text, p_author_name text,
  p_parent_id uuid default null, p_quote text default null,
  p_start_path jsonb default null, p_end_path jsonb default null,
  p_start_offset integer default null, p_end_offset integer default null
)
returns uuid
language plpgsql volatile security definer
set search_path = ''
as $$
declare new_id uuid;
begin
  if public.report_token_valid(p_token) is not true then
    raise exception 'Report access denied';
  end if;
  if p_parent_id is not null then
    if not exists (select 1 from public.report_comments
      where id = p_parent_id and parent_id is null and resolved_at is null and page_id = p_page_id) then
      raise exception 'Open parent comment not found';
    end if;
    if p_quote is not null or p_start_path is not null or p_end_path is not null then
      raise exception 'Replies cannot have an anchor';
    end if;
  end if;
  insert into public.report_comments (
    page_id, body, author_name, parent_id, quote,
    start_path, end_path, start_offset, end_offset
  ) values (
    p_page_id, p_body, p_author_name, p_parent_id, p_quote,
    p_start_path, p_end_path, p_start_offset, p_end_offset
  ) returning id into new_id;
  return new_id;
end;
$$;
revoke all on function public.post_report_comment(text,text,text,text,uuid,text,jsonb,jsonb,integer,integer) from public;
grant execute on function public.post_report_comment(text,text,text,text,uuid,text,jsonb,jsonb,integer,integer) to anon, authenticated;

create or replace function public.resolve_report_comment(p_token text, p_comment_id uuid)
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
begin
  if public.report_token_valid(p_token) is not true then
    raise exception 'Report access denied';
  end if;
  update public.report_comments set resolved_at = now()
  where id = p_comment_id and parent_id is null and resolved_at is null;
  if not found then
    raise exception 'Open comment not found';
  end if;
end;
$$;
revoke all on function public.resolve_report_comment(text,uuid) from public;
revoke execute on function public.resolve_report_comment(text,uuid) from anon, authenticated;
