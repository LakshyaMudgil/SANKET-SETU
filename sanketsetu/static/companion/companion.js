(() => {
  const idKey = "sanketsetu-memory-user";
  let userId = localStorage.getItem(idKey);
  if (!userId) { userId = crypto.randomUUID(); localStorage.setItem(idKey, userId); }
  const status = document.querySelector("#status");
  const form = document.querySelector("#chatForm"), input = document.querySelector("#message");
  const messages = document.querySelector("#messages"), send = document.querySelector("#send"), recalled = document.querySelector("#recalled");
  const forget = document.querySelector("#forget"), forgetStatus = document.querySelector("#forgetStatus");
  fetch("/api/companion/status").then(r => r.json()).then(d => { status.textContent = d.message; status.dataset.ready = String(d.configured); }).catch(() => { status.textContent = "Could not check Hindsight connection."; });
  function bubble(text, who) { const el = document.createElement("div"); el.className = `bubble ${who}`; el.textContent = text; messages.append(el); messages.scrollTop = messages.scrollHeight; return el; }
  form.addEventListener("submit", async e => {
    e.preventDefault(); const message = input.value.trim(); if (!message) return;
    bubble(message, "user"); input.value = ""; send.disabled = true;
    const pending = bubble("Thinking and recalling…", "agent");
    try {
      const res = await fetch("/api/companion/respond", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: userId, message }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      pending.textContent = data.reply;
      recalled.hidden = !data.memories?.length;
      recalled.innerHTML = "";
      if (data.memories?.length) { const label = document.createElement("b"); label.textContent = "Hindsight recalled"; recalled.append(label); data.memories.forEach(m => { const line = document.createElement("div"); line.textContent = m; recalled.append(line); }); }
    } catch (err) { pending.textContent = err.message; }
    finally { send.disabled = false; input.focus(); }
  });
  forget.addEventListener("click", async () => {
    if (!confirm("Delete this browser’s Setu memory bank? This cannot be undone.")) return;
    forget.disabled = true; forgetStatus.textContent = "Deleting memory…";
    try {
      const res = await fetch("/api/companion/forget", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: userId }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not delete memory");
      userId = crypto.randomUUID(); localStorage.setItem(idKey, userId);
      messages.replaceChildren(); bubble("Your previous memory bank was deleted. Setu will start fresh from here.", "agent");
      recalled.replaceChildren(); recalled.hidden = true;
      forgetStatus.textContent = "Memory deleted.";
    } catch (err) { forgetStatus.textContent = err.message; }
    finally { forget.disabled = false; }
  });
})();
