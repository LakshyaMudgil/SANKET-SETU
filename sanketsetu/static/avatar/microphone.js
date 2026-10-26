// Keep speech capture independent of remote avatar and animation imports.
(() => {
  const mic = document.getElementById('micButton'), label = document.getElementById('micLabel');
  const input = document.getElementById('textInput'), status = document.getElementById('micStatus');
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!window.isSecureContext || !SR) {
    mic.disabled = true;
    status.textContent = 'For voice input, open this HTTPS site in Chrome or Edge. This browser does not support speech recognition here. You can still type.';
    mic.title = 'Speech recognition is unavailable in this browser or context.';
    return;
  }

  let recognition = null, listening = false, starting = false, timer;

  function reset() {
    clearTimeout(timer);
    listening = starting = false;
    mic.classList.remove('recording');
    mic.setAttribute('aria-pressed', 'false');
    label.textContent = 'Speak';
  }

  mic.addEventListener('click', () => {
    if (listening || starting) {
      recognition?.abort();
      reset();
      status.textContent = 'Voice input stopped.';
      return;
    }

    let finalText = '', failed = false;
    const rec = recognition = new SR();
    rec.lang = document.getElementById('langSelect').value;
    rec.interimResults = true;
    rec.continuous = false;

    starting = true;
    label.textContent = 'Starting… (tap to stop)';
    mic.setAttribute('aria-pressed', 'true');
    status.textContent = 'Allow microphone access, then speak.';

    rec.onstart = () => {
      clearTimeout(timer);
      starting = false;
      listening = true;
      mic.classList.add('recording');
      label.textContent = 'Listening… (tap to stop)';
      status.textContent = 'Listening… speak now.';
    };

    rec.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) finalText += event.results[i][0].transcript + ' ';
        else interim += event.results[i][0].transcript;
      }
      input.value = (finalText + interim).trim();
    };

    rec.onerror = (event) => {
      failed = true;
      reset();
      const messages = {
        'not-allowed': 'Microphone access was blocked. Allow Microphone in your browser’s site settings, then try again.',
        'service-not-allowed': 'Speech recognition is blocked for this page. Use an HTTPS page with camera and microphone permission enabled.',
        'network': 'Speech recognition is unavailable because the network is offline or the service is unreachable.',
        'no-speech': 'No speech was detected. Try speaking a little louder and closer to the microphone.',
        'audio-capture': 'Your microphone could not be accessed. Check the browser permission and device settings.',
        'not-allowed': 'Microphone access was blocked. Allow Microphone in your browser’s site settings, then try again.',
        'language-not-supported': 'The chosen language is not supported by this browser for speech recognition.',
      };
      status.textContent = messages[event.error] || (event.error === 'aborted' ? 'Voice input stopped.' : 'Speech recognition failed. Try again.');
    };

    rec.onend = () => {
      reset();
      if (finalText.trim() && !failed) {
        input.value = finalText.trim();
        status.textContent = 'Speech captured. Translating…';
        document.getElementById('translateButton')?.click();
      } else if (!failed) {
        status.textContent = 'No speech captured. Select Speak and try again.';
      }
    };

    try {
      rec.start();
      timer = setTimeout(() => {
        if (starting) {
          rec.abort();
          reset();
          status.textContent = 'Speech input timed out. Check microphone permission and try again.';
        }
      }, 15000);
    } catch {
      reset();
      status.textContent = 'Could not start speech input. Check browser microphone permissions and try again.';
    }
  });

  window.addEventListener('pagehide', () => {
    recognition?.abort();
    reset();
  });
})();
