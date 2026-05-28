// =============================================
// APP CONTROLLER - Main orchestrator
// =============================================

let supabase = null;
let currentProfile = null;
let currentRoomId = null;
let myRole = null; // 'question' | 'answer'
let pendingHintEvent = null;
let pendingGuessEvent = null;

// VS COM state
let comState = {
  round: 1,
  maxRounds: 3,
  playerScore: 0,
  comScore: 0,
  hintCount: 0
};

// ──────────────────────────────
// INIT
// ──────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  // Init Supabase
  supabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  Auth.init(supabase);

  // Cek session
  const session = await Auth.getSession();
  if (session) {
    try {
      currentProfile = await Auth.getProfile(session.user.id);
      Game.init(supabase, currentProfile);
      showLoggedInUI();
      showScreen('screen-menu');
    } catch {
      showScreen('screen-auth');
    }
  } else {
    showScreen('screen-auth');
  }
});

// ──────────────────────────────
// NAVIGATION
// ──────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
  window.scrollTo(0, 0);
}

function showLoggedInUI() {
  document.getElementById('navbar').classList.remove('hidden');
  document.getElementById('nav-username').textContent = currentProfile.username;
  updateStats();
}

async function updateStats() {
  try {
    const profile = await Auth.getProfile(currentProfile.id);
    currentProfile = profile;
    const wins = profile.wins || 0;
    const losses = profile.losses || 0;
    const total = wins + losses;
    document.getElementById('stat-wins').textContent = wins;
    document.getElementById('stat-losses').textContent = losses;
    document.getElementById('stat-winrate').textContent = total > 0 ? Math.round((wins/total)*100) + '%' : '0%';
  } catch {}
}

// ──────────────────────────────
// AUTH
// ──────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.tab').forEach((t, i) => {
    t.classList.toggle('active', (i === 0 && tab === 'login') || (i === 1 && tab === 'register'));
  });
  document.getElementById('form-login').classList.toggle('hidden', tab !== 'login');
  document.getElementById('form-register').classList.toggle('hidden', tab !== 'register');
  clearAlert('auth-alert');
}

function showAlert(id, msg, type = 'error') {
  const el = document.getElementById(id);
  el.className = `alert alert-${type} show`;
  el.textContent = msg;
}

function clearAlert(id) {
  const el = document.getElementById(id);
  el.className = 'alert';
  el.textContent = '';
}

async function doLogin() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  try {
    await Auth.login(username, password);
    const session = await Auth.getSession();
    currentProfile = await Auth.getProfile(session.user.id);
    Game.init(supabase, currentProfile);
    showLoggedInUI();
    showScreen('screen-menu');
  } catch (e) {
    showAlert('auth-alert', e.message);
  }
}

async function doRegister() {
  const username = document.getElementById('reg-username').value.trim();
  const password = document.getElementById('reg-password').value;
  const confirm = document.getElementById('reg-confirm').value;
  if (password !== confirm) return showAlert('auth-alert', 'Password tidak cocok!');
  try {
    await Auth.register(username, password);
    showAlert('auth-alert', '✓ Berhasil daftar! Silakan login.', 'success');
    setTimeout(() => switchTab('login'), 1500);
  } catch (e) {
    showAlert('auth-alert', e.message);
  }
}

async function doLogout() {
  Game.unsubscribe();
  await Auth.logout();
  currentProfile = null;
  currentRoomId = null;
  document.getElementById('navbar').classList.add('hidden');
  showScreen('screen-auth');
}

// ──────────────────────────────
// VS PLAYER - ROOM
// ──────────────────────────────
async function doCreateRoom() {
  clearAlert('lobby-alert');
  try {
    const room = await Game.createRoom();
    currentRoomId = room.id;
    renderHostWaiting(room);
    showScreen('screen-waiting-host');
    subscribeWaiting(room.id, 'host');
  } catch (e) {
    showAlert('lobby-alert', e.message);
  }
}

async function doJoinRoom() {
  const code = document.getElementById('join-code').value.trim().toUpperCase();
  if (!code || code.length !== 6) return showAlert('lobby-alert', 'Masukkan kode 6 karakter!');
  clearAlert('lobby-alert');
  try {
    const room = await Game.joinRoom(code);
    currentRoomId = room.id;
    renderGuestWaiting(room);
    showScreen('screen-waiting-guest');
    subscribeWaiting(room.id, 'guest');
  } catch (e) {
    showAlert('lobby-alert', e.message);
  }
}

