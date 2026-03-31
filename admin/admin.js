// Admin shared utilities — Supabase Auth + API helpers

const SUPABASE_URL = window.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || '';

// Inline Supabase config (set these before this script, or via meta tags)
// We read from <meta name="x-supabase-url"> / <meta name="x-supabase-anon-key">
function getSupabaseConfig() {
  const urlMeta = document.querySelector('meta[name="x-supabase-url"]');
  const keyMeta = document.querySelector('meta[name="x-supabase-anon-key"]');
  return {
    url: urlMeta?.content || '',
    key: keyMeta?.content || '',
  };
}

const AdminAuth = (() => {
  let _client = null;

  function client() {
    if (!_client) {
      const { url, key } = getSupabaseConfig();
      if (!url || !key) {
        console.error('Supabase config meta tags missing.');
        return null;
      }
      _client = supabase.createClient(url, key);
    }
    return _client;
  }

  async function signIn(email, password) {
    const { data, error } = await client().auth.signInWithPassword({ email, password });
    return { data, error };
  }

  async function signOut() {
    await client().auth.signOut();
    window.location.href = "/admin/login.html";
  }

  async function getSession() {
    const { data } = await client().auth.getSession();
    return data?.session || null;
  }

  async function requireAuth() {
    const session = await getSession();
    if (!session) {
      window.location.href = "/admin/login.html";
      return null;
    }
    return session;
  }

  function getAccessToken() {
    return client().auth.getSession().then(({ data }) => data?.session?.access_token || '');
  }

  return { signIn, signOut, getSession, requireAuth, getAccessToken, client };
})();

// API helpers
const AdminAPI = {
  async get(path) {
    const token = await AdminAuth.getAccessToken();
    const res = await fetch(path, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async post(path, body) {
    const token = await AdminAuth.getAccessToken();
    const res = await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async put(path, body) {
    const token = await AdminAuth.getAccessToken();
    const res = await fetch(path, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async delete(path) {
    const token = await AdminAuth.getAccessToken();
    const res = await fetch(path, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async uploadImage(file) {
    const token = await AdminAuth.getAccessToken();
    const ext = file.name.split('.').pop();
    const fileName = `products/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { url, key } = getSupabaseConfig();
    const uploadUrl = `${url}/storage/v1/object/product-images/${fileName}`;
    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': file.type,
        'x-upsert': 'true',
      },
      body: file,
    });
    if (!res.ok) throw new Error('Görsel yükleme başarısız');
    return `${url}/storage/v1/object/public/product-images/${fileName}`;
  },
};

function formatPrice(p) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(p);
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('tr-TR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function showToast(msg, type = 'success') {
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:9999;padding:12px 20px;
    border-radius:4px;font-family:'Sneak',sans-serif;font-size:0.875em;color:#fff;
    background:${type === 'success' ? '#2d7a4f' : '#c0392b'};
    box-shadow:0 4px 20px rgba(0,0,0,0.4);animation:fadeIn 0.2s ease;`;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}
