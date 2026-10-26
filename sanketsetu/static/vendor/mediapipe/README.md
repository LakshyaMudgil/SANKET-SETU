Browser hand tracking uses MediaPipe Tasks Vision 0.10.21 (Apache-2.0), vendored from https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/. The gesture recognizer model is the float16 v1 model from https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task.

The assets are served locally so tracking does not depend on a third-party CDN at runtime. Supported gestures are the standard MediaPipe canned gesture categories; this model does not recognize a sign-language alphabet or translate a sign language.