async function doStartGame() {
  try {
    const room = await Game.startGame(currentRoomId);
    // realtime akan trigger startGameUI di kedua pemain
  } catch (e) {
    alert('Gagal memulai: ' + e.message);
  }
}

async function doLeaveRoom() {
  Game.unsubscribe();
  currentRoomId = null;
  showScreen('screen-vsplayer-lobby');
}

// ──────────────────────────────
// WAITING ROOM RENDER
// ──────────────────────────────
async function renderHostWaiting(room) {
  document.getElementById('host-room-code').textContent = room.code;

  // Ambil info host
  const host = await supabase.from('profiles').select('username').eq('id', room.host_id).single();
  const hostName = host.data?.username || '?';

  const list = document.getElementById('host-player-list');
  list.innerHTML = `
    <div class="player-slot">
      <div class="player-avatar">${hostName[0].toUpperCase()}</div>
      <div class="player-info">
        <div class="name">${hostName}</div>
        <div class="tag">pemain 1</div>
      </div>
      <div class="player-status host">HOST</div>
    </div>
    <div class="player-slot" id="host-guest-slot">
      <div class="player-avatar" style="background:var(--text3)">?</div>
      <div class="player-info">
        <div class="name" style="color:var(--text3)">Menunggu...</div>
        <div class="tag">pemain 2</div>
      </div>
      <div class="player-status waiting">KOSONG</div>
    </div>
  `;

  if (room.guest_id) {
    updateGuestSlot(room.guest_id);
  }
}

async function renderGuestWaiting(room) {
  document.getElementById('guest-room-code').textContent = room.code;
  const [host, guest] = await Promise.all([
    supabase.from('profiles').select('username').eq('id', room.host_id).single(),
    supabase.from('profiles').select('username').eq('id', room.guest_id).single()
  ]);
  const hostName = host.data?.username || '?';
  const guestName = guest.data?.username || '?';

  document.getElementById('guest-player-list').innerHTML = `
    <div class="player-slot">
      <div class="player-avatar">${hostName[0].toUpperCase()}</div>
      <div class="player-info"><div class="name">${hostName}</div><div class="tag">pemain 1</div></div>
      <div class="player-status host">HOST</div>
    </div>
    <div class="player-slot">
      <div class="player-avatar" style="background:var(--green)">${guestName[0].toUpperCase()}</div>
      <div class="player-info"><div class="name">${guestName}</div><div class="tag">pemain 2</div></div>
      <div class="player-status ready">SIAP</div>
    </div>
  `;
}

async function updateGuestSlot(guestId) {
  const { data } = await supabase.from('profiles').select('username').eq('id', guestId).single();
  const guestName = data?.username || '?';
  const slot = document.getElementById('host-guest-slot');
  if (slot) {
    slot.innerHTML = `
      <div class="player-avatar" style="background:var(--green)">${guestName[0].toUpperCase()}</div>
      <div class="player-info"><div class="name">${guestName}</div><div class="tag">pemain 2</div></div>
      <div class="player-status ready">SIAP</div>
    `;
  }
  document.getElementById('host-waiting-msg').classList.add('hidden');
  document.getElementById('host-start-area').classList.remove('hidden');
}

// ──────────────────────────────
// SUBSCRIBE WAITING ROOM
// ──────────────────────────────
function subscribeWaiting(roomId, role) {
  Game.unsubscribe();
  Game.subscribeToRoom(roomId,
    async (room) => {
      Game.setCurrentRoom(room);

      if (room.status === 'playing') {
        // Game dimulai!
        await startGameUI(room, role);
        return;
      }

      if (room.status === 'finished') {
        showScreen('screen-menu');
        return;
      }

      // Guest bergabung
      if (role === 'host' && room.guest_id) {
        updateGuestSlot(room.guest_id);
      }
    },
    () => {} // no events in waiting
  );
}

