// Supabase Edge Function: web-push notifications for نقرأ سوا.
//  - {type: "remind"}  (called hourly by pg_cron) → daily reading reminder to people whose chosen hour is now
//                      and who have not read anything today.
//  - {type: "poke", data, circle_id} (called by a trigger when someone sends a cheer/nudge) → notify the target.
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:…), NOTIFY_SECRET.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.
// Deploy with JWT verification off; requests must carry the x-notify-secret header instead.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.117.3";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

type Sub = { endpoint: string; user_id: string; keys: { p256dh: string; auth: string }; remind_hour: number | null; tz: string | null; lang: string | null };

const t = (lang: string | null, ar: string, en: string) => (lang === "en" ? en : ar);

async function send(sub: Sub, payload: Record<string, unknown>) {
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(payload), { TTL: 6 * 3600 });
  } catch (e) {
    const code = (e as { statusCode?: number }).statusCode;
    if (code === 404 || code === 410) await sb.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    else console.error("push failed", code, (e as Error).message);
  }
}

function localNow(tz: string | null) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz || "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const get = (k: string) => parts.find((p) => p.type === k)?.value ?? "";
  return { day: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

async function remind() {
  const { data: subs, error } = await sb.from("push_subscriptions").select("*").not("remind_hour", "is", null);
  if (error) throw error;
  const due = (subs as Sub[]).filter((s) => localNow(s.tz).hour === s.remind_hour);
  if (!due.length) return 0;
  const ids = [...new Set(due.map((s) => s.user_id))];
  const { data: profs } = await sb.from("profiles").select("user_id, data").in("user_id", ids);
  const byUser = new Map((profs ?? []).map((p) => [p.user_id, p.data as Record<string, any>]));
  let n = 0;
  for (const s of due) {
    const prof = byUser.get(s.user_id) ?? {};
    const { day } = localNow(s.tz);
    if (prof.days && prof.days[day] > 0) continue; // already read today
    const streakAtRisk = prof.lastActive && prof.lastActive !== day;
    await send(s, {
      title: t(s.lang, "وردك مستنيك 📖", "Your reading is waiting 📖"),
      body: streakAtRisk
        ? t(s.lang, "اقرأ كام صفحة النهارده عشان سلسلتك متقطعش 🔥", "Read a few pages today to keep your streak 🔥")
        : t(s.lang, "صفحات قليلة النهارده بتقرّب الحلقة من هدفها.", "A few pages today move the circle closer to its goal."),
      url: "./",
      tag: "daily-reminder",
    });
    n++;
  }
  return n;
}

async function poke(body: { circle_id: string; from?: string; data: Record<string, any> }) {
  const d = { ...(body.data ?? {}), from: body.from }; // sender comes from the server-set updated_by
  if (!d.to || !d.from || d.to === d.from) return 0;
  // Only notify if both people are still in that circle.
  const { data: mem } = await sb.from("circle_members").select("user_id").eq("circle_id", body.circle_id).in("user_id", [d.to, d.from]);
  if ((mem ?? []).length < 2) return 0;
  const { data: prof } = await sb.from("profiles").select("data").eq("user_id", d.from).maybeSingle();
  const name = (prof?.data as Record<string, any>)?.nick || "";
  const { data: subs } = await sb.from("push_subscriptions").select("*").eq("user_id", d.to);
  for (const s of (subs ?? []) as Sub[]) {
    await send(s, d.kind === "cheer"
      ? { title: t(s.lang, `تشجيع من ${name} 👏`, `${name} cheered you on 👏`), body: t(s.lang, "كمّل كده!", "Keep going!"), url: "./", tag: "cheer" }
      : { title: t(s.lang, `تذكير من ${name} 👋`, `${name} nudged you 👋`), body: t(s.lang, "الحلقة مستنياك تخلّص الورد.", "The circle is waiting for you to finish the portion."), url: "./", tag: "nudge" });
  }
  return (subs ?? []).length;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const secret = Deno.env.get("NOTIFY_SECRET");
  if (!secret || req.headers.get("x-notify-secret") !== secret) return new Response("forbidden", { status: 403 });
  try {
    const body = await req.json();
    const sent = body.type === "remind" ? await remind() : body.type === "poke" ? await poke(body) : 0;
    return Response.json({ ok: true, sent });
  } catch (e) {
    console.error(e);
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
});
