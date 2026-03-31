const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const method = event.httpMethod;
  const params = event.queryStringParameters || {};
  let body = {};
  if (event.body) {
    try { body = JSON.parse(event.body); } catch {}
  }

  try {
    // GET /api/products          → tüm aktif ürünler
    // GET /api/products?slug=xxx → tek ürün
    // GET /api/products?admin=1  → tüm ürünler (admin)
    if (method === 'GET') {
      if (params.slug) {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .eq('slug', params.slug)
          .single();
        if (error) throw error;
        return { statusCode: 200, headers, body: JSON.stringify(data) };
      }

      let query = supabase.from('products').select('*').order('created_at', { ascending: false });
      if (!params.admin) query = query.eq('is_active', true);

      const { data, error } = await query;
      if (error) throw error;
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    // Admin işlemleri — JWT doğrulama
    const authHeader = event.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !userData?.user) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Yetkisiz' }) };
    }

    // POST /api/products → yeni ürün ekle
    if (method === 'POST') {
      const { data, error } = await supabase
        .from('products')
        .insert([body])
        .select()
        .single();
      if (error) throw error;
      return { statusCode: 201, headers, body: JSON.stringify(data) };
    }

    // PUT /api/products?id=xxx → ürün güncelle
    if (method === 'PUT') {
      if (!params.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id gerekli' }) };
      const { data, error } = await supabase
        .from('products')
        .update(body)
        .eq('id', params.id)
        .select()
        .single();
      if (error) throw error;
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    // DELETE /api/products?id=xxx → ürün sil
    if (method === 'DELETE') {
      if (!params.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id gerekli' }) };
      const { error } = await supabase.from('products').delete().eq('id', params.id);
      if (error) throw error;
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
