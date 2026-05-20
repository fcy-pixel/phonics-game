const QWEN_BASE = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';

export async function onRequestPost({ request, env }) {
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
      voice: 'Cherry',
      response_format: 'mp3',
      speed: 0.9,
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
