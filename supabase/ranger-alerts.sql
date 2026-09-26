-- Run once in the Supabase SQL editor as the database owner.
-- Existing alerts/rangers tables and ranger read/update RLS policies are required.
begin;
alter table public.alerts add column if not exists message text;
alter table public.alerts add column if not exists dispatch_key text;
create unique index if not exists alerts_dispatch_key_unique on public.alerts(dispatch_key);

create or replace function public.dispatch_ranger_alert(
  p_zone text, p_message text, p_lat double precision, p_lng double precision,
  p_radius integer, p_confidence text, p_event_id text
) returns text
language plpgsql security definer set search_path = '' as $$
declare alert_id text;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and coalesce(auth.jwt()->'app_metadata'->>'role', '') not in ('admin', 'dispatcher') then
    raise exception 'Dispatcher access required' using errcode = '42501';
  end if;
  if p_zone is null or length(trim(p_zone)) not between 1 and 100
     or p_message is null or length(trim(p_message)) not between 1 and 2000
     or p_lat is null or not (p_lat between -90 and 90)
     or p_lng is null or not (p_lng between -180 and 180)
     or p_radius is null or p_radius not between 1 and 100000
     or p_confidence is null or p_confidence not in ('Low', 'Medium', 'High')
     or p_event_id is null or length(p_event_id) not between 1 and 200 then
    raise exception 'Invalid alert fields';
  end if;
  if not exists (select 1 from public.rangers where zone_id = trim(p_zone)) then
    raise exception 'No ranger assigned to this zone';
  end if;
  insert into public.alerts(zone_id, message, lat, lng, radius_m, confidence, status, dispatch_key)
  values(trim(p_zone), trim(p_message), p_lat, p_lng, p_radius, p_confidence, 'pending', p_event_id)
  on conflict (dispatch_key) do nothing
  returning id::text into alert_id;
  if alert_id is null then
    select id::text into alert_id from public.alerts where dispatch_key = p_event_id;
  end if;
  return alert_id;
end;
$$;
revoke all on function public.dispatch_ranger_alert(text,text,double precision,double precision,integer,text,text) from public, anon;
grant execute on function public.dispatch_ranger_alert(text,text,double precision,double precision,integer,text,text) to authenticated, service_role;
commit;
