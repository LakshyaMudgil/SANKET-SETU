import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile('sanketsetu/static/avatar/microphone.js', 'utf8');
function setup(supported = true) {
  const elements: Record<string, any> = {};
  for (const id of ['micButton','micLabel','textInput','micStatus','langSelect','translateButton']) {
    elements[id] = {textContent: '', value: '', disabled: false, clicks: 0, handlers: {}, attributes: {}, classList: {add() {}, remove() {}}, addEventListener(name: string, callback: any) { this.handlers[name] = callback; }, setAttribute(name: string, value: string) {this.attributes[name] = value;}, click() {this.clicks++;this.handlers.click?.();}};
  }
  elements.langSelect.value = 'en-IN';
  let recognition: any;
  class Recognition {
    constructor() { recognition = this; }
    start() {}
    abort() {}
  }
  const events: Record<string, any> = {};
  const context = {document: {getElementById: (id: string) => elements[id]}, window: {isSecureContext: true, SpeechRecognition: supported ? Recognition : undefined, addEventListener: (name: string, callback: any) => { events[name] = callback; }}, setTimeout: () => 1, clearTimeout() {}};
  vm.runInNewContext(source, context);
  return {elements, events, get recognition() { return recognition; }};
}
test('speech capture works without loading the avatar and translates final transcript', () => {
  const app = setup();
  app.elements.micButton.click();
  app.recognition.onstart();
  assert.equal(app.elements.micButton.attributes['aria-pressed'], 'true');
  assert.equal(app.recognition.lang, 'en-IN');
  const final: any = [{transcript: 'hello world'}]; final.isFinal = true;
  app.recognition.onresult({resultIndex: 0, results: [final]});
  app.recognition.onend();
  assert.equal(app.elements.textInput.value, 'hello world');
  assert.equal(app.elements.translateButton.clicks, 1);
  assert.equal(app.elements.micButton.attributes['aria-pressed'], 'false');
});
test('blocked microphone gives recovery instructions and does not translate', () => {
  const app = setup(); app.elements.micButton.click();
  app.recognition.onerror({error: 'not-allowed'}); app.recognition.onend();
  assert.match(app.elements.micStatus.textContent, /site settings/);
  assert.equal(app.elements.translateButton.clicks, 0);
  app.elements.micButton.click();
  assert.equal(app.elements.micLabel.textContent, 'Starting… (tap to stop)');
});
test('unsupported speech recognition gives a browser recommendation', () => {
  const app = setup(false);
  assert.equal(app.elements.micButton.disabled, true);
  assert.match(app.elements.micStatus.textContent, /Chrome or Edge/);
});
test('vendored hand tracking binaries are valid WebAssembly', async () => {
  for (const name of ['vision_wasm_internal','vision_wasm_nosimd_internal']) {
    const bytes = await readFile(`sanketsetu/static/vendor/mediapipe/wasm/${name}.wasm`);
    assert.equal(WebAssembly.validate(bytes), true);
  }
});
test('camera permission denial keeps controls retryable without contacting a recognition server', async () => {
  const elements: Record<string, any> = {};
  for (const id of ['cam','camToggle','handOverlay','skeleton','notice','letter','sentence','handChip','camEmpty','addBtn','spaceBtn','backBtn','clearBtn','speakBtn']) {
    elements[id] = {textContent: '', hidden: false, disabled: false, dataset: {}, classList: {add() {}}, handlers: {}, addEventListener(name: string, callback: any) {this.handlers[name] = callback;}, getContext() {return {clearRect() {}};}};
  }
  let attempts = 0;
  const context = {document: {getElementById: (id: string) => elements[id]}, window: {isSecureContext: true, addEventListener() {}}, navigator: {mediaDevices: {async getUserMedia() {attempts++; throw {name: 'NotAllowedError'};}}}, setTimeout, clearTimeout};
  vm.runInNewContext(await readFile('sanketsetu/static/home/sign.js', 'utf8'), context);
  await elements.camToggle.handlers.click();
  assert.equal(elements.camToggle.disabled, false);
  assert.equal(elements.camToggle.textContent, 'Start camera');
  assert.match(elements.notice.textContent, /Allow Camera/);
  await elements.camToggle.handlers.click();
  assert.equal(attempts, 2);
});