// ──────────────────────────────
// START GAME UI
// ──────────────────────────────
async function startGameUI(room, viewerRole) {
  const isHost = room.host_id === currentProfile.id;
  // Tentukan role saya
  if (isHost) {
    myRole = room.host_role;
  } else {
    myRole = room.host_role === 'question' ? 'answer' : 'question';
  }

  // Ambil nama lawan
  const oppId = isHost ? room.guest_id : room.host_id;
  const { data: opp } = await supabase.from('profiles').select('username').eq('id', oppId).single();
  const oppName = opp?.username || 'Lawan';

  // Update header skor
  document.getElementById('score-my-label').textContent = currentProfile.username.toUpperCase();
  document.getElementById('score-opp-label').textContent = oppName.toUpperCase();
  document.getElementById('score-my').textContent = isHost ? room.host_score : room.guest_score;
  document.getElementById('score-opp').textContent = isHost ? room.guest_score : room.host_score;
  document.getElementById('round-num').textContent = `${room.round} / ${room.max_rounds}`;

  // Role badge
  const badge = document.getElementById('role-badge');
  const icon = document.getElementById('role-icon');
  const roleName = document.getElementById('role-name');
  const roleDesc = document.getElementById('role-desc');

  if (myRole === 'question') {
    badge.className = 'role-badge question w-full';
    icon.textContent = '🗣️';
    roleName.textContent = 'QUESTION';
    roleDesc.textContent = 'Kamu punya kata rahasia. Bantu dengan petunjuk!';

    // Tampilkan kata rahasia
    document.getElementById('word-display').classList.remove('hidden');
    document.getElementById('secret-word').textContent = room.current_word.toUpperCase();

    // Tampilkan kontrol question, sembunyikan answer
    document.getElementById('controls-answer').classList.add('hidden');
    document.getElementById('controls-question').classList.remove('hidden');
    resetQuestionControls();
  } else {
    badge.className = 'role-badge answer w-full';
    icon.textContent = '🔍';
    roleName.textContent = 'ANSWER';
    roleDesc.textContent = 'Tebak kata yang dipikirkan lawan!';

    document.getElementById('word-display').classList.add('hidden');

    document.getElementById('controls-answer').classList.remove('hidden');
    document.getElementById('controls-question').classList.add('hidden');
  }

  // Clear events area
  const eventsArea = document.getElementById('events-area');
  eventsArea.innerHTML = '<div class="event-msg system"><div class="event-content">Round ' + room.round + ' dimulai!</div></div>';

  // Load events lama
  const events = await Game.getEvents(room.id);
  events.forEach(ev => appendEvent(ev));

  showScreen('screen-game');

  // Subscribe events baru
  Game.unsubscribe();
  Game.subscribeToRoom(room.id,
    async (updatedRoom) => {
      Game.setCurrentRoom(updatedRoom);
      const isH = updatedRoom.host_id === currentProfile.id;

      // Update skor
      document.getElementById('score-my').textContent = isH ? updatedRoom.host_score : updatedRoom.guest_score;
      document.getElementById('score-opp').textContent = isH ? updatedRoom.guest_score : updatedRoom.host_score;
      document.getElementById('round-num').textContent = `${updatedRoom.round} / ${updatedRoom.max_rounds}`;

      if (updatedRoom.status === 'finished') {
        showResults(updatedRoom);
        return;
      }

      // Round baru! Update role
      if (updatedRoom.round !== room.round) {
        await startGameUI(updatedRoom, viewerRole);
      }
    },
    (event) => {
      appendEvent(event);
      handleIncomingEvent(event);
    }
  );
}

// ──────────────────────────────
// EVENTS DISPLAY
// ──────────────────────────────
function appendEvent(ev) {
  const area = document.getElementById('events-area');
  const sender = ev.profiles?.username || 'Sistem';
  const div = document.createElement('div');
  div.className = `event-msg ${ev.event_type}`;

  let content = ev.content || '';
  let prefix = '';
  if (ev.event_type === 'hint_request') prefix = '💬 Pertanyaan: ';
  if (ev.event_type === 'hint_response') prefix = '💡 Petunjuk: ';
  if (ev.event_type === 'guess') prefix = '🎯 Tebakan: ';
  if (ev.event_type === 'answer_yesno') { prefix = ev.is_correct ? '✅ BENAR! ' : '❌ SALAH! '; }
  if (ev.event_type === 'round_result') prefix = '🏁 ';

  div.innerHTML = `
    <div class="event-sender">${sender}</div>
    <div class="event-content">${prefix}${content}</div>
  `;
  area.appendChild(div);
  area.scrollTop = area.scrollHeight;
}

