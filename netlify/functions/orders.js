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
    // GET /api/orders — admin: tüm siparişler + kalemler
    if (method === 'GET' && isAdmin) {
      let query = supabase
        .from('orders')
        .select('*, order_items(*)')
        .order('created_at', { ascending: false });

      if (params.status) query = query.eq('status', params.status);

      const { data, error } = await query;
      if (error) throw error;
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    // GET /api/orders?order_number=KY-xxx — müşteri sipariş sorgulama
    if (method === 'GET' && params.order_number) {
      const { data, error } = await supabase
        .from('orders')
        .select('order_number, status, total, created_at, shipping_address, cargo_tracking_no, order_items(*)')
        .eq('order_number', params.order_number)
        .single();
      if (error) throw error;
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    // PUT /api/orders?id=xxx — sipariş durumu güncelle (admin)
    if (method === 'PUT' && isAdmin) {
      if (!params.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id gerekli' }) };

      const updateData = { updated_at: new Date().toISOString() };
      if (body.status) updateData.status = body.status;
      if (body.cargo_tracking_no !== undefined) updateData.cargo_tracking_no = body.cargo_tracking_no;

      const { data, error } = await supabase
        .from('orders')
        .update(updateData)
        .eq('id', params.id)
        .select()
        .single();
      if (error) throw error;
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Yetkisiz' }) };

  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
