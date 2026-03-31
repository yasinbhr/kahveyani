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

  // Tüm işlemler admin only — JWT doğrulama
  const authHeader = event.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  const { data: userData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !userData?.user) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Yetkisiz' }) };
  }

  const method = event.httpMethod;
  const params = event.queryStringParameters || {};
  let body = {};
  if (event.body) {
    try { body = JSON.parse(event.body); } catch {}
  }

  try {
    // GET /api/users — tüm kullanıcılar
    if (method === 'GET') {
      const { data, error } = await supabase
        .from('profiles')
        .select('*, auth_user:id(email, created_at)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    // POST /api/users — yeni kullanıcı oluştur (admin manuel oluşturma)
    if (method === 'POST') {
      const { email, password, full_name, phone, company_name, user_type } = body;
      if (!email || !password) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'email ve password zorunlu' }) };
      }

      // Supabase Admin API ile kullanıcı oluştur
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (authError) throw authError;

      // Profil oluştur
      const { error: profileError } = await supabase
        .from('profiles')
        .insert([{
          id: authData.user.id,
          full_name: full_name || '',
          phone: phone || '',
          company_name: company_name || '',
          user_type: user_type || 'bireysel',
        }]);

      if (profileError) throw profileError;

      return {
        statusCode: 201, headers,
        body: JSON.stringify({
          success: true,
          user_id: authData.user.id,
          email: authData.user.email,
        }),
      };
    }

    // PUT /api/users?id=xxx — kullanıcı güncelle (tip değişikliği vb.)
    if (method === 'PUT') {
      if (!params.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id gerekli' }) };

      const { data, error } = await supabase
        .from('profiles')
        .update({
          full_name: body.full_name,
          phone: body.phone,
          company_name: body.company_name,
          user_type: body.user_type,
        })
        .eq('id', params.id)
        .select()
        .single();

      if (error) throw error;
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    // DELETE /api/users?id=xxx — kullanıcı sil
    if (method === 'DELETE') {
      if (!params.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id gerekli' }) };

      const { error } = await supabase.auth.admin.deleteUser(params.id);
      if (error) throw error;
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
