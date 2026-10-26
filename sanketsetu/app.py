"""
SanketSetu - one Flask app for both directions:

  /                 home page (home.html)
  /speech-to-sign   speech/text -> ISL gloss -> 3D avatar        (the old avatar-app)
  /sign-to-speech   browser camera -> letters -> sentence -> voice (the old Sign-Language-To-Text project)

Heavy dependencies (spaCy, TensorFlow/Keras, MediaPipe) are loaded lazily, so one half
of the site keeps working even if the other half's packages aren't installed yet.
"""
import base64
import logging
import os
import re
import threading
from collections import OrderedDict, deque
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request

try:
    from flask_cors import CORS
except ImportError:  # same-origin deployment doesn't need CORS
    CORS = None

try:
    from flask_limiter import Limiter
    from flask_limiter.util import get_remote_address
except ImportError:
    Limiter = None
    get_remote_address = None

try:
    from pymongo import MongoClient
    from bson.objectid import ObjectId
except ImportError:  # history is optional
    MongoClient = None
    ObjectId = None

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("sanketsetu")
logging.getLogger("pymongo").setLevel(logging.WARNING)

load_dotenv()
BASE_DIR = Path(__file__).parent

# --------------------------------------------------------------------------------------
# History storage (MongoDB, optional - unchanged behaviour from the avatar app)
# --------------------------------------------------------------------------------------
MONGO_URI = os.getenv("MONGO_URI")
client = None
histories_collection = None

if MONGO_URI and MongoClient is not None:
    client = MongoClient(MONGO_URI, connectTimeoutMS=30000)
    histories_collection = client["history"]["histories"]
    logger.info("MongoDB configured.")
else:
    logger.info("MongoDB disabled (set MONGO_URI to enable history).")

# --------------------------------------------------------------------------------------
# NLP for Speech -> ISL (spaCy loaded on first use)
# --------------------------------------------------------------------------------------
_nlp = None
_nlp_lock = threading.Lock()


def get_nlp():
    global _nlp
    with _nlp_lock:
        if _nlp is None:
            import spacy

            _nlp = spacy.load("en_core_web_sm")
    return _nlp


# --------------------------------------------------------------------------------------
# Flask app
# --------------------------------------------------------------------------------------
app = Flask(__name__, template_folder="templates", static_folder="static")
app.config["MAX_CONTENT_LENGTH"] = 4 * 1024 * 1024  # camera frames are ~50 KB; this is just a safety net
if CORS is not None:
    allowed_origins = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "").split(",") if origin.strip()]
    if allowed_origins:
        CORS(app, resources={r"/api/*": {"origins": allowed_origins}})
limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=[],
    storage_uri=os.getenv("RATELIMIT_STORAGE_URI"),
) if Limiter else None

# Text recognised by an external script (sanketsetu_avatar.py) waiting for the avatar page to pick it up
sanketsetu_queue = deque(maxlen=20)


# ------------------------------- pages ------------------------------------------------
@app.route("/")
def home():
    return render_template("home.html")


@app.route("/speech-to-sign")
def speech_to_sign():
    return render_template("speech_to_sign.html")


@app.route("/sign-to-speech")
def sign_to_speech():
    return render_template("sign_to_speech.html")


@app.route("/companion")
def companion():
    return render_template("companion.html")


@app.route("/api/companion/status")
def companion_status():
    from memory_agent import memory_status
    return jsonify(memory_status())


@app.route("/api/companion/respond", methods=["POST"])
@limiter.limit("10 per minute") if limiter else (lambda fn: fn)
def companion_respond():
    data = request.get_json(silent=True) or {}
    message = str(data.get("message", "")).strip()
    user_id = str(data.get("user_id", ""))
    if not re.fullmatch(r"[a-f0-9-]{32,36}", user_id) or not message or len(message) > 1200:
        return jsonify({"error": "Please provide a message (up to 1,200 characters) and a valid browser ID."}), 400
    try:
        from memory_agent import respond
        return jsonify(respond(user_id, message))
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 503
    except Exception:
        logger.exception("Communication companion failed")
        return jsonify({"error": "The companion could not respond. Check Hindsight configuration and try again."}), 502


