// =============================================
// AUTH MODULE
// =============================================

const Auth = (() => {
  let supabase = null;

  function init(client) {
    supabase = client;
  }

  async function register(username, password) {
    if (!username || username.length < 3) throw new Error('Username minimal 3 karakter');
    if (!password || password.length < 6) throw new Error('Password minimal 6 karakter');
    if (!/^[a-zA-Z0-9_]+$/.test(username)) throw new Error('Username hanya boleh huruf, angka, dan underscore');

    // Cek username sudah dipakai
    const { data: existing } = await supabase
      .from('profiles')
      .select('username')
      .eq('username', username)
      .maybeSingle();
    if (existing) throw new Error('Username sudah dipakai');

    const fakeEmail = `${username.toLowerCase()}@tebakkata.game`;
    const { data, error } = await supabase.auth.signUp({
      email: fakeEmail,
      password,
      options: { data: { username } }
    });
    if (error) throw new Error(error.message);
    return data;
  }

  async function login(username, password) {
    if (!username || !password) throw new Error('Isi username dan password');
    const fakeEmail = `${username.toLowerCase()}@tebakkata.game`;
    const { data, error } = await supabase.auth.signInWithPassword({
      email: fakeEmail,
      password
    });
    if (error) throw new Error('Username atau password salah');
    return data;
  }

  async function logout() {
    await supabase.auth.signOut();
  }

  async function getSession() {
    const { data } = await supabase.auth.getSession();
    return data.session;
  }

  async function getProfile(userId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error) throw error;
    return data;
  }

  return { init, register, login, logout, getSession, getProfile };
})();
