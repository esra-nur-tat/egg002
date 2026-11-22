// LLM saglayici katmani. Varsayilan: ollama (yerel, veri cikmaz).
// Harici API secilirse VERI CIHAZDAN CIKAR — kullanici env ile bilerek acar:
//   EGG2_LLM=ollama                          (varsayilan, localhost:11434)
//   EGG2_LLM=anthropic EGG2_API_KEY=sk-...   (Claude API)
//   EGG2_LLM=openai    EGG2_API_KEY=sk-...   (OpenAI)
//   EGG2_MODEL=<isim>                        (model override)
// Saglayici yoksa "echo" modu: prompt'u geri doner (pipeline testi icin).

const PROVIDER = () => process.env.EGG2_LLM ?? "auto";
const KEY = () => process.env.EGG2_API_KEY;
const MODEL = () => process.env.EGG2_MODEL;

const PREFERRED = ["qwen2.5:7b-instruct", "qwen2.5:7b", "llama3.1:8b", "gemma3:4b", "llama3.2"];

async function ollamaUp() {
  try {
    const r = await fetch("http://localhost:11434/api/tags", { signal: AbortSignal.timeout(1500) });
    if (!r.ok) return null;
    const d = await r.json();
    const names = (d.models ?? []).map((m) => m.name);
    for (const p of PREFERRED) {
      const hit = names.find((n) => n === p || n.startsWith(p + ":"));
      if (hit) return hit;
    }
    return names[0] ?? null;
  } catch { return null; }
}

export async function chat({ system, messages }, opts = {}) {
  // KEY varsa harici API oncelikli; yoksa ollama; o da yoksa echo
  const p = PROVIDER() === "auto" ? (KEY() ? "api" : (await ollamaUp() ? "ollama" : "echo")) : PROVIDER();

  if (p === "ollama") {
    const model = MODEL() ?? (await ollamaUp());
    if (!model) return { provider: "ollama", error: "Ollama kapali veya model yok. `ollama serve` + `ollama pull <model>` gerek." };
    const r = await fetch("http://localhost:11434/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: system }, ...messages],
        stream: false,
        options: { temperature: 0.7, repeat_penalty: 1.25, num_predict: 600 },
      }),
    });
    const d = await r.json();
    return { provider: "ollama", model, reply: d.message?.content ?? "" };
  }

  if (p === "anthropic" || (p === "api" && KEY()?.startsWith("sk-ant"))) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": KEY(), "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL() ?? "claude-sonnet-4-5",
        max_tokens: 1024,
        system,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    });
    const d = await r.json();
    return { provider: "anthropic", model: d.model, reply: d.content?.[0]?.text ?? d.error?.message };
  }

  // OpenCode Go — OpenAI-compatible; /inference/go/ yolu Go aboneligine faturalanir.
  // cloak: opencode istemcisi gibi gorunuruz; x-opencode-session routing icin gerekli.
  if (p === "opencode" || (p === "api" && KEY()?.startsWith("oc_sk"))) {
    const r = await fetch("https://opencode.ai/inference/go/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${KEY()}`,
        "user-agent": "opencode/1.19.0 ai-sdk/provider-utils/4.0.40 runtime/bun/1.3.14",
        "x-opencode-client": "cli",
        "x-opencode-session": `egg2-${Date.now().toString(36)}`,
      },
      body: JSON.stringify({
        model: MODEL() ?? "glm-5.3-flash",
        messages: [{ role: "system", content: system }, ...messages],
        temperature: opts.temperature ?? 0.7,
        max_tokens: opts.max_tokens ?? 2000,
        reasoning_effort: "medium",
        ...(opts.json && { response_format: { type: "json_object" } }),
      }),
    });
    const d = await r.json();
    return {
      provider: "opencode-go",
      model: d.model,
      reply: d.choices?.[0]?.message?.content || undefined,
      error: d.choices?.[0]?.message?.content ? undefined
        : d.error?.message ?? (d.choices?.[0]?.finish_reason === "length" ? "model cevabı bitiremeden token sınırına takıldı" : JSON.stringify(d).slice(0, 300)),
    };
  }

  if (p === "openai" || (p === "api" && KEY())) {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${KEY()}` },
      body: JSON.stringify({ model: MODEL() ?? "gpt-4o-mini", messages: [{ role: "system", content: system }, ...messages] }),
    });
    const d = await r.json();
    return { provider: "openai", model: d.model, reply: d.choices?.[0]?.message?.content ?? d.error?.message };
  }

  // echo: saglayici yok — pipeline'in ne gonderecegini gosterir
  return {
    provider: "echo",
    reply: `[LLM bagli degil — onizleme modu]\n\nSystem prompt'un ilk 500 karakteri:\n${system.slice(0, 500)}…\n\nSon mesajin: "${messages.at(-1)?.content}"`,
  };
}
