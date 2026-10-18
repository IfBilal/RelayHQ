-- Lets the public lead form show the company name for a workspace slug, and nothing else.
create function private.public_form_info(p_slug text) returns text
language sql stable security definer set search_path = '' as $$
  select name from public.workspaces where slug = p_slug;
$$;
create function public.public_form_info(p_slug text) returns text
language sql security invoker set search_path = '' as $$ select private.public_form_info(p_slug); $$;

grant execute on function private.public_form_info(text) to anon, authenticated;
revoke execute on function public.public_form_info(text) from public;
grant execute on function public.public_form_info(text) to anon, authenticated;
