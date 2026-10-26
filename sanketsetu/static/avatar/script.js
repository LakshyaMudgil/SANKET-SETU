// Import Three.js, GLTFLoader, and defaultPose via the import map
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { defaultPose } from './Animations/defaultPose.js';

document.addEventListener('DOMContentLoaded', () => {
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', event => {
    if (event.matches) { state.animations = []; state.pending = false; }
  });
  const historyKey = 'sanketsetu-history-browser';
  let historyBrowserId = localStorage.getItem(historyKey);
  if (!historyBrowserId) { historyBrowserId = crypto.randomUUID(); localStorage.setItem(historyKey, historyBrowserId); }
  // Element selectors
  const islBox = document.getElementById('islBox');
  const processedTextField = document.getElementById('processed-text');
  const animationContainer = document.getElementById('animationContainer');
  const historyPanel = document.getElementById('history-panel');
  const speedSlider = document.getElementById('speedSlider');
  const speedValue = document.getElementById('speedValue');

  // Global state for the animation system
  const state = {
    text: '',
    bot: 'ybot',
    speed: 0.1,
    baseSpeed: 0.1,
    speedMultiplier: 1.0,
    pause: 800,
    listening: false,
    animations: [],
    scene: null,
    camera: null,
    renderer: null,
    avatar: null,
    flag: false,
    pending: false,
    textTimer: false,
    characters: [],
    alphabetModules: {},
    wordModules: {},
    numberModules: {},
    wordList: [],
    numberList: ['0','1','2','3','4','5','6','7','8','9']
  };

  // Clear displayed results and animation
  document.getElementById('clearButton').addEventListener('click', () => {
    const ti = document.getElementById('textInput'); if (ti) ti.value = '';
    islBox.innerHTML = '';
    processedTextField.textContent = '';
    state.animations = [];

    if (!state.scene) {
      animationContainer.innerHTML = '';
      const placeholderDiv = document.createElement('div');
      placeholderDiv.className = 'placeholder-animation';
      placeholderDiv.innerHTML = '<i data-feather="video"></i><p>Animation will appear here</p>';
      animationContainer.appendChild(placeholderDiv);
      feather.replace();
    }
  });

  // -------------------------
  // Speed Slider Handler
  // -------------------------
  if (speedSlider) {
    speedValue.textContent = `${speedSlider.value}x`;
    
    speedSlider.addEventListener('input', () => {
      const multiplier = parseFloat(speedSlider.value);
      state.speedMultiplier = multiplier;
      state.speed = state.baseSpeed * multiplier;
      speedValue.textContent = `${multiplier.toFixed(1)}x`;
    });
  }

  // -------------------------
 
  // -------------------------
  // 3D Animation System Setup
  // -------------------------
  state.animate = function() {
    requestAnimationFrame(this.animate.bind(this));
    if (!this.scene || !this.camera || !this.renderer) {
      console.warn("Scene, camera or renderer not initialized");
      return;
    }
    this.renderer.render(this.scene, this.camera);

    if (!this.avatar || this.animations.length === 0) return;

    const currentAnim = this.animations[0];

    if (currentAnim && currentAnim.length) {
      if (!this.flag) {
        if (currentAnim[0] === 'add-text') {
          addTextStep(currentAnim);
          return;
        } else {
          processBoneAnimation(currentAnim, this);
        }
      }
    } else {
      if (!this.flag) {
        this.flag = true;
        setTimeout(() => {
          this.flag = false;
          this.animations.shift();
        }, this.pause / this.speedMultiplier);
      }
    }
  };

  function addTextStep(animCommand) {
    if (!state.textTimer) {
      if (processedTextField) {
        processedTextField.textContent += animCommand[1];
      }
      state.textTimer = true;
      setTimeout(() => {
        state.textTimer = false;
        state.animations.shift();
      }, 100 / state.speedMultiplier);
    }
  }

  function processBoneAnimation(animSteps, ctx) {
    for (let i = 0; i < animSteps.length;) {
      const [boneName, action, axis, limit, sign] = animSteps[i];
      const bone = ctx.avatar.getObjectByName(boneName);
      if (bone) {
        if (sign === "+" && bone[action][axis] < limit) {
          bone[action][axis] = Math.min(bone[action][axis] + ctx.speed, limit);
          i++;
        } else if (sign === "-" && bone[action][axis] > limit) {
          bone[action][axis] = Math.max(bone[action][axis] - ctx.speed, limit);
          i++;
        } else {
          animSteps.splice(i, 1);
        }
      } else {
        console.warn(`Bone not found: ${boneName}`);
        animSteps.splice(i, 1);
      }
    }
  }

  // -------------------------
  // History Management
  // -------------------------
  const saveToHistory = (originalText, islText) => {
    fetch("/save_history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ original_text: originalText, isl_text: islText, browser_id: historyBrowserId })
    })
      .then(response => response.json())
      .then(data => {
        if (data.error) console.error("History save error:", data.error);
      })
      .catch(error => console.error("Error saving history:", error));
  };

  const displayHistory = () => {
    fetch(`/get_history?browser_id=${encodeURIComponent(historyBrowserId)}`)
      .then(response => response.json())
      .then(data => {
        const historyList = document.getElementById('history-list');
        if (data.error) {
          historyList.innerHTML = `<div class="error">${data.error}</div>`;
        } else if (data.length > 0) {
          historyList.innerHTML = data.map(entry => `
            <div class="history-item" data-id="${entry._id}">
              <button class="delete-btn" data-id="${entry._id}">
                <i data-feather="trash-2"></i>
              </button>
              <div class="history-time">${new Date(entry.timestamp).toLocaleString()}</div>
              <div class="history-query">${escapeHtml(entry.original_text)}</div>
              <div class="history-isl">${escapeHtml(entry.isl_text)}</div>
            </div>
          `).join('');
        } else {
          historyList.innerHTML = '<div class="empty-history">No conversions yet</div>';
        }
        feather.replace();
      })
      .catch(error => {
        console.error("History fetch error:", error);
        document.getElementById('history-list').innerHTML = '<div class="error">Error loading history</div>';
      });
  };

  // -------------------------
  // Module Loading Helpers
  // -------------------------
  function getAnimationFunction(moduleObj, key) {
    if (moduleObj[key] && typeof moduleObj[key] === 'function') return moduleObj[key];
    if (moduleObj.default && typeof moduleObj.default === 'function') return moduleObj.default;
    for (const exportName in moduleObj) {
      if (typeof moduleObj[exportName] === 'function') return moduleObj[exportName];
    }
    return null;
  }

  const loadAlphabetModules = async () => {
    const alphabetChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (const char of alphabetChars) {
      try {
        const moduleObj = await import(`./Animations/Alphabets/${char}.js`);
        const animationFunction = getAnimationFunction(moduleObj, char);
        if (animationFunction) state.alphabetModules[char] = animationFunction;
      } catch (error) {
        console.warn(`Failed to load animation for letter ${char}:`, error);
      }
    }
  };
