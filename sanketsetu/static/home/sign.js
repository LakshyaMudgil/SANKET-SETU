// MediaPipe runs locally: no camera frames leave the browser.
const $ = (id) => document.getElementById(id);
const video = $('cam'), button = $('camToggle'), overlay = $('handOverlay'), skeleton = $('skeleton');
const notice = $('notice'), letter = $('letter'), sentence = $('sentence'), chip = $('handChip');
let stream, recognizer, running = false, generation = 0, timer, lastTime = -1, current = '';
let candidate = '', candidateSince = 0, committed = '', releasedSince = null;

function resetCapture() {
  candidate = committed = '';
  candidateSince = 0;
  releasedSince = null;
}

function speak(text) {
  if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
    message('Speech output is unavailable in this browser. Your text is still available.', 'error');
    return;
  }
  window.speechSynthesis.cancel();
  const speech = new window.SpeechSynthesisUtterance(text);
  speech.lang = 'en-IN';
  speech.onerror = (event) => {
    if (!['canceled', 'interrupted'].includes(event.error)) {
      message('Speech output failed. Tap Speak to retry and check your device volume.', 'error');
    }
  };
  window.speechSynthesis.speak(speech);
}

function appendGesture() {
  if (!current) return;
  sentence.textContent = [sentence.textContent.trim(), current].filter(Boolean).join(' ');
  committed = current;
  if ($('autoSpeak')?.checked) speak(current);
}

// Require a steady sign, then a deliberate release before repeating it.
function captureGesture(text, now) {
  if (!text) {
    candidate = '';
    if (releasedSince === null) releasedSince = now;
    if (now - releasedSince >= 500) committed = '';
    return;
  }
  releasedSince = null;
  if (candidate !== text) {
    candidate = text;
    candidateSince = now;
  }
  if ($('autoCapture')?.checked && text !== committed && now - candidateSince >= 900) {
    appendGesture();
    message('Sign added to text. Relax your hand briefly to repeat the same sign.');
  }
}

const gestureTextMap = {
  Open_Palm: 'HELLO',
  Closed_Fist: 'STOP',
  Thumb_Up: 'YES',
  Thumb_Down: 'NO',
  Pointing_Up: 'UP',
  Victory: 'VICTORY',
  ILoveYou: 'LOVE'
};

const edges = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];

function message(text, kind = 'info') {
  notice.textContent = text;
  notice.hidden = !text;
  notice.dataset.kind = kind;
}

function status(text, on = false) {
  chip.textContent = text;
  chip.dataset.on = String(on);
}

