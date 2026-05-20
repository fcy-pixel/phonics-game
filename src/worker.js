import GAME_HTML from './game.html';

const QWEN_BASE = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';

/**
 * Proxy TTS request to Qwen CosyVoice API.
 * Returns MP3 binary directly to the client.
 */
async function handleTTS(request, env) {
  const { text } = await request.json();

  if (!env.QWEN_API_KEY) {
    return new Response('TTS service not configured', { status: 503 });
  }

  const upstream = await fetch(`${QWEN_BASE}/audio/speech`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.QWEN_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'cosyvoice-v1',
      input: text,
      voice: 'Cherry',       // clear English female voice suitable for children
      response_format: 'mp3',
      speed: 0.9,             // slightly slower for young learners
    }),
  });

  if (!upstream.ok) {
    const err = await upstream.text();
    console.error('Qwen TTS error:', upstream.status, err);
    return new Response('TTS upstream error', { status: 502 });
  }

  const audio = await upstream.arrayBuffer();
  return new Response(audio, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * Generate adaptive phonics questions via Qwen chat completions.
 * Accepts { history: [{letter, correct}] } in the request body.
 * Returns a JSON array of question objects.
 */
async function handleQuestions(request, env) {
  const { history } = await request.json();

  if (!env.QWEN_API_KEY) {
    return new Response('[]', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let historyText = 'The student has just started learning.';
  if (Array.isArray(history) && history.length > 0) {
    const recent = history.slice(-6);
    const correct = recent.filter((r) => r.correct).map((r) => r.letter).join(', ') || 'none';
    const wrong = recent.filter((r) => !r.correct).map((r) => r.letter).join(', ') || 'none';
    historyText = `Recently correct: ${correct}. Recently wrong: ${wrong}. Focus on reinforcing wrong letters.`;
  }

  const prompt = `You are a cheerful AI teacher for 5-6 year old children learning English Phonics.
${historyText}
Generate exactly 3 alphabet multiple choice questions appropriate to the student's level.
Return a JSON object with a single key "questions" whose value is an array of 3 objects.
Each object MUST have these exact keys:
- "targetLetter": one uppercase letter A-Z
- "choices": array of exactly 3 uppercase letters (must include targetLetter; pick visually confusable letters like B/D/P)
- "word": a very simple English word starting with that letter (e.g. "Apple", "Ball", "Cat", "Dog")
- "message": a short fun encouraging sentence in English with a clear sound hint (e.g. "Find the letter B! B says buh like Ball!")`;

  const upstream = await fetch(`${QWEN_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.QWEN_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'qwen-plus',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful phonics teacher. Always respond with valid JSON only. No markdown, no code fences.',
        },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    }),
  });

  if (!upstream.ok) {
    console.error('Qwen questions error:', upstream.status);
    return new Response('[]', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const data = await upstream.json();
  const content = data.choices?.[0]?.message?.content ?? '{}';

  try {
    const parsed = JSON.parse(content);
    const questions = Array.isArray(parsed) ? parsed : (parsed.questions ?? []);
    return new Response(JSON.stringify(questions), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response('[]', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { method, pathname } = { method: request.method, pathname: url.pathname };

    // CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    if (method === 'POST' && pathname === '/api/tts') return handleTTS(request, env);
    if (method === 'POST' && pathname === '/api/questions') return handleQuestions(request, env);

    // Serve the game for every other route
    return new Response(GAME_HTML, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  },
};