function addSystemEvent(msg) {
  const area = document.getElementById('events-area');
  const div = document.createElement('div');
  div.className = 'event-msg system';
  div.innerHTML = `<div class="event-content">${msg}</div>`;
  area.appendChild(div);
  area.scrollTop = area.scrollHeight;
}

// ──────────────────────────────
// HANDLE INCOMING EVENTS
// ──────────────────────────────
function handleIncomingEvent(event) {
  const room = Game.getCurrentRoom();
  if (!room) return;

  if (event.sender_id === currentProfile.id) return; // sudah ditampilkan

  if (myRole === 'question') {
    if (event.event_type === 'hint_request') {
      // Tampilkan form balas hint
      pendingHintEvent = event;
      document.getElementById('hint-reply-area').classList.remove('hidden');
      document.getElementById('guess-reply-area').classList.add('hidden');
      document.getElementById('question-waiting').classList.add('hidden');
      document.getElementById('pending-hint-text').textContent = event.content;
      document.getElementById('hint-reply-input').value = '';
    }
    if (event.event_type === 'guess') {
      // Tampilkan form jawab tebakan (yes/no)
      pendingGuessEvent = event;
      document.getElementById('guess-reply-area').classList.remove('hidden');
      document.getElementById('hint-reply-area').classList.add('hidden');
      document.getElementById('question-waiting').classList.add('hidden');
      document.getElementById('pending-guess-text').textContent = event.content;
    }
  }

  if (myRole === 'answer') {
    if (event.event_type === 'hint_response') {
      // Petunjuk diterima, aktifkan kembali input
      document.getElementById('hint-input').disabled = false;
    }
    if (event.event_type === 'answer_yesno') {
      if (event.is_correct) {
        // Tebakan benar! host tentukan round result
        handleCorrectGuess();
      }
    }
  }
}

// ──────────────────────────────
// ANSWER CONTROLS
// ──────────────────────────────
async function sendHintRequest() {
  const input = document.getElementById('hint-input');
  const text = input.value.trim();
  if (!text) return;
  const room = Game.getCurrentRoom();
  try {
    input.disabled = true;
    input.placeholder = 'Menunggu petunjuk...';
    await Game.sendEvent(room.id, 'hint_request', text);
    appendEvent({ event_type: 'hint_request', content: text, profiles: { username: currentProfile.username } });
    input.value = '';
  } catch (e) {
    input.disabled = false;
    alert('Gagal kirim: ' + e.message);
  }
}

async function sendGuess() {
  const input = document.getElementById('guess-input');
  const text = input.value.trim();
  if (!text) return;
  const room = Game.getCurrentRoom();
  try {
    await Game.sendEvent(room.id, 'guess', text);
    appendEvent({ event_type: 'guess', content: text, profiles: { username: currentProfile.username } });
    input.value = '';
    addSystemEvent('Menunggu konfirmasi dari lawan...');
  } catch (e) {
    alert('Gagal kirim: ' + e.message);
  }
}

// ──────────────────────────────
// QUESTION CONTROLS
// ──────────────────────────────
async function sendHintReply() {
  const input = document.getElementById('hint-reply-input');
  const text = input.value.trim();
  if (!text || !pendingHintEvent) return;
  const room = Game.getCurrentRoom();
  try {
    await Game.sendEvent(room.id, 'hint_response', text);
    appendEvent({ event_type: 'hint_response', content: text, profiles: { username: currentProfile.username } });
    pendingHintEvent = null;
    document.getElementById('hint-reply-area').classList.add('hidden');
    document.getElementById('question-waiting').classList.remove('hidden');
    input.value = '';
  } catch (e) {
    alert('Gagal balas: ' + e.message);
  }
}

async function answerGuess(isCorrect) {
  if (!pendingGuessEvent) return;
  const room = Game.getCurrentRoom();
  const guessText = pendingGuessEvent.content;

  try {
    await Game.sendEvent(room.id, 'answer_yesno', guessText, isCorrect);
    appendEvent({
      event_type: 'answer_yesno',
      content: guessText,
      is_correct: isCorrect,
      profiles: { username: currentProfile.username }
    });

    pendingGuessEvent = null;
    document.getElementById('guess-reply-area').classList.add('hidden');

    if (isCorrect) {
      handleCorrectGuess();
    } else {
      document.getElementById('question-waiting').classList.remove('hidden');
    }
  } catch (e) {
    alert('Gagal jawab: ' + e.message);
  }
}