@app.route("/api/companion/forget", methods=["POST"])
@limiter.limit("3 per hour") if limiter else (lambda fn: fn)
def companion_forget():
    data = request.get_json(silent=True) or {}
    user_id = str(data.get("user_id", ""))
    if not re.fullmatch(r"[a-f0-9-]{32,36}", user_id):
        return jsonify({"error": "A valid browser ID is required."}), 400
    try:
        from memory_agent import forget
        forget(user_id)
        return jsonify({"message": "Your Setu memory bank was deleted."})
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 503
    except Exception:
        logger.exception("Could not delete companion memory bank")
        return jsonify({"error": "Could not delete this memory bank. Please try again."}), 502



# ======================================================================================
# SPEECH -> SIGN
# ======================================================================================
CONTRACTIONS = {
    "i'm": "i am", "you're": "you are", "he's": "he is", "she's": "she is",
    "it's": "it is", "we're": "we are", "they're": "they are",
    "i've": "i have", "you've": "you have", "we've": "we have", "they've": "they have",
    "i'll": "i will", "you'll": "you will", "he'll": "he will", "she'll": "she will",
    "we'll": "we will", "they'll": "they will", "it'll": "it will",
    "isn't": "is not", "aren't": "are not", "wasn't": "was not", "weren't": "were not",
    "haven't": "have not", "hasn't": "has not", "hadn't": "had not",
    "won't": "will not", "wouldn't": "would not", "don't": "do not", "doesn't": "does not",
    "didn't": "did not", "can't": "cannot", "couldn't": "could not", "shouldn't": "should not",
    "mightn't": "might not", "mustn't": "must not",
}
_CONTRACTIONS_RE = re.compile(
    r"\b(" + "|".join(re.escape(k) for k in CONTRACTIONS) + r")\b", re.IGNORECASE
)
DEVANAGARI = re.compile(r"[\u0900-\u097F]")


def expand_contractions(text):
    """Expands contractions in the given text while preserving capitalization."""

    def replace(match):
        word = match.group(0).lower()
        expanded = CONTRACTIONS.get(word, word)
        return expanded.capitalize() if match.group(0)[0].isupper() else expanded

    return _CONTRACTIONS_RE.sub(replace, text)


def preprocess_text(text):
    """Normalize input while retaining a gloss marker for question punctuation."""
    text = text.lower().strip()
    text = expand_contractions(text)
    asks_question = "?" in text
    text = re.sub(r"\b(\d{1,2}):00\b", r"\1", text)  # 7:00 -> 7
    text = re.sub(r"\b(\d{1,2}):(\d{1,2})\b", r"\1 \2", text)  # 10:30 -> 10 30
    text = re.sub(r"[^\w\s]", "", text)
    if asks_question:
        text = (text + " QUESTION").strip()
    return text


def extract_isl_structure_spacy(text):
    """
    Converts each word in the input sentence to its base form and removes unnecessary words.
    Also identifies tense markers and preserves directional words. This is a content-word gloss,
    not a syntactic ISL word-order parser.
    """
    doc = get_nlp()(text)
    important_words = []
    tense_marker = ""

    keep_words = {"left", "right", "back", "straight", "forward", "up", "down", "near",
                  "next", "beside", "in", "on", "under", "from", "to"}

    for token in doc:
        if token.text.lower() in keep_words:
            important_words.append(token.text.lower())
            continue

        if token.pos_ in ["AUX"] and token.lemma_ in ["be", "do", "have", "will"]:
            if token.lemma_ == "will":
                tense_marker = "FUTURE"
            continue

        if token.pos_ in ["DET", "ADP"]:
            continue

        if token.tag_ in ["VBD", "VBN"]:
            tense_marker = "PAST"
            important_words.append(token.lemma_)
        else:
            important_words.append(token.lemma_)

    if tense_marker:
        important_words.append(tense_marker)

    return " ".join(important_words) if important_words else text


def to_english(text):
    """
    The ISL grammar step is English-only (spaCy en_core_web_sm). Hindi (Devanagari) input is translated
    first if the optional `deep-translator` package is installed (it calls an online service).
    Returns (english_text, error_message).
    """
    if not DEVANAGARI.search(text):
        return text, None
    try:
        from deep_translator import GoogleTranslator

        return GoogleTranslator(source="hi", target="en").translate(text), None
    except ImportError:
        return None, ("Hindi input needs the optional 'deep-translator' package "
                      "(pip install deep-translator) and an internet connection.")
    except Exception as e:  # network / service errors
        logger.error("Hindi translation failed: %s", e)
        return None, "Could not translate the Hindi text right now. Please try English or try again."


