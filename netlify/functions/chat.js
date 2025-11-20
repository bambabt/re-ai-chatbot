// netlify/functions/chat.js
const fetch = require('node-fetch');

exports.handler = async function(event) {
  try {
    const body = JSON.parse(event.body || '{}');
    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    const ZAPIER_WEBHOOK = process.env.ZAPIER_WEBHOOK_URL; // must set in Netlify

    if (!OPENAI_KEY) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Server missing OPENAI_API_KEY' }) };
    }

    // Booking action: forward to Zapier webhook
    if (body.action === 'book') {
      const { name, email, when, context } = body;

      // send to Zapier
      if (!ZAPIER_WEBHOOK) {
        return { statusCode: 500, body: JSON.stringify({ error: 'Server missing ZAPIER_WEBHOOK_URL' }) };
      }

      const zapResp = await fetch(ZAPIER_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, when, context })
      });

      if (!zapResp.ok) {
        const text = await zapResp.text();
        return { statusCode: 502, body: JSON.stringify({ error: 'Zapier webhook error: ' + text }) };
      }

      // assume zapier returns JSON with event info or just 200
      const zapData = await (async () => {
        try { return await zapResp.json(); } catch (e) { return null; }
      })();

      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          message: 'Booking request sent. You will receive confirmation shortly.',
          zap: zapData || null,
          shareUrl: zapData?.shareUrl || null
        })
      };
    }

    // Chat action: call OpenAI Responses API
    if (body.action === 'chat') {
      const message = body.message || '';
      const context = body.context || [];

      // prepare a short system prompt
      const systemPrompt = "You are an assistant that helps users schedule appointments and answer real estate automation questions. Be friendly and concise.";

      // Call OpenAI Responses API
      const resp = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          input: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: message }
          ],
          max_output_tokens: 400
        })
      });

      const j = await resp.json();

      if (j.error) {
        console.error('OpenAI error', j.error);
        return { statusCode: 502, body: JSON.stringify({ error: j.error.message }) };
      }

      // parse response text safely
      const text = j.output?.[0]?.content?.[0]?.text || (j.output?.[0]?.content?.find(c => c.type === 'output_text')?.text) || null;
      return { statusCode: 200, body: JSON.stringify({ reply: text }) };
    }

    return { statusCode: 400, body: JSON.stringify({ error: 'Unknown action' }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};