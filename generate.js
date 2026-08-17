// Vercel serverless function — proxies requests to Google's Gemini API using
// a server-side API key. Keeps the key out of the browser/client bundle.
//
// Setup on Vercel:
//   1. Get a free API key from https://aistudio.google.com/apikey
//   2. In your Vercel project: Settings -> Environment Variables
//      Add: GEMINI_API_KEY = AIza...
//   3. Redeploy (env var changes require a redeploy to take effect)
//
// This returns responses in the same {content:[{type:'text', text:'...'}]}
// shape the frontend already expects, so index.html doesn't need to know
// which provider is behind the proxy.

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: 'GEMINI_API_KEY is not set on the server. Add it in Vercel > Settings > Environment Variables, then redeploy.'
    });
    return;
  }

  try {
    const { messages, system } = req.body || {};
    if (!messages) {
      res.status(400).json({ error: 'Missing "messages" in request body' });
      return;
    }

    // Translate Anthropic-style messages (role: user/assistant) into
    // Gemini's contents format (role: user/model).
    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const geminiBody = { contents };
    if (system) {
      geminiBody.systemInstruction = { parts: [{ text: system }] };
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(geminiBody),
    });

    const data = await geminiRes.json();

    if (!geminiRes.ok) {
      res.status(geminiRes.status).json({ error: data.error?.message || 'Gemini API error' });
      return;
    }

    const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('\n') || '';

    // Return in the shape the frontend already expects
    res.status(200).json({ content: [{ type: 'text', text }] });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Unknown server error' });
  }
};
