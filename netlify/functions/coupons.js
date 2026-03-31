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
    // GET /api/coupons?code=xxx&subtotal=yyy — kupon doğrula (herkes)
    if (method === 'GET' && params.code) {
      const subtotal = parseFloat(params.subtotal || '0');
      const { data: coupon } = await supabase
        .from('coupons')
        .select('*')
        .eq('code', params.code.toUpperCase())
        .eq('is_active', true)
        .single();

      if (!coupon) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Geçersiz kupon kodu' }) };

      const now = new Date();
      if (coupon.valid_from && new Date(coupon.valid_from) > now)
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Kupon henüz aktif değil' }) };
      if (coupon.valid_until && new Date(coupon.valid_until) < now)
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Kupon süresi dolmuş' }) };
      if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit)
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Kupon kullanım limiti doldu' }) };
      if (subtotal < coupon.min_order_amount)
        return { statusCode: 400, headers, body: JSON.stringify({ error: `Minimum sipariş tutarı ${coupon.min_order_amount}₺` }) };

      const discount = coupon.discount_type === 'percentage'
        ? (subtotal * coupon.discount_value) / 100
        : coupon.discount_value;

      return {
        statusCode: 200, headers,
        body: JSON.stringify({
          valid: true,
          discount_type: coupon.discount_type,
          discount_value: coupon.discount_value,
          discount_amount: parseFloat(Math.min(discount, subtotal).toFixed(2)),
        }),
      };
    }

    // Admin işlemleri
    if (!isAdmin) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Yetkisiz' }) };

    // GET /api/coupons — tüm kuponlar (admin)
    if (method === 'GET') {
      const { data, error } = await supabase.from('coupons').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    // POST /api/coupons — yeni kupon (admin)
    if (method === 'POST') {
      const { data, error } = await supabase
        .from('coupons')
        .insert([{ ...body, code: body.code.toUpperCase() }])
        .select()
        .single();
      if (error) throw error;
      return { statusCode: 201, headers, body: JSON.stringify(data) };
    }

    // PUT /api/coupons?id=xxx — kupon güncelle (admin)
    if (method === 'PUT') {
      if (!params.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id gerekli' }) };
      const { data, error } = await supabase
        .from('coupons')
        .update(body)
        .eq('id', params.id)
        .select()
        .single();
      if (error) throw error;
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    // DELETE /api/coupons?id=xxx — kupon sil (admin)
    if (method === 'DELETE') {
      if (!params.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id gerekli' }) };
      const { error } = await supabase.from('coupons').delete().eq('id', params.id);
      if (error) throw error;
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
