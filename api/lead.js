
const crypto = require('crypto');

function json(res, status, data) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.end(JSON.stringify(data));
}

function solapiAuth(key, secret) {
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(16).toString('hex');
  const signature = crypto.createHmac('sha256', secret)
    .update(date + salt).digest('hex');
  return `HMAC-SHA256 apiKey=${key}, date=${date}, salt=${salt}, signature=${signature}`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { ok: false, message: '허용되지 않은 요청입니다.' });
  }

  const origin = req.headers.origin;
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.host) {
        return json(res, 403, { ok: false, message: '요청을 확인할 수 없습니다.' });
      }
    } catch {
      return json(res, 403, { ok: false, message: '요청을 확인할 수 없습니다.' });
    }
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const phone = String(body.phone || '').replace(/\D/g, '');
  if (!/^01[016789]\d{7,8}$/.test(phone)) {
    return json(res, 400, { ok: false, message: '휴대전화 번호를 확인해 주세요.' });
  }
  if (body.consent !== true) {
    return json(res, 400, { ok: false, message: '개인정보 동의가 필요합니다.' });
  }

  const key = process.env.SOLAPI_API_KEY;
  const secret = process.env.SOLAPI_API_SECRET;
  const from = String(process.env.SOLAPI_SENDER || '').replace(/\D/g, '');
  const to = String(process.env.NOTIFY_PHONE || '').replace(/\D/g, '');

  if (!key || !secret || !/^\d{9,15}$/.test(from) || !/^\d{9,15}$/.test(to)) {
    return json(res, 500, { ok: false, message: '문자 발송 설정을 확인해 주세요.' });
  }

  const text = `[대광로제비앙 메가시티] 새 방문예약·상담 신청\n고객 연락처: ${phone}\n접수시각: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`;

  try {
    const response = await fetch('https://api.solapi.com/messages/v4/send-many/detail', {
      method: 'POST',
      headers: {
        Authorization: solapiAuth(key, secret),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ messages: [{ to, from, text }] })
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok || (result.failedMessageList?.length || 0) > 0) {
      console.error('Solapi send failed:', response.status);
      return json(res, 502, { ok: false, message: '문자 발송에 실패했습니다.' });
    }

    return json(res, 200, { ok: true, message: '상담 신청이 접수되었습니다.' });
  } catch (error) {
    console.error('Lead notification error:', error.message);
    return json(res, 502, { ok: false, message: '잠시 후 다시 시도해 주세요.' });
  }
};
