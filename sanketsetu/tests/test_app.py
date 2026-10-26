import unittest
from types import SimpleNamespace
from unittest.mock import patch

import app
import memory_agent
import numpy as np


class GlossTests(unittest.TestCase):
    def test_question_marker_survives_normalization(self):
        self.assertEqual(app.preprocess_text("Are you ready?"), "are you ready QUESTION")


class MediaPipeHandDetectorTests(unittest.TestCase):
    def test_bbox_uses_landmark_pixel_x_and_y(self):
        detector = app.MediaPipeHandDetector.__new__(app.MediaPipeHandDetector)
        landmarks = [
            SimpleNamespace(x=0.1, y=0.2, z=-0.4),
            SimpleNamespace(x=0.7, y=0.8, z=0.1),
            SimpleNamespace(x=0.25, y=0.4, z=0.0),
        ]
        detector.detector = SimpleNamespace(
            process=lambda _image: SimpleNamespace(
                multi_hand_landmarks=[SimpleNamespace(landmark=landmarks)]
            )
        )

        hands, _ = detector.findHands(np.zeros((100, 200, 3), dtype=np.uint8))

        self.assertEqual(hands[0]["bbox"], [20, 20, 120, 60])


class CompanionValidationTests(unittest.TestCase):
    def setUp(self):
        app.app.config.update(TESTING=True)
        self.client = app.app.test_client()

    def test_rejects_invalid_browser_id(self):
        response = self.client.post("/api/companion/respond", json={"user_id": "bad", "message": "Hello"})
        self.assertEqual(response.status_code, 400)

    def test_rejects_empty_or_oversized_message(self):
        user_id = "12345678-1234-1234-1234-123456789abc"
        self.assertEqual(self.client.post("/api/companion/respond", json={"user_id": user_id, "message": "  "}).status_code, 400)
        self.assertEqual(self.client.post("/api/companion/respond", json={"user_id": user_id, "message": "x" * 1201}).status_code, 400)


class BankIdTests(unittest.TestCase):
    def test_bank_id_is_derived_from_valid_browser_id(self):
        self.assertEqual(memory_agent._bank_id("12345678-1234-1234-1234-123456789abc"), "sanketsetu-12345678123412341234123456789abc")

    def test_bank_id_rejects_invalid_browser_id(self):
        with self.assertRaises(ValueError):
            memory_agent._bank_id("not-a-uuid")


if __name__ == "__main__":
    unittest.main()
