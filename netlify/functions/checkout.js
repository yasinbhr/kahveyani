const Iyzipay = require('iyzipay');
const { createClient } = require('@supabase/supabase-js');

const iyzipay = new Iyzipay({
  apiKey: process.env.IYZICO_API_KEY,
  secretKey: process.env.IYZICO_SECRET_KEY,
  uri: process.env.IYZICO_BASE_URL || 'https://sandbox-api.iyzipay.com',
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

// Sipariş numarası üret: KY-2026-00001
async function generateOrderNumber() {
  const year = new Date().getFullYear();
  const { count } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true });
  const seq = String((count || 0) + 1).padStart(5, '0');
  return `KY-${year}-${seq}`;
}

// Kupon doğrula ve indirim hesapla
async function validateCoupon(code, subtotal) {
  if (!code) return { valid: false, discount: 0 };

  const { data: coupon } = await supabase
    .from('coupons')
    .select('*')
    .eq('code', code.toUpperCase())
    .eq('is_active', true)
    .single();

  if (!coupon) return { valid: false, discount: 0, error: 'Geçersiz kupon kodu' };

  const now = new Date();
  if (coupon.valid_from && new Date(coupon.valid_from) > now)
    return { valid: false, discount: 0, error: 'Kupon henüz aktif değil' };
  if (coupon.valid_until && new Date(coupon.valid_until) < now)
    return { valid: false, discount: 0, error: 'Kupon süresi dolmuş' };
  if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit)
    return { valid: false, discount: 0, error: 'Kupon kullanım limiti doldu' };
  if (subtotal < coupon.min_order_amount)
    return { valid: false, discount: 0, error: `Minimum sipariş tutarı ${coupon.min_order_amount}₺` };

  const discount = coupon.discount_type === 'percentage'
    ? (subtotal * coupon.discount_value) / 100
    : coupon.discount_value;

  return { valid: true, discount: Math.min(discount, subtotal), coupon };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Geçersiz JSON' }) };
  }

  const { customer, items, card, coupon_code, user_id } = body;

  if (!customer || !items || !card || !items.length) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Eksik bilgi' }) };
  }

  try {
    // Ürün fiyatlarını veritabanından doğrula (frontend manipülasyonunu engelle)
    const productIds = items.map(i => i.product_id);
    const { data: products } = await supabase
      .from('products')
      .select('id, name, price')
      .in('id', productIds);

    const productMap = Object.fromEntries(products.map(p => [p.id, p]));

    // Bayi indirimi kontrol et
    let bayiDiscount = 0;
    if (user_id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('user_type')
        .eq('id', user_id)
        .single();

      if (profile?.user_type === 'bayi') {
        const { data: setting } = await supabase
          .from('settings')
          .select('value')
          .eq('key', 'bayi_discount_percentage')
          .single();
        bayiDiscount = parseFloat(setting?.value || '0');
      }
    }

    // Subtotal hesapla (veritabanı fiyatlarıyla)
    const verifiedItems = items.map(item => {
      const product = productMap[item.product_id];
      if (!product) throw new Error(`Ürün bulunamadı: ${item.product_id}`);
      const price = bayiDiscount > 0
        ? product.price * (1 - bayiDiscount / 100)
        : product.price;
      return {
        product_id: product.id,
        product_name: product.name,
        product_price: parseFloat(price.toFixed(2)),
        quantity: item.quantity,
        subtotal: parseFloat((price * item.quantity).toFixed(2)),
      };
    });

    const subtotal = verifiedItems.reduce((sum, i) => sum + i.subtotal, 0);

    // Kupon doğrula
    const couponResult = await validateCoupon(coupon_code, subtotal);
    if (coupon_code && !couponResult.valid) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: couponResult.error }) };
    }

    const discountAmount = (bayiDiscount > 0 ? 0 : couponResult.discount) || 0;
    const total = parseFloat((subtotal - discountAmount).toFixed(2));
    const totalStr = total.toFixed(2);

    // iyzico ödeme isteği
    const request = {
      locale: Iyzipay.LOCALE.TR,
      conversationId: `ky-${Date.now()}`,
      price: totalStr,
      paidPrice: totalStr,
      currency: Iyzipay.CURRENCY.TRY,
      installment: '1',
      basketId: `basket-${Date.now()}`,
      paymentChannel: Iyzipay.PAYMENT_CHANNEL.WEB,
      paymentGroup: Iyzipay.PAYMENT_GROUP.PRODUCT,
      paymentCard: {
        cardHolderName: card.holderName,
        cardNumber: card.number,
        expireMonth: card.expireMonth,
        expireYear: card.expireYear,
        cvc: card.cvc,
        registerCard: '0',
      },
      buyer: {
        id: user_id || `guest-${Date.now()}`,
        name: customer.firstName,
        surname: customer.lastName,
        gsmNumber: customer.phone,
        email: customer.email,
        identityNumber: '11111111111',
        registrationAddress: customer.address,
        ip: event.headers['x-forwarded-for'] || '85.34.78.112',
        city: customer.city,
        country: 'Turkey',
      },
      shippingAddress: {
        contactName: `${customer.firstName} ${customer.lastName}`,
        city: customer.city,
        country: 'Turkey',
        address: customer.address,
      },
      billingAddress: {
        contactName: `${customer.firstName} ${customer.lastName}`,
        city: customer.city,
        country: 'Turkey',
        address: customer.address,
      },
      basketItems: verifiedItems.map((item, i) => ({
        id: item.product_id || `item-${i}`,
        name: item.product_name,
        category1: 'Çikolata',
        itemType: Iyzipay.BASKET_ITEM_TYPE.PHYSICAL,
        price: item.subtotal.toFixed(2),
      })),
    };

    return new Promise((resolve) => {
      iyzipay.payment.create(request, async (err, result) => {
        if (err) {
          console.error('iyzico hata:', err);
          return resolve({
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Ödeme servisi hatası' }),
          });
        }

        if (result.status !== 'success') {
          return resolve({
            statusCode: 400,
            headers,
            body: JSON.stringify({
              error: result.errorMessage || 'Ödeme başarısız',
              errorCode: result.errorCode,
            }),
          });
        }

        // Ödeme başarılı → sipariş + kalemler oluştur
        try {
          const orderNumber = await generateOrderNumber();

          const { data: order, error: orderError } = await supabase
            .from('orders')
            .insert([{
              order_number: orderNumber,
              user_id: user_id || null,
              customer_name: `${customer.firstName} ${customer.lastName}`,
              customer_email: customer.email,
              customer_phone: customer.phone,
              shipping_address: {
                address: customer.address,
                city: customer.city,
                district: customer.district || '',
              },
              subtotal: parseFloat(subtotal.toFixed(2)),
              discount_amount: discountAmount,
              coupon_code: coupon_code || null,
              total: total,
              status: 'preparing',
              payment_status: 'paid',
              payment_id: result.paymentId,
            }])
            .select()
            .single();

          if (orderError) throw orderError;

          // Sipariş kalemlerini kaydet
          const { error: itemsError } = await supabase
            .from('order_items')
            .insert(verifiedItems.map(item => ({
              order_id: order.id,
              ...item,
            })));

          if (itemsError) throw itemsError;

          // Kupon kullanım sayısını artır
          if (couponResult.valid && couponResult.coupon) {
            await supabase
              .from('coupons')
              .update({ used_count: couponResult.coupon.used_count + 1 })
              .eq('id', couponResult.coupon.id);
          }

          resolve({
            statusCode: 200,
            headers,
            body: JSON.stringify({
              success: true,
              orderId: order.id,
              orderNumber: orderNumber,
              paymentId: result.paymentId,
            }),
          });
        } catch (dbErr) {
          console.error('DB hata:', dbErr);
          resolve({
            statusCode: 200,
            headers,
            body: JSON.stringify({
              success: true,
              paymentId: result.paymentId,
              warning: 'Ödeme alındı ancak sipariş kaydında sorun oluştu.',
            }),
          });
        }
      });
    });

  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
