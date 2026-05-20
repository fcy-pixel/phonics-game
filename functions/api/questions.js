const QWEN_BASE = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';

export async function onRequestPost({ request, env }) {
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
    const wrong   = recent.filter((r) => !r.correct).map((r) => r.letter).join(', ') || 'none';
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

  const data    = await upstream.json();
  const content = data.choices?.[0]?.message?.content ?? '{}';

  try {
    const parsed    = JSON.parse(content);
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
