/* Sign -> Speech: camera frames go to /api/sign/predict, text comes back, the browser reads it aloud. */
(() => {
  const $ = (s) => document.querySelector(s);
  const video = $("#cam"), camToggle = $("#camToggle"), camEmpty = $("#camEmpty"), chip = $("#handChip");
  const letterEl = $("#letter"), skel = $("#skeleton"), sentenceEl = $("#sentence"), suggEl = $("#suggestions"), notice = $("#notice");

  const sid = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2))
    .replace(/[^A-Za-z0-9_-]/g, "");
  const TARGET_W = 640;     // the CNN was trained on skeletons drawn from ~640px-wide webcam frames
  const INTERVAL = 150;     // ms between frames (a new one is only sent when the last answer is back)

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  let stream = null, running = false, inflight = false, timer = 0, failures = 0;

  function showNotice(msg, kind) {
    notice.textContent = msg || "";
    notice.dataset.kind = kind || "info";
    notice.hidden = !msg;
  }
  function setChip(text, on) { chip.textContent = text; chip.dataset.on = String(!!on); }

  async function post(url, body) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    let data = {};
    try { data = await res.json(); } catch (e) {}
    return { ok: res.ok, data };
  }

  /* ---------- camera ---------- */
  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showNotice("This browser can’t use the camera here. Open the site over HTTPS (or localhost).", "error");
      return;
    }
    camToggle.disabled = true;
    showNotice("Loading the recognition model… the first start can take a few seconds.");
    try {
      const health = await (await fetch("/api/health")).json();
      if (!health.sign_to_speech.ready) { showUnavailable(health.sign_to_speech.error); return; }

      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" }, audio: false
      });
      video.srcObject = stream;
      await video.play();
      running = true; failures = 0;
      camEmpty.hidden = true;
      camToggle.textContent = "Stop camera";
      setChip("Show your hand to the camera", false);
      showNotice("");
      schedule();
    } catch (e) {
      const msg = e && e.name === "NotAllowedError" ? "Camera permission was blocked. Allow it in the address bar and try again."
        : e && e.name === "NotFoundError" ? "No camera was found on this device."
        : "Couldn’t start the camera or reach the server.";
      showNotice(msg, "error");
    } finally {
      camToggle.disabled = false;
    }
  }

  function stopCamera() {
    running = false; clearTimeout(timer);
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null; video.srcObject = null;
    camEmpty.hidden = false;
    camToggle.textContent = "Start camera";
    setChip("Camera off", false);
    letterEl.textContent = "–"; letterEl.classList.remove("word");
    skel.hidden = true;
  }

  function showUnavailable(detail) {
    stopCamera();
    const reason = String(detail || "");
    if (/StringDType|numpy\.dtypes/i.test(reason)) {
      showNotice("The Python environment has incompatible NumPy and TensorFlow versions. Recreate it with Python 3.11, then reinstall requirements.txt (NumPy 1.26.4, TensorFlow/Keras 2.15).", "error");
      return;
    }
    showNotice("Sign recognition isn’t available on the server yet." + (reason ? " (" + reason + ")" : ""), "error");
  }

  /* ---------- frame loop ---------- */
  function schedule() { timer = setTimeout(tick, INTERVAL); }

  async function tick() {
    if (!running) return;
    if (!inflight && !document.hidden && video.readyState >= 2 && video.videoWidth) {
      inflight = true;
      try {
        const scale = Math.min(1, TARGET_W / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const { ok, data } = await post("/api/sign/predict", { session: sid, frame: canvas.toDataURL("image/jpeg", 0.8) });
        if (!ok) {
          if (data.error === "model_unavailable") { showUnavailable(data.detail); return; }
          failures++;
          if (failures >= 3) showNotice(data.message || "Recognition keeps failing. Check the server log.", "error");
        } else {
          failures = 0; showNotice(""); render(data);
        }
      } catch (e) {
        failures++;
        if (failures >= 3) showNotice("Lost connection to the server.", "error");
      } finally {
        inflight = false;
      }
    }
    if (running) schedule();
  }

  /* ---------- rendering ---------- */
  const SPECIAL = { " ": "space", "  ": "space", "next": "next", "Backspace": "backspace" };

  function render(d) {
    if (d.hand) {
      setChip("Hand detected", true);
      const l = d.letter;
      const special = l != null && SPECIAL[l];
      letterEl.textContent = special || (l && l.trim() ? l : "·");
      letterEl.classList.toggle("word", !!special);
      if (d.skeleton) { skel.src = d.skeleton; skel.hidden = false; }
    } else {
      setChip("Show your hand to the camera", false);
      letterEl.textContent = "–"; letterEl.classList.remove("word");
    }
    renderText(d);
  }

  function renderText(d) {
    const s = d.sentence || "";
    sentenceEl.textContent = s.trim() ? s : "";
    suggEl.innerHTML = "";
    (d.suggestions || []).forEach((w, i) => {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = w;
      b.addEventListener("click", () => act("suggest", i));
      suggEl.appendChild(b);
    });
  }

  /* ---------- buttons ---------- */
  async function act(action, index) {
    try {
      const { ok, data } = await post("/api/sign/action", { session: sid, action, index });
      if (ok) renderText(data);
      else showNotice(data.message || "That didn’t work.", "error");
    } catch (e) { showNotice("Lost connection to the server.", "error"); }
  }

  function speak() {
    const text = sentenceEl.textContent.trim();
    if (!text) { showNotice("No recognized text to speak yet. Add a letter or sign a letter first.", "info"); return; }
    if (!("speechSynthesis" in window)) { showNotice("This browser can’t read text aloud.", "error"); return; }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.toLowerCase());
    u.lang = "en-IN"; u.rate = 0.9;
    u.onerror = (event) => {
      const message = event.error === "synthesis-failed"
        ? "No working speech voice is available in this browser or on this device. Enable a system voice and try again."
        : `Speech output failed: ${event.error || "browser speech service error"}`;
      showNotice(message, "error");
    };
    speechSynthesis.speak(u);
  }

  camToggle.addEventListener("click", () => (running ? stopCamera() : startCamera()));
  $("#speakBtn").addEventListener("click", speak);
  $("#addBtn").addEventListener("click", () => act("add_letter"));
  $("#spaceBtn").addEventListener("click", () => act("space"));
  $("#backBtn").addEventListener("click", () => act("backspace"));
  $("#clearBtn").addEventListener("click", () => act("clear"));
  window.addEventListener("pagehide", () => { if (stream) stream.getTracks().forEach((t) => t.stop()); });
})();
