// =============================================
// GAME MODULE
// =============================================

const Game = (() => {
  let supabase = null;
  let currentRoom = null;
  let currentProfile = null;
  let roomSubscription = null;
  let eventsSubscription = null;

  function init(client, profile) {
    supabase = client;
    currentProfile = profile;
  }

  // ─── Kata-kata untuk VS COM ───
  const COM_WORDS = [
    'kucing','anjing','gajah','harimau','kelinci','burung','ikan','kuda',
    'singa','monyet','buaya','ular','apel','mangga','pisang','jeruk',
    'anggur','semangka','nanas','pepaya','kursi','meja','buku','pensil',
    'sepatu','tas','jam','kunci','mobil','motor','pesawat','kapal',
    'dokter','guru','polisi','petani','rumah','sekolah','pasar','pantai',
    'nasi','mie','roti','sate','rendang','bakso','gado-gado','tempe'
  ];

  function getRandomWord() {
    return COM_WORDS[Math.floor(Math.random() * COM_WORDS.length)];
  }

  function generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }

  // ─── VS PLAYER: Create Room ───
  async function createRoom() {
    const code = generateCode();
    const { data, error } = await supabase
      .from('rooms')
      .insert({
        code,
        host_id: currentProfile.id,
        status: 'waiting'
      })
      .select()
      .single();
    if (error) throw new Error('Gagal membuat room: ' + error.message);
    currentRoom = data;
    return data;
  }

  // ─── VS PLAYER: Join Room ───
  async function joinRoom(code) {
    const { data: room, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('code', code.toUpperCase())
      .eq('status', 'waiting')
      .single();
    if (error || !room) throw new Error('Kode room tidak ditemukan atau sudah penuh');
    if (room.host_id === currentProfile.id) throw new Error('Kamu tidak bisa join room sendiri');

    const { data: updated, error: err2 } = await supabase
      .from('rooms')
      .update({ guest_id: currentProfile.id })
      .eq('id', room.id)
      .select()
      .single();
    if (err2) throw new Error('Gagal join room');
    currentRoom = updated;
    return updated;
  }

  // ─── VS PLAYER: Start Game (host only) ───
  async function startGame(roomId) {
    const word = getRandomWord();
    const hostRole = Math.random() > 0.5 ? 'question' : 'answer';

    const { data, error } = await supabase
      .from('rooms')
      .update({
        status: 'playing',
        current_word: word,
        host_role: hostRole,
        updated_at: new Date().toISOString()
      })
      .eq('id', roomId)
      .select()
      .single();
    if (error) throw new Error('Gagal memulai game');
    currentRoom = data;
    return data;
  }

  // ─── Kirim Event / Pesan ───
  async function sendEvent(roomId, eventType, content, isCorrect = null) {
    const payload = {
      room_id: roomId,
      sender_id: currentProfile.id,
      event_type: eventType,
      content
    };
    if (isCorrect !== null) payload.is_correct = isCorrect;

    const { data, error } = await supabase
      .from('game_events')
      .insert(payload)
      .select()
      .single();
    if (error) throw new Error('Gagal kirim event: ' + error.message);
    return data;
  }

  // ─── Ambil semua events dalam room ───
  async function getEvents(roomId) {
    const { data, error } = await supabase
      .from('game_events')
      .select('*, profiles(username)')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  // ─── Subscribe realtime room changes ───
  function subscribeToRoom(roomId, onRoomChange, onEvent) {
    // Subscribe room updates
    roomSubscription = supabase
      .channel(`room:${roomId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'rooms',
        filter: `id=eq.${roomId}`
      }, (payload) => {
        currentRoom = payload.new;
        onRoomChange(payload.new);
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'game_events',
        filter: `room_id=eq.${roomId}`
      }, async (payload) => {
        // Enrich dengan username
        const { data: profile } = await supabase
          .from('profiles')
          .select('username')
          .eq('id', payload.new.sender_id)
          .single();
        payload.new.profiles = profile;
        onEvent(payload.new);
      })
      .subscribe();
  }

  function unsubscribe() {
    if (roomSubscription) {
      supabase.removeChannel(roomSubscription);
      roomSubscription = null;
    }
  }

  // ─── Perbarui skor & round ───
  async function updateRoundResult(roomId, winnerId, isLastRound) {
    const room = currentRoom;
    const isHostWinner = winnerId === room.host_id;
    const newHostScore = isHostWinner ? room.host_score + 1 : room.host_score;
    const newGuestScore = !isHostWinner ? room.guest_score + 1 : room.guest_score;
    const newRound = room.round + 1;
    const newStatus = isLastRound ? 'finished' : 'playing';
    const newWord = isLastRound ? room.current_word : getRandomWord();
    const newHostRole = isLastRound ? room.host_role : (room.host_role === 'question' ? 'answer' : 'question');

    const { data, error } = await supabase
      .from('rooms')
      .update({
        host_score: newHostScore,
        guest_score: newGuestScore,
        round: newRound,
        status: newStatus,
        current_word: newWord,
        host_role: newHostRole,
        updated_at: new Date().toISOString()
      })
      .eq('id', roomId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  // ─── VS COM: AI logic ───
  const COM = {
    word: '',
    hints: [],

    startGame() {
      this.word = getRandomWord();
      this.hints = [];
      return this.word;
    },

    // COM selalu jujur
    answerHint(hint) {
      const word = this.word.toLowerCase();
      const h = hint.toLowerCase().trim();

      // Deteksi yes/no question
      if (h.includes('hewan') || h.includes('binatang')) return word && isHewan(word) ? 'Ya' : 'Tidak';
      if (h.includes('buah')) return isBuah(word) ? 'Ya' : 'Tidak';
      if (h.includes('benda')) return isBenda(word) ? 'Ya' : 'Tidak';
      if (h.includes('makanan')) return isMakanan(word) ? 'Ya' : 'Tidak';
      if (h.includes('kendaraan')) return isKendaraan(word) ? 'Ya' : 'Tidak';
      if (h.includes('tempat')) return isTempat(word) ? 'Ya' : 'Tidak';
      if (h.includes('huruf') && h.match(/huruf\s+([a-z])/i)) {
        const m = h.match(/huruf\s+([a-z])/i);
        return word.includes(m[1].toLowerCase()) ? 'Ya' : 'Tidak';
      }
      if (h.includes('berapa') && h.includes('huruf')) {
        return `Kata ini terdiri dari ${word.length} huruf`;
      }
      if (h.includes('dimulai') || h.includes('diawali')) {
        return `Kata ini diawali huruf "${word[0].toUpperCase()}"`;
      }

      // Fallback: jawab jujur dengan deskripsi singkat
      this.hints.push(hint);
      if (this.hints.length === 1) return `Ini adalah sebuah ${getCategoryHint(word)}`;
      if (this.hints.length === 2) return `Kata ini terdiri dari ${word.length} huruf`;
      return `Huruf pertamanya adalah "${word[0].toUpperCase()}"`;
    },

    checkGuess(guess) {
      return guess.toLowerCase().trim() === this.word.toLowerCase();
    }
  };

  function isHewan(w) { return ['kucing','anjing','gajah','harimau','kelinci','burung','ikan','kuda','singa','monyet','buaya','ular'].includes(w); }
  function isBuah(w) { return ['apel','mangga','pisang','jeruk','anggur','semangka','nanas','pepaya'].includes(w); }
  function isBenda(w) { return ['kursi','meja','buku','pensil','sepatu','tas','jam','kunci'].includes(w); }
  function isMakanan(w) { return ['nasi','mie','roti','sate','rendang','bakso','gado-gado','tempe'].includes(w); }
  function isKendaraan(w) { return ['mobil','motor','pesawat','kapal'].includes(w); }
  function isTempat(w) { return ['rumah','sekolah','pasar','pantai'].includes(w); }

  function getCategoryHint(w) {
    if (isHewan(w)) return 'hewan/binatang';
    if (isBuah(w)) return 'buah-buahan';
    if (isBenda(w)) return 'benda/objek';
    if (isMakanan(w)) return 'makanan';
    if (isKendaraan(w)) return 'kendaraan/transportasi';
    if (isTempat(w)) return 'tempat/lokasi';
    if (['dokter','guru','polisi','petani'].includes(w)) return 'profesi/pekerjaan';
    return 'sesuatu';
  }

  function getCurrentRoom() { return currentRoom; }
  function setCurrentRoom(room) { currentRoom = room; }
  function getCurrentProfile() { return currentProfile; }

  return {
    init, createRoom, joinRoom, startGame,
    sendEvent, getEvents, subscribeToRoom, unsubscribe,
    updateRoundResult, getRandomWord, COM,
    getCurrentRoom, setCurrentRoom, getCurrentProfile
  };
})();