async function handleCorrectGuess() {
  const room = Game.getCurrentRoom();
  // Winner = role answer (yang menebak)
  let winnerId;
  if (myRole === 'question') {
    // saya question, yang menang adalah answer = lawan saya
    winnerId = room.host_id === currentProfile.id ? room.guest_id : room.host_id;
  } else {
    winnerId = currentProfile.id;
  }

  const isLastRound = room.round >= room.max_rounds;

  try {
    await Game.sendEvent(room.id, 'round_result', `Kata "${room.current_word}" berhasil ditebak!`);
    appendEvent({
      event_type: 'round_result',
      content: `Kata "${room.current_word}" berhasil ditebak!`,
      profiles: { username: 'Sistem' }
    });

    // Hanya host yang update room (untuk hindari double update)
    if (room.host_id === currentProfile.id) {
      await Game.updateRoundResult(room.id, winnerId, isLastRound);
    }
  } catch (e) {
    console.error(e);
  }
}

function resetQuestionControls() {
  document.getElementById('hint-reply-area').classList.add('hidden');
  document.getElementById('guess-reply-area').classList.add('hidden');
  document.getElementById('question-waiting').classList.remove('hidden');
  pendingHintEvent = null;
  pendingGuessEvent = null;
}

// ──────────────────────────────
// RESULTS
// ──────────────────────────────
async function showResults(room) {
  Game.unsubscribe();
  const isHost = room.host_id === currentProfile.id;
  const myScore = isHost ? room.host_score : room.guest_score;
  const oppScore = isHost ? room.guest_score : room.host_score;

  const oppId = isHost ? room.guest_id : room.host_id;
  const { data: opp } = await supabase.from('profiles').select('username').eq('id', oppId).single();
  const oppName = opp?.username || 'Lawan';

  // Tentukan menang/kalah
  let resultClass, emoji, text;
  if (myScore > oppScore) {
    resultClass = 'win'; emoji = '🏆'; text = 'MENANG!';
    await supabase.from('profiles').update({ wins: (currentProfile.wins || 0) + 1 }).eq('id', currentProfile.id);
  } else if (myScore < oppScore) {
    resultClass = 'lose'; emoji = '😔'; text = 'KALAH...';
    await supabase.from('profiles').update({ losses: (currentProfile.losses || 0) + 1 }).eq('id', currentProfile.id);
  } else {
    resultClass = 'draw'; emoji = '🤝'; text = 'SERI!';
  }

  document.getElementById('result-banner').className = `result-banner w-full ${resultClass}`;
  document.getElementById('result-emoji').textContent = emoji;
  document.getElementById('result-text').textContent = text;
  document.getElementById('result-my-label').textContent = currentProfile.username.toUpperCase();
  document.getElementById('result-opp-label').textContent = oppName.toUpperCase();
  document.getElementById('result-my-score').textContent = myScore;
  document.getElementById('result-opp-score').textContent = oppScore;
  document.getElementById('result-word').textContent = room.current_word?.toUpperCase() || '-';

  showScreen('screen-results');
  updateStats();
}

// ──────────────────────────────
// VS COM
// ──────────────────────────────
function startVsCom() {
  comState = { round: 1, maxRounds: 3, playerScore: 0, comScore: 0, hintCount: 0 };
  Game.COM.startGame();
  document.getElementById('com-score-player').textContent = '0';
  document.getElementById('com-score-com').textContent = '0';
  document.getElementById('com-round-num').textContent = `1 / 3`;

  const area = document.getElementById('com-events-area');
  area.innerHTML = '<div class="event-msg system"><div class="event-content">COM sudah memikirkan sebuah kata. Coba tebak!</div></div>';

  document.getElementById('com-hint-input').value = '';
  document.getElementById('com-hint-input').disabled = false;
  document.getElementById('com-guess-input').value = '';
  comState.hintCount = 0;

  showScreen('screen-game-com');
}

