import unittest

import cv2
import numpy as np

from clash_bot.perception.deployment_clocks import animated_clocks, clock_matches


class DeploymentClockTest(unittest.TestCase):
    def test_clock_template_does_not_match_flat_arena_or_ui_colors(self):
        template = np.full((28, 29, 3), [220, 50, 180], dtype=np.uint8)
        template[4:24, 6:22] = [240, 190, 70]
        template[9:20, 11:17] = [190, 40, 150]
        for color in ([0, 0, 0], [225, 180, 145], [235, 190, 70], [200, 40, 170]):
            self.assertEqual(
                clock_matches(np.full((652, 368, 3), color, dtype=np.uint8), template), []
            )
        pixels = np.zeros((652, 368, 3), dtype=np.uint8)
        pixels[390:418, 30:59] = template
        matches = clock_matches(pixels, template)
        self.assertEqual(len(matches), 1)
        self.assertEqual([matches[0]["x"], matches[0]["y"]], [44.5, 404.0])

    def test_changed_red_face_is_detected_but_blue_clock_and_red_health_bar_are_not(self):
        for angle in (0, 45, 135):
            pixels = np.full((652, 368, 3), [190, 140, 100], dtype=np.uint8)
            cv2.circle(pixels, (62, 365), 14, (35, 35, 35), -1)
            cv2.circle(pixels, (62, 365), 12, (245, 195, 35), -1)
            cv2.circle(pixels, (62, 365), 9, (215, 35, 55), -1)
            cv2.ellipse(pixels, (62, 365), (7, 7), angle, 0, 90, (185, 185, 185), -1)
            cv2.circle(pixels, (285, 425), 14, (35, 35, 35), -1)
            cv2.circle(pixels, (285, 425), 12, (245, 195, 35), -1)
            cv2.circle(pixels, (285, 425), 9, (20, 135, 230), -1)
            cv2.rectangle(pixels, (140, 395), (190, 403), (230, 30, 60), -1)
            # Gold/red body details: a small round decoration and an irregular
            # larger patch must not become hostile deployment warnings.
            cv2.circle(pixels, (225, 365), 9, (245, 195, 35), -1)
            cv2.circle(pixels, (225, 365), 5, (215, 35, 55), -1)
            cv2.rectangle(pixels, (205, 410), (230, 438), (245, 195, 35), -1)
            cv2.rectangle(pixels, (209, 414), (226, 434), (215, 35, 55), -1)
            clocks = animated_clocks(pixels)
            self.assertEqual(len(clocks), 1)
            self.assertLess(np.hypot(clocks[0]["x"] - 62, clocks[0]["y"] - 365), 3)
            self.assertEqual(clocks[0]["method"], "closed_yellow_rim_hostile_face")
