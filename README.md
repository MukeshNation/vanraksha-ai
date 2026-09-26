# VanRaksha_AI
VanRaksha_AI a powerfull AI Intelligence system to protect forest.

### Ranger login and dashboard

Run `npm ci` and `npm run dev`, then open `/login.html`. Both the login and
ranger dashboard are Vite build entries, so `npm run build` followed by
`npm run preview` also serves them with bundled scripts and styles.

A signed-in ranger needs an accessible row in the Supabase `rangers` table
whose `email` matches the account email and whose `zone_id` is assigned.
If the dashboard shows “Ranger setup required”, an administrator should check
that record and the table's access policies. Do not disable row-level security
or assign a default zone in the browser to work around missing access.
Pending alerts are read from `alerts` for the assigned zone.

Dashboard startup regression checks: `node --test tests/ranger-dashboard.test.mjs`.

### Manual dispatch and ranger notifications

Open the field desk and select **Send Ranger Alert**. The form sends a message,
coordinates, confidence and radius to all rangers with the exact zone ID.
Before live sending:

1. Run `supabase/ranger-alerts.sql` in your project's Supabase SQL editor.
   This extends the existing `alerts` table and creates an authorized dispatch RPC.
2. Assign the sending account `app_metadata.role = "dispatcher"` (or `"admin"`)
   using trusted Supabase administration. User-editable `user_metadata` is not used.
   Sign in again after updating the role.
3. Check the recipient's `rangers.email` and `zone_id`, and existing RLS policies
   so that recipients can read their profile and their zone's alerts. The migration
   does not disable RLS or broaden existing ranger read/update permissions.

The ranger inbox checks every 15 seconds while open, displays the message and
pending count, and provides manual refresh. **Enable notifications** requests
browser notification permission. In-app notices work without that permission.
Closed-browser push, SMS and WhatsApp delivery are not implemented. Background
browser timers may be throttled; returning to the tab triggers a refresh.
A successful send means the alert was saved, not that a ranger read it.

### Automatic detection dispatch

`pipeline/dispatch_live_alerts.py` polls actual NASA FIRMS VIIRS data, without the
calibration pipeline's mock fallback. It sends recent (last 24 hours) nominal/high
confidence detections within the configured zone bounds for field verification.
This is satellite-detection automation, not a deployed AI classifier. The existing
prototype AI scoring uses random covariates and is deliberately not used for dispatch.
API reference: https://firms.modaps.eosdis.nasa.gov/api/area/

Set `FIRMS_MAP_KEY` in the server environment. Live writes additionally require
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; keep the service key on the server,
never in frontend code or a `VITE_` environment variable. Configure the exact zone
and its actual bounds; do not use example bounds for operational dispatch.

```sh
# Replace the zone and bounds with the actual assigned area. Preview only:
python3 pipeline/dispatch_live_alerts.py --zone YOUR_ZONE --bbox WEST,SOUTH,EAST,NORTH
# Persist alerts and repeat every 15 minutes while this server process is running:
python3 pipeline/dispatch_live_alerts.py --zone YOUR_ZONE --bbox WEST,SOUTH,EAST,NORTH --send --watch
```

A database dispatch key prevents re-sending the same satellite observation to the
same zone. Network failures stop the current batch; the next check can safely retry.
Run the watcher on a persistent server for ongoing operation. No watcher is deployed
or started automatically by the frontend.

Verification: `node --test tests/*.test.mjs`,
`python3 -m unittest discover -s tests -p 'test_*.py'`, and `npm run build`.

### Forest geofence workspace

Open `/#geofences` (also linked from the main navigation and ranger dashboard).
Name an area, enter its ranger zone ID and choose a circle or polygon. Circle
placement and polygon vertices are editable by clicking the map in drawing mode.
Coordinates use `latitude, longitude` in the location field. Save stores the area
in this browser; no database write or live monitoring is implied by saving.
The fire-rule preview is local and does not send an alert. Manual messages use
the existing authorized dispatch RPC and its zone-based delivery.

Export saved areas, then configure the actual detection worker with that file:

```sh
# Preview qualifying live detections inside the exported circles/polygons:
python3 pipeline/dispatch_live_alerts.py --geofences /path/to/forest-geofences.json
# Run on a configured server to save matching alerts continuously:
python3 pipeline/dispatch_live_alerts.py --geofences /path/to/forest-geofences.json --send --watch
```

Only areas with the fire rule enabled are monitored by this worker. Entry/exit
preferences are saved for future tracking integration; no GPS/device feed is
connected and those preferences do not currently generate automatic alerts.
Re-export and restart the worker after changing saved boundaries or rules.