def text_to_isl(text):
    english, err = to_english(text)
    if err:
        return {"isl_structure": "", "original_text": text, "message": err, "error": True}, 422
    processed = preprocess_text(english)
    isl = extract_isl_structure_spacy(processed)
    return {
        "isl_structure": isl,
        "original_text": text,
        "translated_text": english if english != text else None,
        "message": "Text processed successfully",
        "error": False,
    }, 200


@app.route("/save_text", methods=["POST"])
def save_text():
    try:
        data = request.get_json(silent=True)
        if not data or "text" not in data:
            return jsonify({"isl_structure": "", "message": "No data provided", "error": True}), 400

        text = str(data.get("text", "")).strip()
        if not text:
            return jsonify({"isl_structure": "", "message": "No text provided", "error": True}), 400

        logger.info("Received text: %s", text)
        payload, status = text_to_isl(text)
        return jsonify(payload), status
    except ModuleNotFoundError as e:
        logger.error("Missing NLP dependency: %s", e)
        return jsonify({"isl_structure": "", "error": True,
                        "message": "The language model isn't installed on the server (spaCy en_core_web_sm)."}), 503
    except Exception as e:
        logger.exception("Error in save_text: %s", e)
        return jsonify({"isl_structure": "", "message": "Server error occurred", "error": True}), 500


# --- bridge used by the stand-alone microphone script (sanketsetu_avatar.py) -------------
@app.route("/sanketsetu/send", methods=["POST"])
def sanketsetu_send():
    token = os.getenv("SANKETSETU_PAIRING_CODE")
    if not token or request.headers.get("X-Pairing-Code") != token:
        return jsonify({"error": "bridge_disabled_or_unauthorized"}), 404
    data = request.get_json(silent=True) or {}
    text = str(data.get("text", "")).strip()
    if not text:
        return jsonify({"error": "No text provided"}), 400

    sanketsetu_queue.append(text)
    result = {"message": "Text queued successfully", "original_text": text}
    try:  # the helper script prints these; fail soft if NLP isn't available
        payload, _ = text_to_isl(text)
        result["isl_structure"] = payload.get("isl_structure")
    except Exception:
        result["isl_structure"] = None
    return jsonify(result), 200


@app.route("/sanketsetu/next", methods=["GET"])
def sanketsetu_next():
    token = os.getenv("SANKETSETU_PAIRING_CODE")
    if not token or request.headers.get("X-Pairing-Code") != token:
        return jsonify({"error": "bridge_disabled_or_unauthorized"}), 404
    if sanketsetu_queue:
        return jsonify({"text": sanketsetu_queue.popleft()})
    return jsonify({"text": None})


# --- per-browser history ------------------------------------------------------------------
def _history_browser_id(value):
    value = str(value or "")
    return value if re.fullmatch(r"[a-f0-9-]{32,36}", value) else None

@app.route("/save_history", methods=["POST"])
def save_history():
    if histories_collection is None:
        return jsonify({"error": "History disabled for local testing"}), 503
    try:
        data = request.get_json()
        browser_id = _history_browser_id((data or {}).get("browser_id"))
        if not data or "original_text" not in data or "isl_text" not in data or not browser_id:
            return jsonify({"error": "Missing required fields"}), 400

        entry = {
            "browser_id": browser_id,
            "original_text": str(data["original_text"])[:2000],
            "isl_text": str(data["isl_text"])[:2000],
            "timestamp": datetime.now(timezone.utc),
        }
        result = histories_collection.insert_one(entry)
        return jsonify({"message": "History saved successfully", "id": str(result.inserted_id)}), 201
    except Exception as e:
        logger.error("Error saving history: %s", e)
        return jsonify({"error": "Server error saving history"}), 500


