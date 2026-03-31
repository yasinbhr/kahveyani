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

  const authHeader = event.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  const { data: userData } = await supabase.auth.getUser(token);
  const isAdmin = !!userData?.user;

  try {
    // POST /api/bayi-request — yeni bayi talebi gönder (herkese açık)
    if (method === 'POST') {
      const required = ['full_name', 'company_name', 'email', 'phone'];
      for (const field of required) {
        if (!body[field]) return {
          statusCode: 400, headers,
          body: JSON.stringify({ error: `${field} zorunlu` }),
        };
      }

      const { data, error } = await supabase
        .from('bayi_requests')
        .insert([{
          full_name: body.full_name,
          company_name: body.company_name,
          email: body.email,
          phone: body.phone,
          address: body.address || '',
          notes: body.notes || '',
        }])
        .select()
        .single();

      if (error) throw error;
      return { statusCode: 201, headers, body: JSON.stringify({ success: true, id: data.id }) };
    }

    // Admin işlemleri
    if (!isAdmin) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Yetkisiz' }) };

    // GET /api/bayi-request — tüm talepler (admin)
    if (method === 'GET') {
      let query = supabase.from('bayi_requests').select('*').order('created_at', { ascending: false });
      if (params.status) query = query.eq('status', params.status);
      const { data, error } = await query;
      if (error) throw error;
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    // PUT /api/bayi-request?id=xxx — talep durumu güncelle (admin)
    if (method === 'PUT') {
      if (!params.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id gerekli' }) };
      const { data, error } = await supabase
        .from('bayi_requests')
        .update({ status: body.status })
        .eq('id', params.id)
        .select()
        .single();
      if (error) throw error;
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
