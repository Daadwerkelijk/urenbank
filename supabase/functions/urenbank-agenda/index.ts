// Urenbank: agenda-abonnement (.ics) voor bijvoorbeeld Google Agenda ("Via URL").
// Openbaar bereikbaar (verify_jwt uit); de geheime token in de URL bepaalt van wie de agenda is.
// Een onbekende of ongeldige token geeft een lege agenda: zo verraadt de link niets.
// Alleen verlof dat vandaag of later eindigt (geen historie). Gegevens via urenbank.agenda_items
// (migratie 006), aangeroepen met de service-sleutel die alleen hier op de server staat.

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SLEUTEL = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Item = {
  id: number; begin: string; eind: string; omschrijving: string | null; bron: string;
  soort_overig: string | null; kosten_uren: number | null; geboekt: boolean; status: string;
};

const tekst = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n")
    // overige stuurtekens weg: die kunnen een agenda-app in de war brengen
    .replace(/[\u0000-\u001f\u007f]/g, "");

// Regels langer dan 75 bytes vouwen (RFC 5545), zonder een teken door te knippen.
function vouw(regel: string): string {
  const enc = new TextEncoder();
  const delen: string[] = [];
  let huidig = "", lengte = 0, max = 75;
  for (const teken of regel) {
    const n = enc.encode(teken).length;
    if (lengte + n > max) { delen.push(huidig); huidig = ""; lengte = 0; max = 74; }
    huidig += teken; lengte += n;
  }
  delen.push(huidig);
  return delen.join("\r\n ");
}

const datum = (d: string) => d.replaceAll("-", "");
function dagErna(d: string): string {
  const t = new Date(d + "T00:00:00Z");
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10).replaceAll("-", "");
}
const uren = (n: number | null) =>
  n == null ? "" : `${Number(n).toLocaleString("nl-NL", { maximumFractionDigits: 2 })} uur`;
const BRON: Record<string, string> = { saldo: "verlofsaldo", urenbank: "urenbank", overig: "overig" };

function agenda(items: Item[]): string {
  const nu = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const r = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Urenbank//Verlof//NL", "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH", "X-WR-CALNAME:Verlof (urenbank)", "X-WR-TIMEZONE:Europe/Amsterdam",
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H", "X-PUBLISHED-TTL:PT6H",
  ];
  for (const v of items) {
    const titel = v.omschrijving?.trim() || "Verlof";
    const bron = v.bron === "overig" && v.soort_overig ? v.soort_overig : (BRON[v.bron] ?? v.bron);
    const info = [
      `Van: ${bron}`,
      v.kosten_uren != null ? `Kost: ${uren(v.kosten_uren)}` : "",
      v.geboekt ? "Geboekt bij P&O" : "Gepland, nog niet geboekt",
    ].filter(Boolean).join("\n");
    r.push(
      "BEGIN:VEVENT",
      `UID:verlof-${v.id}@urenbank`,
      `DTSTAMP:${nu}`,
      `DTSTART;VALUE=DATE:${datum(v.begin)}`,
      `DTEND;VALUE=DATE:${dagErna(v.eind)}`,
      `SUMMARY:${tekst(titel)}`,
      `DESCRIPTION:${tekst(info)}`,
      `STATUS:${v.geboekt ? "CONFIRMED" : "TENTATIVE"}`,
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }
  r.push("END:VCALENDAR");
  return r.map(vouw).join("\r\n") + "\r\n";
}

async function ophalen(token: string): Promise<Item[]> {
  if (!/^[0-9a-f]{64}$/.test(token)) return [];
  const res = await fetch(`${URL_}/rest/v1/rpc/agenda_items`, {
    method: "POST",
    headers: {
      apikey: SLEUTEL, Authorization: `Bearer ${SLEUTEL}`,
      "Content-Type": "application/json", "Content-Profile": "urenbank", "Accept-Profile": "urenbank",
    },
    body: JSON.stringify({ p_token: token }),
  });
  if (!res.ok) { console.error("agenda_items", res.status, await res.text()); throw new Error("db"); }
  return await res.json();
}

Deno.serve(async (req) => {
  if (req.method !== "GET" && req.method !== "HEAD") return new Response("Alleen GET", { status: 405 });
  const token = new URL(req.url).searchParams.get("token") ?? "";
  try {
    const body = agenda(await ophalen(token));
    return new Response(req.method === "HEAD" ? null : body, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="verlof.ics"',
        "Cache-Control": "private, max-age=900",
      },
    });
  } catch {
    return new Response("Tijdelijk niet beschikbaar", { status: 503 });
  }
});
