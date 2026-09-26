"""Dispatch fresh real FIRMS detections. Never imports mock calibration data."""
import argparse
import csv
import hashlib
import io
import json
import math
import os
import time
from datetime import datetime, timezone
from urllib.request import Request, urlopen

SOURCE = 'VIIRS_SNPP_NRT'


def detection_payload(row, zone, bbox, now=None):
    now = now or datetime.now(timezone.utc)
    lat, lng = float(row['latitude']), float(row['longitude'])
    west, south, east, north = bbox
    if not (math.isfinite(lat) and math.isfinite(lng) and south <= lat <= north and west <= lng <= east):
        return None
    acquired = datetime.strptime(row['acq_date'] + row['acq_time'].zfill(4), '%Y-%m-%d%H%M').replace(tzinfo=timezone.utc)
    age = (now - acquired).total_seconds()
    confidence = {'n': 'Medium', 'h': 'High'}.get(row['confidence'].lower())
    if not confidence or age < 0 or age > 86400:
        return None
    key = hashlib.sha256(f'{SOURCE}|{zone}|{acquired.isoformat()}|{lat:.5f}|{lng:.5f}'.encode()).hexdigest()
    return dict(p_zone=zone, p_lat=lat, p_lng=lng, p_radius=500, p_confidence=confidence,
                p_message=f'Automatic satellite detection: NASA FIRMS {SOURCE}, acquired {acquired.isoformat()}. Potential fire; field verification required.',
                p_event_id='firms:' + key)


def fetch_detections(key, bbox):
    area = ','.join(str(value) for value in bbox)
    url = f'https://firms.modaps.eosdis.nasa.gov/api/area/csv/{key}/{SOURCE}/{area}/2'
    with urlopen(url, timeout=30) as response:
        reader = csv.DictReader(io.StringIO(response.read().decode('utf-8')))
        required = {'latitude', 'longitude', 'acq_date', 'acq_time', 'confidence'}
        if not required.issubset(reader.fieldnames or []):
            raise ValueError('FIRMS returned invalid data; no alerts sent.')
        return list(reader)


def send(payload, base_url, secret):
    request = Request(base_url.rstrip('/') + '/rest/v1/rpc/dispatch_ranger_alert',
                      data=json.dumps(payload).encode(), method='POST',
                      headers={'Content-Type': 'application/json', 'apikey': secret, 'Authorization': 'Bearer ' + secret})
    with urlopen(request, timeout=30) as response:
        return json.load(response)


def inside_fence(fence, point):
    lng, lat = point
    if fence['shape'] == 'circle':
        x, y = fence['center']
        h = math.sin(math.radians(lat-y)/2)**2 + math.cos(math.radians(y))*math.cos(math.radians(lat))*math.sin(math.radians(lng-x)/2)**2
        return 12742000 * math.asin(math.sqrt(min(1, h))) <= fence['radius']
    vertices = fence['vertices']
    inside = False
    for i, (x, y) in enumerate(vertices):
        a, b = vertices[i-1]
        if (y > lat) != (b > lat) and lng < (a-x)*(lat-y)/(b-y)+x:
            inside = not inside
    return inside


def fence_bounds(fence):
    if fence['shape'] == 'circle':
        x, y = fence['center']
        dy = math.degrees(fence['radius'] / 6371000)
        dx = math.degrees(math.asin(min(1, math.sin(fence['radius'] / 6371000) / math.cos(math.radians(y)))))
        return (max(-180, x-dx), max(-90, y-dy), min(180, x+dx), min(90, y+dy))
    vertices = fence['vertices']
    return (min(p[0] for p in vertices), min(p[1] for p in vertices), max(p[0] for p in vertices), max(p[1] for p in vertices))


def load_fences(path):
    with open(path) as source:
        fences = json.load(source)
    if not isinstance(fences, list) or not fences:
        raise ValueError('Export at least one saved area')
    for fence in fences:
        def point(p):
            return isinstance(p, list) and len(p) == 2 and all(isinstance(n, (int, float)) and math.isfinite(n) for n in p) and abs(p[0]) <= 180 and abs(p[1]) <= 85
        if not isinstance(fence.get('zone'), str) or not 1 <= len(fence['zone'].strip()) <= 100:
            raise ValueError('Invalid assigned zone')
        if not isinstance(fence.get('name'), str) or not 1 <= len(fence['name'].strip()) <= 100:
            raise ValueError('Invalid area name')
        if fence.get('shape') == 'circle':
            if not point(fence.get('center')) or not isinstance(fence.get('radius'), (int, float)) or not 100 <= fence['radius'] <= 10000:
                raise ValueError('Invalid circle')
        elif fence.get('shape') == 'polygon':
            if len(fence.get('vertices', [])) < 3 or not all(point(p) for p in fence['vertices']):
                raise ValueError('Invalid polygon')
        else:
            raise ValueError('Invalid boundary shape')
        if not isinstance(fence.get('rules', {}).get('fire'), bool):
            raise ValueError('Invalid fire rule')
    return fences


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--zone', help='Exact ranger zone ID')
    parser.add_argument('--bbox', help='Assigned zone bounds: west,south,east,north')
    parser.add_argument('--geofences', help='JSON exported from Forest Geofences; replaces --zone and --bbox')
    parser.add_argument('--send', action='store_true', help='Persist real alerts; otherwise preview only')
    parser.add_argument('--watch', action='store_true', help='Check every 15 minutes while this process runs')
    args = parser.parse_args()
    if args.geofences:
        if args.zone or args.bbox:
            parser.error('Use --geofences alone, or --zone with --bbox')
        fences = load_fences(args.geofences)
        targets = [(f['zone'], fence_bounds(f), f) for f in fences if f['rules']['fire']]
    else:
        if not args.zone or not args.bbox:
            parser.error('Provide --geofences, or both --zone and --bbox')
        bbox = tuple(float(value) for value in args.bbox.split(','))
        if len(bbox) != 4 or not (-180 <= bbox[0] < bbox[2] <= 180 and -90 <= bbox[1] < bbox[3] <= 90):
            parser.error('Provide valid west,south,east,north bounds')
        targets = [(args.zone, bbox, None)]
    key = os.environ.get('FIRMS_MAP_KEY')
    url, secret = os.environ.get('SUPABASE_URL'), os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
    if not key or (args.send and (not url or not secret)):
        parser.error('Set FIRMS_MAP_KEY; sending also requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server.')
    while True:
        try:
            # Validate all target batches before making any writes.
            unique = {}
            for zone, bbox, fence in targets:
                for row in fetch_detections(key, bbox):
                    payload = detection_payload(row, zone, bbox)
                    if payload and (fence is None or inside_fence(fence, [payload['p_lng'], payload['p_lat']])):
                        if fence:
                            payload['p_message'] = fence['name'] + ': ' + payload['p_message']
                        unique[payload['p_event_id']] = payload
            payloads = list(unique.values())
            for payload in payloads:
                if args.send:
                    print('Saved/existing alert:', send(payload, url, secret), flush=True)
                else:
                    print(json.dumps(payload), flush=True)
            print(f'{len(payloads)} qualifying detections. Mode: {"send" if args.send else "preview"}', flush=True)
        except Exception as error:
            # URLs can contain the FIRMS key: do not log raw network exceptions.
            print(f'Detection sync failed ({type(error).__name__}). Check credentials, service availability and schema. No mock fallback used.', flush=True)
            if not args.watch:
                raise SystemExit(1) from None
        if not args.watch:
            break
        time.sleep(900)


if __name__ == '__main__':
    main()
