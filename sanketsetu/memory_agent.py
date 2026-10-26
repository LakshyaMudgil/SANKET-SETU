"""Hindsight-backed communication companion for SanketSetu."""
import asyncio
import os
import re
import threading

_client = None
_lock = threading.Lock()
_BANK = "sanketsetu-"
_known_banks = set()


def _get_client():
    global _client
    key = os.getenv("HINDSIGHT_API_KEY")
    if not key:
        raise RuntimeError("Memory companion is not configured yet. Add HINDSIGHT_API_KEY and restart the app.")
    with _lock:
        if _client is None:
            try:
                from hindsight_client import Hindsight
            except ImportError as exc:
                raise RuntimeError("Install the hindsight-client package to enable the memory companion.") from exc
            _client = Hindsight(
                base_url=os.getenv("HINDSIGHT_BASE_URL") or "https://api.hindsight.vectorize.io",
                api_key=key,
                timeout=45.0,
            )
    return _client


def _bank_id(user_id):
    if not re.fullmatch(r"[a-f0-9-]{32,36}", user_id):
        raise ValueError("Invalid browser ID")
    return _BANK + user_id.replace("-", "")


def _ensure_bank(client, bank_id):
    # A bank is stable per browser so learning persists across visits.
    with _lock:
        if bank_id in _known_banks:
            return
    try:
        client.create_bank(bank_id=bank_id, name="SanketSetu communication companion")
    except Exception as exc:
        # The SDK wraps HTTP errors with the response status; only tolerate a conflict.
        status = getattr(getattr(exc, "response", None), "status_code", None) or getattr(exc, "status_code", None)
        if status != 409:
            raise
    with _lock:
        _known_banks.add(bank_id)


def memory_status():
    global _status_checked
    configured = bool(os.getenv("HINDSIGHT_API_KEY"))
    ready = False
    if configured:
        try:
            client = _get_client()
            probe_bank = _BANK + "healthcheck"
            _ensure_bank(client, probe_bank)
            ready = True
        except Exception:
            ready = False
    return {
        "configured": ready,
        "provider": "Hindsight",
        "message": "Ready to learn from this browser's conversations." if ready else ("Hindsight could not be reached with this API key." if configured else "Add HINDSIGHT_API_KEY to enable persistent memory."),
    }


def respond(user_id, message):
    client = _get_client()
    bank = _bank_id(user_id)
    _ensure_bank(client, bank)
    # Recall explicitly before generating the response; this makes memory part of the agent loop.
    recalled = client.recall(bank_id=bank, query=message, budget="low")
    memories = [item.text for item in (getattr(recalled, "results", None) or []) if getattr(item, "text", "")]
    context = "\n".join(f"- {text}" for text in memories[:6]) or "No prior memories yet."
    instructions = (
        "You are Setu, SanketSetu's thoughtful communication companion for people who use Indian Sign Language (ISL), "
        "Hindi, or English. Be concise, warm, practical, and respectful. Do not claim that ASL fingerspelling is ISL. "
        "Help prepare clear phrases for conversations, explain the app's ISL gloss carefully, and ask when meaning is ambiguous. "
        "Use recalled context only when relevant. Never invent a user's preference. "
        "Reply naturally. If this is a preference or useful ongoing context, acknowledge it briefly so the user can correct you."
    )
    answer = client.reflect(bank_id=bank, query=message, context=instructions + "\nRelevant memories:\n" + context)
    reply = str(getattr(answer, "text", "")).strip()
    if not reply:
        raise RuntimeError("Hindsight returned an empty response. Please try again.")
    # Retain user messages off the response path; assistant output does not become memory.
    def retain_user_message():
        try:
            client.retain(bank_id=bank, content=message,
                          context="SanketSetu user communication companion message",
                          metadata={"source": "sanketsetu-companion", "kind": "user-message"})
        except Exception:
            import logging
            logging.getLogger("sanketsetu.memory").exception("Background memory retain failed")
    threading.Thread(target=retain_user_message, daemon=True).start()
    return {"reply": reply, "memories": memories[:4], "memory_used": bool(memories)}


def forget(user_id):
    client = _get_client()
    bank_id = _bank_id(user_id)
    # Hindsight exposes bank deletion on its async management API.
    asyncio.run(client.banks.delete_bank(bank_id=bank_id))
    with _lock:
        _known_banks.discard(bank_id)