function draw(canvas, hands) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const hand of hands) {
    ctx.strokeStyle = '#65e3bc';
    ctx.lineWidth = 3;
    for (const [a,b] of edges) {
      ctx.beginPath();
      ctx.moveTo(hand[a].x * canvas.width, hand[a].y * canvas.height);
      ctx.lineTo(hand[b].x * canvas.width, hand[b].y * canvas.height);
      ctx.stroke();
    }
    ctx.fillStyle = '#fff';
    for (const p of hand) {
      ctx.beginPath();
      ctx.arc(p.x * canvas.width, p.y * canvas.height, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function stop() {
  generation += 1;
  running = false;
  clearTimeout(timer);
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  video.srcObject = null;
  $('camEmpty').hidden = false;
  button.textContent = 'Start camera';
  button.disabled = false;
  status('Camera off');
  current = '';
  resetCapture();
  window.speechSynthesis?.cancel();
  letter.textContent = '–';
  skeleton.hidden = true;
  draw(overlay, []);
  $('addBtn').disabled = true;
}

async function start() {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    message('Open the site over HTTPS in a browser with camera support.', 'error');
    return;
  }

  const attempt = ++generation;
  button.disabled = true;
  message('Allow camera access. Loading hand tracking…');

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      audio: false
    });

    if (attempt !== generation) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
      return;
    }

    stream.getVideoTracks()[0].addEventListener('ended', () => {
      stop();
      message('Camera disconnected. Reconnect it and start again.', 'error');
    });

    video.srcObject = stream;
    await video.play();
    $('camEmpty').hidden = true;

    if (!recognizer) {
      const { FilesetResolver, GestureRecognizer } = await import('/static/vendor/mediapipe/vision_bundle.mjs');
      const files = await FilesetResolver.forVisionTasks('/static/vendor/mediapipe/wasm');
      recognizer = await GestureRecognizer.createFromOptions(files, {
        baseOptions: { modelAssetPath: '/static/vendor/mediapipe/gesture_recognizer.task' },
        runningMode: 'VIDEO',
        numHands: 2
      });
    }

    if (attempt !== generation) {
      return;
    }

    overlay.width = video.videoWidth;
    overlay.height = video.videoHeight;
    lastTime = -1;
    running = true;
    button.textContent = 'Stop camera';
    button.disabled = false;
    resetCapture();
    message('Tracking is on. Hold a supported gesture steady for one second to add it to text.');
    tick();
  } catch (error) {
    if (attempt !== generation) return;
    stop();
    const errors = {
      NotAllowedError: 'Camera access was blocked. Allow Camera in your browser’s site settings and try again.',
      NotFoundError: 'No camera was found. Connect a camera and try again.',
      OverconstrainedError: 'This camera configuration is not available. Try another camera or refresh the page.'
    };
    message(errors[error.name] || 'Could not load hand tracking. Check your connection, reload, and try again.', 'error');
  }
}

function tick() {
  if (!running) return;

  try {
    if (!document.hidden && video.readyState >= 2 && video.currentTime !== lastTime) {
      lastTime = video.currentTime;
      const result = recognizer.recognizeForVideo(video, performance.now());
      draw(overlay, result.landmarks);
      draw(skeleton, result.landmarks);
      skeleton.hidden = !result.landmarks.length;

      const gesture = result.gestures[0]?.[0];
      const rawGestureName = gesture?.categoryName || '';
      const confidence = gesture?.score || 0;

      if (confidence >= 0.65 && rawGestureName) {
        current = gestureTextMap[rawGestureName] || ''; // Ignore unknown / None categories.
      } else {
        current = '';
      }

      captureGesture(current, performance.now());
      letter.textContent = current || (result.landmarks.length ? 'Tracking' : '–');
      letter.classList.add('word');
      $('addBtn').disabled = !current;
      status(result.landmarks.length ? `${result.landmarks.length} hand${result.landmarks.length > 1 ? 's' : ''} tracked` : 'Show your hands to the camera', !!result.landmarks.length);
    }

    timer = setTimeout(tick, 80);
  } catch {
    stop();
    message('Hand tracking stopped. Try starting the camera again.', 'error');
  }
}

$('addBtn').disabled = true;
button.addEventListener('click', () => running ? stop() : start());

$('addBtn').addEventListener('click', () => {
  if (!current) {
    message('No valid gesture detected yet.', 'error');
    return;
  }

  appendGesture();
  message('Gesture added. Tap Speak to read it aloud.');
});

$('spaceBtn').addEventListener('click', () => {
  sentence.textContent += ' ';
});

$('backBtn').addEventListener('click', () => {
  sentence.textContent = sentence.textContent.slice(0, -1);
});

$('clearBtn').addEventListener('click', () => {
  sentence.textContent = '';
  committed = current;
  window.speechSynthesis?.cancel();
  message('Text cleared. Relax your hand, then show the next sign.');
});

$('speakBtn').addEventListener('click', () => {
  const textToSpeak = sentence.textContent.trim();
  if (!textToSpeak) {
    message('Add a recognized gesture before selecting Speak.');
    return;
  }

  if (!window.speechSynthesis) {
    message('Speech output is unavailable in this browser.', 'error');
    return;
  }

  speak(textToSpeak);
  message('Speaking…');
});

window.addEventListener('pagehide', () => {
  stop();
  recognizer?.close();
  recognizer = null;
});