function comAddEvent(type, sender, content) {
  const area = document.getElementById('com-events-area');
  const div = document.createElement('div');
  div.className = `event-msg ${type}`;
  let prefix = '';
  if (type === 'hint_request') prefix = '💬 Pertanyaan: ';
  if (type === 'hint_response') prefix = '💡 Petunjuk COM: ';
  if (type === 'guess') prefix = '🎯 Tebakanmu: ';
  if (type === 'answer_yesno') prefix = content.startsWith('✅') ? '' : '';
  div.innerHTML = `<div class="event-sender">${sender}</div><div class="event-content">${prefix}${content}</div>`;
  area.appendChild(div);
  area.scrollTop = area.scrollHeight;
}

async function comSendHint() {
  const input = document.getElementById('com-hint-input');
  const text = input.value.trim();
  if (!text) return;

  comAddEvent('hint_request', currentProfile.username, text);
  input.value = '';
  input.disabled = true;

  // Simulasikan "COM berpikir"
  await delay(800);
  const reply = Game.COM.answerHint(text);
  comAddEvent('hint_response', '🤖 COM', reply);
  comState.hintCount++;
  input.disabled = false;
  input.placeholder = 'tanya sesuatu lagi...';
}

async function comSendGuess() {
  const input = document.getElementById('com-guess-input');
  const text = input.value.trim();
  if (!text) return;

  comAddEvent('guess', currentProfile.username, text);
  input.value = '';

  await delay(600);
  const isCorrect = Game.COM.checkGuess(text);

  if (isCorrect) {
    comAddEvent('answer_yesno', '🤖 COM', `✅ BENAR! Kata-nya memang "${Game.COM.word.toUpperCase()}"!`);
    comState.playerScore++;
    document.getElementById('com-score-player').textContent = comState.playerScore;

    await delay(1500);
    nextComRound();
  } else {
    comAddEvent('answer_yesno', '🤖 COM', `❌ Bukan itu. Coba lagi!`);
  }
}

async function nextComRound() {
  if (comState.round >= comState.maxRounds) {
    // Game selesai
    showComResults();
    return;
  }

  comState.round++;
  comState.hintCount = 0;
  document.getElementById('com-round-num').textContent = `${comState.round} / ${comState.maxRounds}`;

  const area = document.getElementById('com-events-area');
  area.innerHTML = `<div class="event-msg system"><div class="event-content">Round ${comState.round} dimulai! COM memikirkan kata baru.</div></div>`;

  Game.COM.startGame();
  document.getElementById('com-hint-input').disabled = false;
  document.getElementById('com-hint-input').placeholder = 'tanya sesuatu...';
}

function showComResults() {
  const ps = comState.playerScore;
  const cs = comState.comScore; // 0 karena COM selalu question

  let resultClass, emoji, text;
  if (ps > 0) { resultClass = 'win'; emoji = '🏆'; text = 'MENANG!'; }
  else { resultClass = 'lose'; emoji = '😔'; text = 'KALAH...'; }

  document.getElementById('result-banner').className = `result-banner w-full ${resultClass}`;
  document.getElementById('result-emoji').textContent = emoji;
  document.getElementById('result-text').textContent = text;
  document.getElementById('result-my-label').textContent = currentProfile.username.toUpperCase();
  document.getElementById('result-opp-label').textContent = 'COM';
  document.getElementById('result-my-score').textContent = ps;
  document.getElementById('result-opp-score').textContent = cs;
  document.getElementById('result-word').textContent = Game.COM.word?.toUpperCase() || '-';

  showScreen('screen-results');
}

// ──────────────────────────────
// UTILS
// ──────────────────────────────
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const active = document.querySelector('.screen.active');
    if (!active) return;
    const id = active.id;
    if (id === 'screen-auth') {
      const isLogin = !document.getElementById('form-login').classList.contains('hidden');
      if (isLogin) doLogin(); else doRegister();
    }
    if (id === 'screen-game') {
      const aCtrl = document.getElementById('controls-answer');
      if (!aCtrl.classList.contains('hidden')) {
        if (document.activeElement === document.getElementById('hint-input')) sendHintRequest();
        if (document.activeElement === document.getElementById('guess-input')) sendGuess();
      }
      const qCtrl = document.getElementById('controls-question');
      if (!qCtrl.classList.contains('hidden')) {
        if (document.activeElement === document.getElementById('hint-reply-input')) sendHintReply();
      }
    }
    if (id === 'screen-game-com') {
      if (document.activeElement === document.getElementById('com-hint-input')) comSendHint();
      if (document.activeElement === document.getElementById('com-guess-input')) comSendGuess();
    }
  }
});