// Add new Words
  const loadWordModules = async () => {
    const commonWords = ['HOME', 'TIME', 'YOU', 'PERSON'];
    for (const word of commonWords) {
      try {
        const moduleObj = await import(`./Animations/Words/${word.toUpperCase()}.js`);
        const animationFunction = getAnimationFunction(moduleObj, word);
        if (animationFunction) {
          state.wordModules[word] = animationFunction;
          state.wordList.push(word);
        }
      } catch (error) {
        console.warn(`Failed to load animation for word ${word}:`, error);
      }
    }
  };

  const loadNumberModules = async () => {
    const numbers = '0123456789';
    for (const num of numbers) {
      try {
        const moduleObj = await import(`./Animations/Numbers/${num}.js`);
        const animationFunction = getAnimationFunction(moduleObj, num);
        if (animationFunction) state.numberModules[num] = animationFunction;
      } catch (error) {
        console.error(`Failed to load animation for number ${num}:`, error);
      }
    }
  };

  // -------------------------
  // Three.js Initialization
  // -------------------------
  function initThree() {
    animationContainer.innerHTML = '';
    state.scene = new THREE.Scene();
    state.scene.background = new THREE.Color(0xffffff);
    
    state.camera = new THREE.PerspectiveCamera(
      30,
      animationContainer.clientWidth / animationContainer.clientHeight,
      0.1,
      1000
    );
    state.camera.position.set(0, 1.6, 1.5);
    state.camera.lookAt(0, 1.4, 0);
    
    state.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    state.renderer.setPixelRatio(window.devicePixelRatio);
    state.renderer.shadowMap.enabled = true;
    state.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    state.renderer.setSize(animationContainer.clientWidth, animationContainer.clientHeight);
    animationContainer.appendChild(state.renderer.domElement);
  
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    state.scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(0, 3, 3);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    state.scene.add(directionalLight);
  
    return true;
  }
  
  function loadModel(modelPath) {
    return new Promise((resolve, reject) => {
      fetch(modelPath)
        .then(response => {
          if (!response.ok) throw new Error(`Model file not found: ${modelPath}`);
          const loader = new GLTFLoader();
          if (state.avatar) state.scene.remove(state.avatar);
          loader.load(
            modelPath,
            (gltf) => {
              gltf.scene.traverse((child) => {
                if (child.isMesh) {
                  child.frustumCulled = false;
                  child.castShadow = true;
                  child.receiveShadow = true;
                }
              });
              state.avatar = gltf.scene;
              state.scene.add(state.avatar);
              try {
                defaultPose(state);
                resolve();
              } catch (error) {
                reject(error);
              }
            },
            undefined,
            (error) => reject(error)
          );
        })
        .catch(error => reject(error));
    });
  }
  
  // -------------------------
  // Processing Animation Commands
  // -------------------------
  function processAnimation(text) {
    if (!text) return;
    
    const processedText = text.toUpperCase()
      .replace(/ZERO/gi, '0')
      .replace(/ONE/gi, '1')
      .replace(/TWO/gi, '2')
      .replace(/THREE/gi, '3')
      .replace(/FOUR/gi, '4')
      .replace(/FIVE/gi, '5')
      .replace(/SIX/gi, '6')
      .replace(/SEVEN/gi, '7')
      .replace(/EIGHT/gi, '8')
      .replace(/NINE/gi, '9');
    
    const words = processedText.split(/(\d+|\s+)/).filter(w => w.trim() !== '');
    
    state.animations = [];
    state.characters = [];
    
    if (processedTextField) processedTextField.textContent = '';

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      if (processedTextField) processedTextField.value = processedText;
      return;
    }

    words.forEach(word => {
      if (/^\d+$/.test(word)) {
        [...word].forEach(digit => {
          state.animations.push(['add-text', digit]);
          if (state.numberModules[digit]) state.numberModules[digit](state);
        });
        state.animations.push(['add-text', ' ']);
      }
      else if (state.wordList.includes(word)) {
        state.animations.push(['add-text', `${word} `]);
        state.wordModules[word](state);
      } 
      else {
        [...word].forEach((ch, i) => {
          const charText = (i === word.length - 1) ? `${ch} ` : ch;
          state.animations.push(['add-text', charText]);
          if (state.alphabetModules[ch]) state.alphabetModules[ch](state);
        });
      }
    });

    if (!state.pending && state.animations.length > 0) {
      state.pending = true;
      state.animate();
    }
  }

  // -------------------------
  // Sending Text for Processing
  // -------------------------
  function sendTextForProcessing(text) {
    const status = document.getElementById('micStatus');
    if (!text || !text.trim()) {
      if (status) status.textContent = 'Enter or speak some text first.';
      return Promise.resolve();
    }
    if (status) status.textContent = 'Processing…';
    return fetch("/save_text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.trim() })
    })
      .then(async response => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || `Server error (${response.status})`);
        return data;
      })
      .then(data => {
        if (data.error) {
          islBox.innerHTML = `<span class="error">${escapeHtml(data.message || 'Could not process this text')}</span>`;
          if (status) status.textContent = data.message || '';
          return;
        }
        if (status) status.textContent = data.translated_text ? `Translated: ${data.translated_text}` : '';
        islBox.innerHTML = formatISLStructure(data.isl_structure);
        const supported = new Set([...state.wordList, ...state.numberList, 'ZERO','ONE','TWO','THREE','FOUR','FIVE','SIX','SEVEN','EIGHT','NINE']);
        const fallsBackToSpelling = data.isl_structure.toUpperCase().split(/\s+/).some(token => /^[A-Z]+$/.test(token) && !supported.has(token));
        const spellingNotice = document.getElementById('fingerspellNotice');
        if (spellingNotice) spellingNotice.hidden = !fallsBackToSpelling;
        saveToHistory(data.original_text, data.isl_structure);
        processAnimation(data.isl_structure);
      })
      .catch(error => {
        console.error("Processing error:", error);
        const message = error.message || 'Could not process text';
        islBox.innerHTML = `<span class="error">${escapeHtml(message)}</span>`;
        if (status) status.textContent = message;
      });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // -------------------------
  // Formatting ISL Structure
  // -------------------------
  function formatISLStructure(islText) {
    return islText.split('|')
      .map(sentence =>
        sentence.trim().split(' ')
          .map(word => `<span class="isl-word ${getWordClass(word)}">${word}</span>`)
          .join(' ')
      )
      .join('<span class="sentence-divider">|</span>');
  }

  function getWordClass(word) {
    if (/\d/.test(word)) return 'number';
    if (["what", "why", "how", "when", "where"].includes(word.toLowerCase())) return 'question';
    if (["not", "no"].includes(word.toLowerCase())) return 'negation';
    return '';
  }

  // -------------------------
  // Event Listeners for UI Actions
  // -------------------------
  document.getElementById('history-button').addEventListener('click', () => {
    historyPanel.classList.add('show');
    displayHistory();
  });

  document.getElementById('close-history').addEventListener('click', () => {
    historyPanel.classList.remove('show');
  });

  document.getElementById('history-list').addEventListener('click', (e) => {
    const deleteBtn = e.target.closest('.delete-btn');
    if (deleteBtn) {
      const id = deleteBtn.dataset.id;
      if (confirm("Are you sure you want to delete this entry?")) {
        fetch(`/delete_history/${id}?browser_id=${encodeURIComponent(historyBrowserId)}`, { method: "DELETE" })
          .then(response => response.json())
          .then(data => data.error ? alert(data.error) : displayHistory())
          .catch(error => console.error("Delete error:", error));
      }
    }
  });

  document.getElementById('clearHistoryButton').addEventListener('click', () => {
    if (confirm("Clear the conversion history saved by this browser?")) {
      fetch(`/clear_history?browser_id=${encodeURIComponent(historyBrowserId)}`, { method: "DELETE" })
        .then(response => response.json())
        .then(data => data.error ? alert(data.error) : displayHistory())
        .catch(error => console.error("Clear error:", error));
    }
  });



  // -------------------------
  // Initialize 3D System and App
  // -------------------------
  async function init3DSystem() {
    try {
      if (!initThree()) throw new Error("Three.js initialization failed");
      await loadAlphabetModules();
      await loadWordModules();
      await loadNumberModules();
      await loadModel(new URL(`./Models/${state.bot}/${state.bot}.glb`, import.meta.url).href);
      
      window.addEventListener('resize', () => {
        if (state.camera && state.renderer) {
          state.camera.aspect = animationContainer.clientWidth / animationContainer.clientHeight;
          state.camera.updateProjectionMatrix();
          state.renderer.setSize(animationContainer.clientWidth, animationContainer.clientHeight);
        }
      });
      
      return true;
    } catch (error) {
      console.error('3D System initialization error:', error);
      return false;
    }
  }

  // -------------------------
  // Mobile Sidebar Toggle
  // -------------------------
  function initSidebarToggle() {
    const menuBtn = document.getElementById('menu-btn');
    const sidebar = document.querySelector('.sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    if (!menuBtn || !sidebar || !sidebarOverlay) return;

    const closeSidebar = () => {
      sidebar.classList.remove('open');
      sidebarOverlay.classList.remove('show');
    };

    menuBtn.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      sidebarOverlay.classList.toggle('show');
    });

    sidebarOverlay.addEventListener('click', closeSidebar);

    document.querySelectorAll('.nav-item').forEach((link) => {
      link.addEventListener('click', () => {
        if (window.innerWidth <= 768) closeSidebar();
      });
    });
  }

  // -------------------------
  // Voice + typed input (browser speech recognition)
  // -------------------------
  function initInput() {
    const mic = document.getElementById('micButton');
    const micLabel = document.getElementById('micLabel');
    const lang = document.getElementById('langSelect');
    const input = document.getElementById('textInput');
    const go = document.getElementById('translateButton');
    const status = document.getElementById('micStatus');
    if (!mic || !input || !go) return;

    const translate = () => {
      const text = input.value.trim();
      sendTextForProcessing(text);
    };
    go.addEventListener('click', translate);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); translate(); }
    });

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      mic.disabled = true;
      status.textContent = 'Voice input is not supported by this browser. Try current Chrome or Edge over HTTPS or localhost; you can still type.';
      return;
    }

    let rec = null;
    const setListening = (on) => {
      state.listening = on;
      mic.classList.toggle('recording', on);
      mic.setAttribute('aria-pressed', String(on));
      micLabel.textContent = on ? 'Listening… (tap to stop)' : 'Speak';
    };

    mic.addEventListener('click', () => {
      if (state.listening && rec) { rec.stop(); return; }
      rec = new SR();
      rec.lang = lang.value;
      rec.interimResults = true;
      rec.continuous = false;
      let finalText = '';
      let startTimer = 0;
      rec.onstart = () => { clearTimeout(startTimer); setListening(true); status.textContent = ''; };
      rec.onresult = (ev) => {
        let interim = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const r = ev.results[i];
          if (r.isFinal) finalText += r[0].transcript; else interim += r[0].transcript;
        }
        input.value = (finalText + interim).trim();
      };
      rec.onerror = (ev) => {
        clearTimeout(startTimer);
        const msg = { 'not-allowed': 'Microphone permission was blocked.', 'no-speech': "I didn't hear anything. Try again.",
                      'audio-capture': 'No microphone found. Check that one is connected and enabled.', 'network': 'Speech service unreachable (voice input needs internet).' }[ev.error];
        status.textContent = msg || `Voice input error: ${ev.error}`;
      };
      rec.onend = () => {
        clearTimeout(startTimer);
        setListening(false);
        if (finalText.trim()) { input.value = finalText.trim(); translate(); }
      };
      try {
        status.textContent = 'Starting voice input…';
        rec.start();
        startTimer = setTimeout(() => {
          if (!state.listening) status.textContent = 'Voice recognition did not start. Check microphone permission and browser support.';
        }, 5000);
      } catch (e) {
        clearTimeout(startTimer);
        setListening(false);
        status.textContent = `Could not start microphone: ${e.message}`;
      }
    });
  }

  // follow the theme chosen on the home page (same localStorage key), and keep it in sync
  function initTheme() {
    let saved = null;
    try { saved = localStorage.getItem('ss-theme'); } catch (e) {}
    const dark = saved ? saved === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    document.body.classList.toggle('dark-mode', dark);
    document.querySelector('.theme-toggle').addEventListener('click', () => {
      const nowDark = document.body.classList.toggle('dark-mode');
      try { localStorage.setItem('ss-theme', nowDark ? 'dark' : 'light'); } catch (e) {}
    });
  }

  async function initApp() {
    feather.replace();
    initSidebarToggle();
    // Keep typing, voice and theme controls usable even if the remote 3D model
    // or animation modules are slow to load or unavailable.
    initTheme();
    initInput();
    await init3DSystem();
      // Receive speech recognized by SanketSetu
  let sanketsetuBusy = false;
  let bridgePairingCode = localStorage.getItem('sanketsetu-bridge-pairing-code');
  document.getElementById('pairMicrophoneButton')?.addEventListener('click', () => {
    const code = prompt('Enter the pairing code configured as SANKETSETU_PAIRING_CODE on the server.');
    if (code && code.trim()) {
      bridgePairingCode = code.trim();
      localStorage.setItem('sanketsetu-bridge-pairing-code', bridgePairingCode);
    }
  });

  setInterval(async () => {
    if (!bridgePairingCode || sanketsetuBusy) return;

    sanketsetuBusy = true;

    try {
      const response = await fetch('/sanketsetu/next', { headers: { 'X-Pairing-Code': bridgePairingCode } });
      const data = await response.json();

      if (data.text) {
        sendTextForProcessing(data.text);
      }
    } catch (error) {
      console.error('SanketSetu polling error:', error);
    } finally {
      sanketsetuBusy = false;
    }
  }, 500);
    // "Watch Demo" on the home page lands here with ?demo=1
    if (new URLSearchParams(location.search).get('demo') === '1') {
      const demo = 'Hello, how are you?';
      document.getElementById('textInput').value = demo;
      sendTextForProcessing(demo);
    }
  }

  // Start the application
  initApp();
});
