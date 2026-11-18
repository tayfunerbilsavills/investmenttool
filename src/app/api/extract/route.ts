// KI-Extraktion: liest Exposés, Mieterlisten, E-Mails und gibt strukturierte
// Objekt- und Vermietungsdaten zurück. Der API-Schlüssel bleibt serverseitig.
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

export const runtime = "nodejs";
export const maxDuration = 300;

const NUTZUNG = z.enum(["Büro", "Einzelhandel", "Gastronomie", "Wohnen", "Praxis", "Lager/Logistik", "Hotel", "Stellplätze", "Sonstiges"]);

const Schema = z.object({
  objekt: z.object({
    name: z.string().nullable(),
    adresse: z.string().nullable().describe("Straße und Hausnummer"),
    plz: z.string().nullable(),
    ort: z.string().nullable(),
    bundesland: z.string().nullable(),
    objektart: z.string().nullable(),
    baujahr: z.string().nullable(),
    modernisierung: z.string().nullable(),
    grundstueck_m2: z.number().nullable(),
    bgf_m2: z.number().nullable(),
    geschosse: z.string().nullable(),
    stellplaetze: z.number().nullable(),
    eigentuemer: z.string().nullable(),
    verkaeufer: z.string().nullable(),
    erbbaurecht: z.boolean().nullable(),
    denkmal: z.boolean().nullable(),
    energieklasse: z.string().nullable(),
    lage: z.string().nullable().describe("Lagebeschreibung, 1–2 Sätze"),
    beschreibung: z.string().nullable().describe("Objektbeschreibung, 2–4 Sätze"),
  }),
  angaben: z.object({
    mietflaeche_gesamt_m2: z.number().nullable(),
    jahresnettokaltmiete_gesamt: z.number().nullable().describe("Ist-Miete p.a. laut Dokument, EUR"),
    kaufpreis: z.number().nullable().describe("Kaufpreis bzw. Preisvorstellung netto, EUR"),
    faktor: z.number().nullable(),
    walt_jahre: z.number().nullable(),
    leerstandsquote: z.number().nullable().describe("als Dezimalzahl, 0.085 = 8,5 %"),
    stichtag_mieterliste: z.string().nullable().describe("YYYY-MM-DD"),
  }),
  einheiten: z.array(
    z.object({
      nutzung: NUTZUNG,
      mieter: z.string().describe("Mietername oder 'Leerstand'"),
      geschoss: z.string(),
      flaeche: z.number().describe("m², bei Stellplätzen Anzahl"),
      einheit: z.enum(["m2", "stk"]),
      leer: z.boolean(),
      miete_monat: z.number().nullable().describe("Nettokaltmiete EUR pro Monat für die gesamte Einheit"),
      miete_jahr: z.number().nullable().describe("Nettokaltmiete EUR pro Jahr, falls nur so angegeben"),
      miete_qm: z.number().nullable().describe("EUR/m²/Monat, falls nur so angegeben"),
      mietbeginn: z.string().nullable().describe("YYYY-MM-DD"),
      mietende: z.string().nullable().describe("YYYY-MM-DD; null = unbefristet/unbekannt"),
      option: z.string().nullable().describe("frühestes Sonderkündigungsrecht/Break YYYY-MM-DD"),
      indexierung_pa: z.number().nullable().describe("z. B. 0.02 für Indexmiete ~2 % p.a."),
      notiz: z.string().describe("Besonderheiten: Staffel, Optionen, Incentives, Einheitsnummer"),
      quelle: z.string().describe("kurzes wörtliches Zitat der Fundstelle"),
    }),
  ),
  hinweise: z.array(z.string()).describe("Unklarheiten, Widersprüche, fehlende Angaben"),
});

export type AiExtraction = z.infer<typeof Schema>;