@app.route("/get_history", methods=["GET"])
def get_history():
    if histories_collection is None:
        return jsonify({"error": "History disabled for local testing"}), 503
    try:
        browser_id = _history_browser_id(request.args.get("browser_id"))
        if not browser_id:
            return jsonify({"error": "Valid browser_id required"}), 400
        entries = list(histories_collection.find({"browser_id": browser_id}).sort("timestamp", -1).limit(100))
        for entry in entries:
            entry["_id"] = str(entry["_id"])
        return jsonify(entries), 200
    except Exception as e:
        logger.error("Error fetching history: %s", e)
        return jsonify({"error": "Server error fetching history"}), 500


@app.route("/delete_history/<string:entry_id>", methods=["DELETE"])
def delete_history(entry_id):
    if histories_collection is None:
        return jsonify({"error": "History disabled for local testing"}), 503
    try:
        browser_id = _history_browser_id(request.args.get("browser_id"))
        if not browser_id:
            return jsonify({"error": "Valid browser_id required"}), 400
        result = histories_collection.delete_one({"_id": ObjectId(entry_id), "browser_id": browser_id})
        if result.deleted_count == 0:
            return jsonify({"error": "Entry not found"}), 404
        return jsonify({"message": "Entry deleted successfully"}), 200
    except Exception as e:
        logger.error("Error deleting history entry: %s", e)
        return jsonify({"error": "Invalid entry ID"}), 400


@app.route("/clear_history", methods=["DELETE"])
def clear_history():
    if histories_collection is None:
        return jsonify({"error": "History disabled for local testing"}), 503
    try:
        browser_id = _history_browser_id(request.args.get("browser_id"))
        if not browser_id:
            return jsonify({"error": "Valid browser_id required"}), 400
        result = histories_collection.delete_many({"browser_id": browser_id})
        return jsonify({"message": "History cleared successfully", "deleted_count": result.deleted_count}), 200
    except Exception as e:
        logger.error("Error clearing history: %s", e)
        return jsonify({"error": "Server error clearing history"}), 500


# ======================================================================================
# SIGN -> SPEECH  (camera frames from the browser -> CNN + landmark rules -> text)
# ======================================================================================
MODEL_PATH = Path(os.getenv("SIGN_MODEL_PATH", BASE_DIR / "models" / "cnn8grps_rad1_model.h5"))
MAX_SESSIONS = 20

_sign = {"model": None, "detector_factory": None, "error": None}
_sign_load_lock = threading.Lock()
_model_lock = threading.Lock()      # Keras predict() shared by all sessions
_infer_lock = threading.Lock()      # one frame at a time (single model, single process)
_engines = OrderedDict()            # session id -> SignEngine (least recently used first)
_engines_lock = threading.Lock()


class MediaPipeHandDetector:
    """Small cvzone-compatible adapter around the pinned legacy MediaPipe Hands API."""

    def __init__(self, maxHands=1):
        import mediapipe as mp
        self.detector = mp.solutions.hands.Hands(
            static_image_mode=False,
            max_num_hands=maxHands,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )

    def findHands(self, image, draw=False, flipType=True):
        import cv2
        height, width = image.shape[:2]
        rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        result = self.detector.process(rgb)
        hands = []
        for landmark_set in result.multi_hand_landmarks or []:
            points = []
            for index, landmark in enumerate(landmark_set.landmark):
                x = min(width - 1, max(0, int(landmark.x * width)))
                y = min(height - 1, max(0, int(landmark.y * height)))
                # cvzone's flipType changes the handedness label only; landmark
                # pixel coordinates stay in the input image's coordinate system.
                z = int(landmark.z * width)
                points.append([x, y, z])
            xs = [point[0] for point in points]
            ys = [point[1] for point in points]
            x0, y0 = min(xs), min(ys)
            hands.append({"lmList": points, "bbox": [x0, y0, max(xs) - x0, max(ys) - y0]})
        return hands, image


def load_sign_stack():
    """Load Keras model + hand detector once. Returns an error string, or None when ready."""
    with _sign_load_lock:
        if _sign["model"] is not None:
            return None
        if _sign["error"]:
            return _sign["error"]
        try:
            if not MODEL_PATH.exists():
                raise FileNotFoundError(f"Model file not found: {MODEL_PATH}")
            from keras.models import load_model
            import mediapipe  # noqa: F401 -- fail here with a clear model-unavailable status

            _sign["model"] = load_model(str(MODEL_PATH), compile=False)
            _sign["detector_factory"] = lambda: MediaPipeHandDetector(maxHands=1)
            logger.info("Sign model loaded from %s", MODEL_PATH)
            return None
        except Exception as e:
            _sign["error"] = f"{type(e).__name__}: {e}"
            logger.error("Sign recognition unavailable: %s", _sign["error"])
            return _sign["error"]


