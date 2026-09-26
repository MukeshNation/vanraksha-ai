import unittest
from datetime import datetime, timezone
from pipeline.dispatch_live_alerts import detection_payload


class LiveDispatchTests(unittest.TestCase):
    def setUp(self):
        self.row = dict(latitude='30.1', longitude='78.5', acq_date='2026-09-26', acq_time='1000', confidence='h')
        self.now = datetime(2026, 9, 26, 12, tzinfo=timezone.utc)

    def payload(self, **changes):
        return detection_payload(self.row | changes, 'ZONE_NORTH', (78, 30, 79, 31), self.now)

    def test_real_recent_detection(self):
        self.assertEqual(self.payload()['p_confidence'], 'High')
        self.assertIn('field verification required', self.payload()['p_message'])

    def test_stable_duplicate_key(self):
        self.assertEqual(self.payload()['p_event_id'], self.payload()['p_event_id'])

    def test_old_future_low_confidence_and_outside_zone_skipped(self):
        for change in [dict(acq_date='2026-09-24'), dict(acq_date='2026-09-27'), dict(confidence='l'), dict(latitude='28'), dict(longitude='nan')]:
            self.assertIsNone(self.payload(**change))

    def test_zone_specific_delivery_key(self):
        other = detection_payload(self.row, 'ZONE_OTHER', (78, 30, 79, 31), self.now)
        self.assertNotEqual(self.payload()['p_event_id'], other['p_event_id'])


if __name__ == '__main__':
    unittest.main()

class GeofenceMatchingTests(unittest.TestCase):
    def test_circle_and_polygon_matching(self):
        from pipeline.dispatch_live_alerts import inside_fence, fence_bounds
        circle = dict(shape='circle', center=[78, 29], radius=1000)
        self.assertTrue(inside_fence(circle, [78, 29]))
        self.assertFalse(inside_fence(circle, [79, 29]))
        bounds = fence_bounds(circle)
        self.assertLess(bounds[0], 78)
        self.assertGreater(bounds[2], 78)
        polygon = dict(shape='polygon', vertices=[[0, 0], [2, 0], [0, 2]])
        self.assertTrue(inside_fence(polygon, [.2, .2]))
        self.assertFalse(inside_fence(polygon, [1.8, 1.8]))
