// Claude.ai veri export'u parser'i.
// Export: ayri zip'ler halinde kategoriler (conversations.json, memories.json,
// projects.json, feedback.json, design_chats.json...).
// conversations.json: [{uuid, name, created_at, chat_messages:[{uuid, sender, text, content, created_at}]}]

const base = (name) => name.toLowerCase().split("/").pop();

function msgText(m) {
  if (typeof m.text === "string" && m.text) return m.text;
  const c = m.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    return c.filter((b) => b.type === "text" && b.text).map((b) => b.text).join("\n");
  }
  if (c && typeof c === "object") {
    // design_chats: {attachments:[{content:...}], prompt/text/...}
    const parts = [];
    if (c.prompt) parts.push(c.prompt);
    if (c.text) parts.push(c.text);
    for (const a of c.attachments ?? []) if (a?.content) parts.push(a.content);
    return parts.join("\n");
  }
  return "";
}

export function parseClaudeFile(name, text) {
  const b = base(name);
  const items = [];

  if (/^conversations.*\.json$/.test(b)) {
    const convs = JSON.parse(text);
    for (const conv of Array.isArray(convs) ? convs : []) {
      const msgs = conv.chat_messages ?? [];
      items.push({
        platform: "claude",
        type: "other",
        id: `conv:${conv.uuid}`,
        timestamp: conv.created_at,
        text: conv.name,
        extra: { kind: "conversation", message_count: msgs.length, updated_at: conv.updated_at },
      });
      for (const m of msgs) {
        items.push({
          platform: "claude",
          type: "message",
          id: m.uuid ?? `${conv.uuid}:${m.created_at}`,
          timestamp: m.created_at,
          text: msgText(m),
          extra: {
            conversation_id: conv.uuid,
            conversation_title: conv.name,
            sender: m.sender,
          },
        });
      }
    }
  } else if (/^memories.*\.json$/.test(b)) {
    const mems = JSON.parse(text);
    const list = Array.isArray(mems) ? mems : (mems.memories ?? Object.values(mems));
    for (const [i, mem] of list.entries()) {
      items.push({
        platform: "claude",
        type: "other",
        id: mem.uuid ?? `memory:${i}`,
        timestamp: mem.created_at ?? mem.updated_at,
        text: typeof mem === "string" ? mem : (mem.content ?? mem.text ?? JSON.stringify(mem)),
        extra: { kind: "memory" },
      });
    }
  } else if (/^projects.*\.json$/.test(b)) {
    const projects = JSON.parse(text);
    for (const [i, p] of (Array.isArray(projects) ? projects : []).entries()) {
      items.push({
        platform: "claude",
        type: "other",
        id: `project:${p.uuid ?? i}`,
        timestamp: p.created_at,
        text: p.name,
        extra: { kind: "project", description: p.description },
      });
    }
  } else if (/^design_chats\/.*\.json$/.test(name)) {
    // design_chats/<uuid>.json — {uuid, title, project, messages:[{...}]}
    const chat = JSON.parse(text);
    items.push({
      platform: "claude",
      type: "other",
      id: `design:${chat.uuid}`,
      timestamp: chat.created_at,
      text: `${chat.title ?? "Chat"}${chat.project?.name ? ` (${chat.project.name})` : ""}`,
      extra: { kind: "design_chat", project: chat.project?.name, message_count: (chat.messages ?? []).length },
    });
    for (const m of chat.messages ?? []) {
      items.push({
        platform: "claude",
        type: "message",
        id: m.uuid ?? `${chat.uuid}:${m.created_at}`,
        timestamp: m.created_at,
        text: msgText(m),
        extra: { conversation_id: chat.uuid, design_chat: true, project: chat.project?.name, sender: m.sender ?? m.role },
      });
    }
  } else if (/^artifacts\/[^/]+\/artifact\.json$/.test(name)) {
    // artifacts/<uuid>/artifact.json — {id, kind, versions[], updated_at}
    const a = JSON.parse(text);
    items.push({
      platform: "claude",
      type: "post",
      id: `artifact:${a.id}`,
      timestamp: a.updated_at,
      text: `${a.kind ?? "artifact"} (${(a.versions ?? []).length} versiyon)`,
      extra: { kind: "artifact", artifact_kind: a.kind, version_count: (a.versions ?? []).length },
    });
  } else if (/^reflections\/.*\.json$/.test(name)) {
    // reflections/<uuid>.json — {reflections:[{period, content:{kategori:[{body}]}}]}
    const data = JSON.parse(text);
    for (const [i, r] of (data.reflections ?? []).entries()) {
      const bodies = [];
      for (const [kategori, list] of Object.entries(r.content ?? {})) {
        for (const c of Array.isArray(list) ? list : []) {
          if (c.body) bodies.push(`[${kategori}] ${c.body}`);
        }
      }
      items.push({
        platform: "claude",
        type: "other",
        id: `reflection:${data.account_uuid}:${r.period ?? i}`,
        timestamp: r.period ? `${r.period.split(":").pop()}-01` : undefined,
        text: bodies.join("\n\n") || undefined,
        extra: { kind: "reflection", period: r.period },
      });
    }
  } else if (/\.md$/.test(b) && name.startsWith("memory-vault/")) {
    // memory-vault/*.md — Markdown ikinci beyin notlari (artifact ic doc'lar hariç)
    const title = text.match(/^#\s+(.+)$/m)?.[1] ?? b;
    items.push({
      platform: "claude",
      type: "other",
      id: `note:${name}`,
      text: `# ${title}\n${text.length > 4000 ? text.slice(0, 4000) + "…" : text}`,
      extra: { kind: "note", path: name },
    });
  }
  // feedback.json, light_metadata (login_history), claude_code_cloud — atlanir

  return items;
}
