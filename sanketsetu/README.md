# SanketSetu

**Communication across Indian Sign Language (ISL), Hindi, and English — with a companion that remembers what helps.**

SanketSetu combines a two-way sign/speech prototype with **Setu**, a persistent-memory communication agent built with [Hindsight](https://hindsight.vectorize.io/). Setu recalls relevant earlier conversations before responding, then retains the user's message in the background so useful context can accumulate across visits.

## The hackathon story

A person should not have to repeat their communication preferences every time. Tell Setu once that you prefer short Hindi phrases, or explain a recurring conversation context. On a later visit, ask for help with a new situation: the app calls Hindsight `recall`, passes returned memories into Hindsight `reflect`, and retains the user's message in the background. The UI displays the recalled memories so judges can see the learning loop.

**Demo in 60 seconds:** open Memory Companion, say “Please keep phrases short and use simple Hindi; I communicate with my grandmother,” then ask “Help me explain that I will be late.” Refresh or return to the same browser and ask about a different situation. The browser-specific Hindsight bank preserves the context; background retention may take a short while to become searchable.

## Features

- **Speech → Sign** (`/speech-to-sign`): type or speak English/Hindi, create a content-word gloss with tense and question markers, and animate the small supported vocabulary set. This is not a full ISL grammar translator; unsupported terms are fingerspelled.
- **Sign → Speech** (`/sign-to-speech`): server-side camera recognition of ASL fingerspelling, sentence controls, and browser speech output. It does not recognize ISL signs; frames are processed by the selected deployment and are not saved.
- **Setu Memory Companion** (`/companion`): Hindsight-backed conversational support; per-browser memory bank, recall-before-response, reflect, and retain.
- Theme-aware landing page, local browser speech recognition, and optional MongoDB conversion history.

## Run locally

```bash
python3.11 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt -r requirements-vision.txt
cp .env.example .env
# Set HINDSIGHT_API_KEY in .env (and HINDSIGHT_BASE_URL if using a self-hosted instance)
python app.py
```

Open `http://127.0.0.1:5000`. `GET /api/companion/status` checks the Hindsight connection. Create a Hindsight Cloud account/API key at [Hindsight Cloud](https://ui.hindsight.vectorize.io), or use a compatible self-hosted endpoint. The default base URL is `https://api.hindsight.vectorize.io`.

### Local camera and voice troubleshooting

- Camera access requires opening the app at `http://127.0.0.1:5000` or over HTTPS and allowing camera access in the browser. Sign recognition needs MediaPipe plus the pinned NumPy 1.26.4 and TensorFlow/Keras 2.15 from `requirements-vision.txt`. Install both requirement files in a fresh Python 3.11 virtual environment.
- Voice input uses the browser's Speech Recognition API, which is supported best in current Chrome or Edge. Allow microphone access and keep an internet connection available for the browser speech service. If the browser does not support that API, use the text box and Translate button.

Without Hindsight configuration, both translator pages still work; the companion explains which environment variable is missing. The companion uses Hindsight's Python SDK and its bank `retain`, `recall`, and `reflect` operations. No separate Groq/OpenAI key is required when the Hindsight deployment provides Reflect.

## Architecture

- `memory_agent.py` owns one reusable Hindsight SDK client. It creates a stable bank ID derived from a random browser ID, recalls relevant memories, calls Reflect with the current request and separate context, then retains the user's message in a background thread.
- `POST /api/companion/respond` accepts a bounded message and browser ID. Each browser gets its own bank; it does not accept caller-supplied bank IDs.
- Hindsight API key and base URL are server-side environment variables. The browser stores only its random bank selector, not credentials.
- The original MongoDB history remains separate and optional; it is not the companion's memory layer.

## Important scope and limitations

Use [FREE_DEPLOYMENT_RENDER.md](FREE_DEPLOYMENT_RENDER.md) for the full-feature Docker deployment. [DEPLOYMENT_VERCEL_NETLIFY.md](DEPLOYMENT_VERCEL_NETLIFY.md) documents Vercel's text/companion-only setup and Netlify's proxy setup. The Render free plan disables server-side sign recognition because the TensorFlow/OpenCV stack exceeds the memory budget; use a larger instance for that feature.

- This is a communication support prototype, not a substitute for a fluent ISL interpreter. The speech-to-sign pipeline uses a simplified English grammar step and a limited vocabulary of avatar animations.
- The included camera model recognizes **ASL fingerspelling**, not ISL signs. Do not present its output as general ISL recognition.
- Browser speech recognition and camera access depend on browser support and HTTPS (or localhost). Hindi translation in the legacy grammar flow requires the optional translator dependency/service described in `app.py`.
- Memory is per browser installation and persists in the configured Hindsight bank. The companion has a “Forget my memory” action that deletes the browser's bank. Avoid entering sensitive personal or health details in a public demo.
- The included TensorFlow model and vision dependencies are large; free hosting plans may not have enough RAM for camera recognition.

## Hackathon alignment

| Judging area | What the demo shows |
|---|---|
| Innovation (30%) | A memory-enabled communication support workflow rather than generic chat. |
| Hindsight memory (25%) | Visible recall → reflect → retain loop and a repeat-visit learning demo. |
| Technical implementation (20%) | Flask API boundary, per-browser memory banks, bounded inputs, graceful unconfigured mode. |
| User experience (15%) | Dedicated companion UI that surfaces recalled context before/with the response. |
| Real-world impact (10%) | Reduces the need to repeatedly explain communication preferences and context. |

Hackathon content deliverables (article, social post, and video for each team member) are external submission tasks; this repository does not claim to have submitted them.
