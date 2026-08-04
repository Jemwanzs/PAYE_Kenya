-- Lets a tenant (business owner) require, for their EMPLOYEES only,
-- that portal logins happen within a set time window and/or within a
-- set radius of a chosen location. Both are opt-in toggles, off by
-- default -- existing tenants see no change until they turn one on in
-- Settings.
--
-- Deliberately never applies to the owner's own login, even when both
-- are switched on. These are controls an owner places on their team,
-- not on themselves -- and since only the owner can reach Settings to
-- configure or disable them, blocking the owner's own account here
-- would risk a permanent self-lockout with no way back in (there's no
-- "second owner" to undo it, unlike the platform-admin block feature,
-- which explicitly guards against the same class of mistake for the
-- admin's own account).
--
-- The time check runs against the database's own clock (not anything
-- client-supplied), so it can't be defeated by changing a device's
-- system clock. The geofence check can only ever work from whatever
-- coordinates the browser reports, which is inherently something the
-- client controls -- like every other client-side gate in this app
-- (idle logout, report passcode), this is a policy/deterrent control,
-- not a hard security boundary.
--
-- Safe to run against the live project (additive only).

alter table public.payroll_settings
  add column if not exists login_window_enabled boolean not null default false,
  add column if not exists login_window_start time not null default '08:00',
  add column if not exists login_window_end time not null default '18:00',
  add column if not exists login_geofence_enabled boolean not null default false,
  add column if not exists login_geofence_latitude numeric,
  add column if not exists login_geofence_longitude numeric,
  add column if not exists login_geofence_radius_meters numeric not null default 500;

-- Called by the client right after password auth succeeds (before the
-- OTP code is even sent -- no point emailing a code to someone who's
-- about to be blocked anyway). p_latitude/p_longitude/p_location_status
-- come from the browser's own geolocation result, same shape as
-- session_logs. Always returns exactly one row.
create or replace function public.check_login_security(p_latitude numeric, p_longitude numeric, p_location_status text)
returns table(allowed boolean, reason text)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_role text;
  v_owner_user_id uuid;
  v_settings record;
  v_now_time time;
  v_in_window boolean;
  v_distance_m numeric;
begin
  select p.role, coalesce(p.owner_user_id, p.id) into v_role, v_owner_user_id
  from public.profiles p where p.id = auth.uid();

  if v_role is distinct from 'employee' then
    return query select true, null::text;
    return;
  end if;

  select * into v_settings from public.payroll_settings where user_id = v_owner_user_id;
  if v_settings is null then
    return query select true, null::text;
    return;
  end if;

  if v_settings.login_window_enabled then
    v_now_time := (now() at time zone 'Africa/Nairobi')::time;
    if v_settings.login_window_start <= v_settings.login_window_end then
      v_in_window := v_now_time between v_settings.login_window_start and v_settings.login_window_end;
    else
      -- Overnight window (e.g. 22:00 -> 06:00).
      v_in_window := v_now_time >= v_settings.login_window_start or v_now_time <= v_settings.login_window_end;
    end if;
    if not v_in_window then
      return query select false, format(
        'Logins are only allowed between %s and %s (East Africa Time).',
        to_char(v_settings.login_window_start, 'HH24:MI'),
        to_char(v_settings.login_window_end, 'HH24:MI')
      );
      return;
    end if;
  end if;

  if v_settings.login_geofence_enabled then
    if p_location_status is distinct from 'granted' or p_latitude is null or p_longitude is null then
      return query select false, 'This business requires your device location to log in, and it was not available. Enable location access in your browser and try again.';
      return;
    end if;

    -- Haversine distance in meters.
    v_distance_m := 6371000 * acos(
      greatest(-1, least(1,
        cos(radians(v_settings.login_geofence_latitude)) * cos(radians(p_latitude)) *
        cos(radians(p_longitude) - radians(v_settings.login_geofence_longitude)) +
        sin(radians(v_settings.login_geofence_latitude)) * sin(radians(p_latitude))
      ))
    );

    if v_distance_m > v_settings.login_geofence_radius_meters then
      return query select false, format(
        'You are outside the allowed login area for this business (%s m away, %s m allowed).',
        round(v_distance_m)::text,
        round(v_settings.login_geofence_radius_meters)::text
      );
      return;
    end if;
  end if;

  return query select true, null::text;
end;
$$;

grant execute on function public.check_login_security(numeric, numeric, text) to authenticated;