const SYSTEM = `Du bist Analyst im Immobilien-Investment (Deutschland). Du extrahierst aus Unterlagen (Exposé, Mieterliste, Teaser, E-Mail) alle Daten zu GENAU EINEM Gebäude.

Regeln:
- Jede vermietete und jede leere Mieteinheit ist ein eigener Eintrag in "einheiten". Nichts zusammenfassen, nichts doppelt aufführen, keine Summenzeilen als Einheit.
- Gibt es nur Summen je Nutzungsart (keine Einzelaufstellung), lege je Nutzungsart einen Eintrag an und schreibe "aggregiert" in die Notiz.
- Leerstand: leer=true, mieter="Leerstand", Mieten null.
- Zahlen exakt übernehmen, nicht runden. Deutsche Schreibweise beachten (1.234,56 = 1234.56).
- Miete: Gib die Größe an, die im Dokument steht (monatlich, jährlich oder €/m²). Prüfe die Plausibilität über €/m²/Monat (Büro typ. 8–45, Einzelhandel 5–150, Wohnen 5–25, Stellplatz 30–250 €/Stk).
- Daten als YYYY-MM-DD. "06/2029" = 2029-06-30, "2031" = 2031-12-31. Unbefristet → null.
- Stellplätze: einheit="stk", flaeche = Anzahl.
- Erfinde nichts. Unbekannt = null. Widersprüche und Unsicherheiten in "hinweise".`;

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    return Response.json({ error: "KI nicht konfiguriert (ANTHROPIC_API_KEY fehlt). Die regelbasierte Erkennung läuft trotzdem." }, { status: 503 });
  }
  let body: { text?: string; fileName?: string; attachment?: { mediaType: string; data: string } };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }
  const text = (body.text ?? "").slice(0, 400_000);
  const content: Anthropic.ContentBlockParam[] = [];
  if (body.attachment?.data) {
    if (body.attachment.mediaType === "application/pdf") {
      content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: body.attachment.data } });
    } else if (/^image\/(png|jpeg|gif|webp)$/.test(body.attachment.mediaType)) {
      content.push({
        type: "image",
        source: { type: "base64", media_type: body.attachment.mediaType as "image/png", data: body.attachment.data },
      });
    }
  }
  const truncated = (body.text ?? "").length > text.length;
  content.push({
    type: "text",
    text:
      `Datei: ${body.fileName ?? "Eingabe"}\n` +
      (text ? `Extrahierter Text${body.attachment ? " (zur Kontrolle, Tabellenspalten tab-getrennt)" : ""}:\n<dokument>\n${text}\n</dokument>\n` : "") +
      (truncated ? "\nHinweis: Der Text wurde wegen seiner Länge gekürzt.\n" : "") +
      "\nExtrahiere alle Objekt- und Vermietungsdaten.",
  });

  const client = new Anthropic();
  try {
    const stream = client.beta.messages.stream({
      model: process.env.ANTHROPIC_MODEL || "claude-opus-5-5",
      max_tokens: 64000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: zodOutputFormat(Schema) },
      system: SYSTEM,
      messages: [{ role: "user", content }],
    });
    const msg = await stream.finalMessage();
    if (msg.stop_reason === "refusal") return Response.json({ error: "Die KI hat die Anfrage abgelehnt." }, { status: 422 });
    const out = msg.content.find((b) => b.type === "text");
    if (!out || out.type !== "text") return Response.json({ error: "Keine Antwort der KI" }, { status: 502 });
    const parsed = Schema.safeParse(JSON.parse(out.text));
    if (!parsed.success) return Response.json({ error: "Antwort der KI unvollständig", detail: parsed.error.message }, { status: 502 });
    return Response.json({ data: parsed.data, truncated, stop: msg.stop_reason });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return Response.json({ error: "KI ausgelastet – bitte gleich erneut versuchen" }, { status: 429 });
    if (e instanceof Anthropic.AuthenticationError) return Response.json({ error: "KI-Schlüssel ungültig" }, { status: 503 });
    if (e instanceof Anthropic.APIError) return Response.json({ error: `KI-Fehler ${e.status}` }, { status: 502 });
    if (e instanceof SyntaxError) return Response.json({ error: "Antwort der KI nicht lesbar (evtl. zu lang)" }, { status: 502 });
    return Response.json({ error: "Unerwarteter Fehler bei der KI-Auswertung" }, { status: 500 });
  }
}