def get_engine(session_id):
    from sign_engine import SignEngine

    with _engines_lock:
        engine = _engines.pop(session_id, None)
        if engine is None:
            engine = SignEngine(_sign["model"], _model_lock, _sign["detector_factory"])
        _engines[session_id] = engine
        while len(_engines) > MAX_SESSIONS:
            _engines.popitem(last=False)
        return engine


def _clean_session(value):
    value = str(value or "")
    return value if re.fullmatch(r"[A-Za-z0-9_-]{8,64}", value) else None


def _decode_frame(data_url):
    import cv2
    import numpy as np

    if "," in data_url:
        data_url = data_url.split(",", 1)[1]
    raw = base64.b64decode(data_url, validate=False)
    frame = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
    if frame is None:
        raise ValueError("Could not decode image")
    return frame


@app.route("/api/health")
def health():
    """Lets the Sign -> Speech page tell the user what's wrong instead of failing silently."""
    if os.getenv("SIGN_TO_SPEECH_ENABLED", "true").lower() not in {"1", "true", "yes"}:
        return jsonify({"sign_to_speech": {"ready": False, "error": "Server-side sign recognition is disabled on this deployment plan."},
                        "history": histories_collection is not None})
    err = load_sign_stack()
    return jsonify({
        "sign_to_speech": {"ready": err is None, "error": err},
        "history": histories_collection is not None,
    })


@app.route("/api/sign/predict", methods=["POST"])
def sign_predict():
    if os.getenv("SIGN_TO_SPEECH_ENABLED", "true").lower() not in {"1", "true", "yes"}:
        return jsonify({"error": "model_unavailable", "message": "Sign recognition is disabled on this deployment."}), 503
    data = request.get_json(silent=True) or {}
    sid = _clean_session(data.get("session"))
    frame_data = data.get("frame")
    if not sid or not frame_data:
        return jsonify({"error": "bad_request", "message": "Missing session or frame"}), 400

    err = load_sign_stack()
    if err:
        return jsonify({"error": "model_unavailable",
                        "message": "Sign recognition isn't available on the server yet.",
                        "detail": err}), 503
    try:
        frame = _decode_frame(frame_data)
    except Exception:
        return jsonify({"error": "bad_frame", "message": "Could not read the camera frame"}), 400

    try:
        engine = get_engine(sid)
        with _infer_lock:
            result = engine.process_frame(frame)
        return jsonify(result)
    except Exception as e:
        logger.exception("Sign prediction failed: %s", e)
        return jsonify({"error": "predict_failed", "message": "Recognition failed for this frame"}), 500


@app.route("/api/sign/action", methods=["POST"])
def sign_action():
    if os.getenv("SIGN_TO_SPEECH_ENABLED", "true").lower() not in {"1", "true", "yes"}:
        return jsonify({"error": "model_unavailable", "message": "Sign recognition is disabled on this deployment."}), 503
    data = request.get_json(silent=True) or {}
    sid = _clean_session(data.get("session"))
    action = data.get("action")
    if not sid or action not in {"clear", "backspace", "space", "add_letter", "suggest"}:
        return jsonify({"error": "bad_request", "message": "Unknown action"}), 400

    err = load_sign_stack()
    if err:
        return jsonify({"error": "model_unavailable", "message": "Sign recognition isn't available yet.",
                        "detail": err}), 503

    engine = get_engine(sid)
    with _infer_lock:
        if action == "clear":
            engine.clear()
        elif action == "backspace":
            engine.backspace()
        elif action == "space":
            engine.add_space()
        elif action == "add_letter":
            engine.add_current_letter()
        elif action == "suggest":
            try:
                engine.apply_suggestion(int(data.get("index", -1)))
            except (TypeError, ValueError):
                pass
        return jsonify(engine._state())


if __name__ == "__main__":
    app.run(debug=os.getenv("FLASK_DEBUG", "false").lower() in {"1", "true", "yes"})
