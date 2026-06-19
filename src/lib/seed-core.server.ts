// Server-only seed data generator. Called from runSeedDemo and the bootstrap
// route. Accepts a service-role client + the user id used for created_by.

const SEED_TABLES = [
  "medical_passes",
  "incidents",
  "payments",
  "payment_schedules",
  "beneficiaries",
  "dependents",
  "policies",
  "client_programs",
  "clients",
  "sales_reps",
  "renewal_contacts",
] as const;

const FIRST_NAMES_M = [
  "Juan", "Carlos", "Miguel", "José", "Luis", "Alejandro", "Fernando", "Ricardo",
  "Roberto", "Eduardo", "Andrés", "Diego", "Mauricio", "Javier", "Sergio", "Daniel",
];
const FIRST_NAMES_F = [
  "María", "Guadalupe", "Ana", "Laura", "Patricia", "Sofía", "Daniela", "Mariana",
  "Fernanda", "Adriana", "Gabriela", "Lucía", "Karla", "Mónica", "Verónica", "Andrea",
];
const LAST_NAMES = [
  "García", "Hernández", "Martínez", "López", "González", "Rodríguez", "Pérez",
  "Sánchez", "Ramírez", "Torres", "Flores", "Rivera", "Gómez", "Díaz", "Reyes",
  "Morales", "Jiménez", "Álvarez", "Romero", "Mendoza", "Vázquez", "Castillo",
  "Ortiz", "Aguilar", "Guerrero",
];
const CITIES: Array<[string, string, string]> = [
  ["Monterrey", "Nuevo León", "64000"],
  ["Guadalajara", "Jalisco", "44100"],
  ["Ciudad de México", "CDMX", "06000"],
  ["Puebla", "Puebla", "72000"],
  ["León", "Guanajuato", "37000"],
  ["Querétaro", "Querétaro", "76000"],
  ["Mérida", "Yucatán", "97000"],
  ["Saltillo", "Coahuila", "25000"],
];
const COLONIAS = ["Centro", "Del Valle", "Roma Norte", "Polanco", "Mitras", "Tecnológico", "San Pedro", "Las Águilas"];
const STREETS = ["Av. Constitución", "Calle Hidalgo", "Av. Reforma", "Calle Juárez", "Av. Universidad", "Calle Morelos", "Av. Madero"];
const SALES_REPS = [
  { name: "Mariana López Hinojosa", source: "Referido directo" },
  { name: "Eduardo Treviño Garza", source: "Campaña digital" },
  { name: "Sofía Ramírez Cantú", source: "Alianza institucional" },
  { name: "Javier Mendoza Ortiz", source: "Evento corporativo" },
];
const HOSPITALS = [
  "Hospital San José Tec", "Christus Muguerza Alta Especialidad", "Hospital Ángeles",
  "Hospital Zambrano Hellion", "Centro Médico ABC", "Hospital Country 2000",
];
const RELATIONSHIPS = ["Cónyuge", "Hijo(a)", "Padre", "Madre", "Hermano(a)"];

function rand<T>(arr: readonly T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pad(n: number, w: number) { return String(n).padStart(w, "0"); }
function fakeCurp(first: string, last: string, dob: Date, gender: "H" | "M") {
  const a = (last + "X").toUpperCase().replace(/[^A-Z]/g, "");
  const b = (first + "X").toUpperCase().replace(/[^A-Z]/g, "");
  const yy = pad(dob.getFullYear() % 100, 2);
  const mm = pad(dob.getMonth() + 1, 2);
  const dd = pad(dob.getDate(), 2);
  return `${a.slice(0, 4)}${yy}${mm}${dd}${gender}NL${b.slice(0, 3)}${randInt(10, 99)}`;
}
function fakeRfc(first: string, last: string, dob: Date) {
  const a = last.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3) || "XXX";
  const b = first.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 1) || "X";
  const yy = pad(dob.getFullYear() % 100, 2);
  return `${a}${b}${yy}${pad(dob.getMonth() + 1, 2)}${pad(dob.getDate(), 2)}${["A1", "B2", "C3", "X9"][randInt(0, 3)]}`;
}
function fakePhone() { return `81${randInt(10000000, 99999999)}`; }
function shiftDays(d: Date, days: number) { const c = new Date(d); c.setDate(c.getDate() + days); return c; }
function isoDate(d: Date) { return d.toISOString().slice(0, 10); }

type ProgramRow = { id: string; code: string; name: string };

export async function runDemoSeed(supabaseAdmin: any, userId: string) {
  // 1. Clear any previous demo data first (idempotent).
  for (const t of SEED_TABLES) {
    await supabaseAdmin.from(t).delete().eq("metadata->>is_demo", "true");
  }

  const seedRunId = crypto.randomUUID();
  const tag = { is_demo: true, seed_run_id: seedRunId, seeded_at: new Date().toISOString() };
  const stats: Record<string, number> = {};

  // 2. Programs
  const { data: programs, error: pErr } = await supabaseAdmin
    .from("programs").select("id, code, name").order("code");
  if (pErr) throw new Error(pErr.message);
  if (!programs?.length) throw new Error("No programs found - run base migrations first.");

  // 3. Sales reps (idempotent)
  const { data: existingReps } = await supabaseAdmin.from("sales_reps").select("id, full_name");
  const existingRepNames = new Set((existingReps ?? []).map((r: any) => r.full_name));
  const repsToInsert = SALES_REPS.filter((r) => !existingRepNames.has(r.name));
  let newReps: any[] = [];
  if (repsToInsert.length) {
    const { data, error } = await supabaseAdmin.from("sales_reps")
      .insert(repsToInsert.map((r) => ({
        full_name: r.name, referral_source: r.source, is_active: true, metadata: tag,
      })))
      .select("id, full_name");
    if (error) throw new Error(`sales_reps: ${error.message}`);
    newReps = data ?? [];
  }
  const allReps = [...(existingReps ?? []), ...newReps];
  stats.sales_reps = newReps.length;

  // 4. Clients (20 per program)
  const CLIENTS_PER_PROGRAM = 20;
  const allClients: { id: string; program_id: string; first_name: string; last_name: string }[] = [];
  const today = new Date();

  for (const program of programs as ProgramRow[]) {
    const clientsBatch = Array.from({ length: CLIENTS_PER_PROGRAM }, () => {
      const gender = Math.random() < 0.5 ? "H" : "M";
      const first = rand(gender === "H" ? FIRST_NAMES_M : FIRST_NAMES_F);
      const last1 = rand(LAST_NAMES);
      const last2 = rand(LAST_NAMES);
      const last = `${last1} ${last2}`;
      const dob = new Date(randInt(1955, 2005), randInt(0, 11), randInt(1, 28));
      const city = rand(CITIES);
      const rep = rand(allReps);
      return {
        first_name: first, last_name: last,
        curp: fakeCurp(first, last1, dob, gender),
        rfc: fakeRfc(first, last1, dob),
        date_of_birth: isoDate(dob),
        gender: gender === "H" ? "male" : "female",
        marital_status: rand(["single", "married", "divorced", "widowed"]),
        email: `${first}.${last1}.${randInt(1, 999)}@demo.hope.mx`.toLowerCase().replace(/[áéíóú]/g, "a"),
        phone: fakePhone(),
        street: rand(STREETS), number: String(randInt(100, 9999)),
        colonia: rand(COLONIAS), city: city[0], state: city[1], zip: city[2],
        // clients.sales_rep_id FKs to auth.users(id) — use the admin user.
        sales_rep_id: userId,
        created_by: userId,
        metadata: tag,
      };
    });
    const { data: inserted, error } = await supabaseAdmin
      .from("clients").insert(clientsBatch).select("id, first_name, last_name");
    if (error) throw new Error(`clients(${program.code}): ${error.message}`);
    for (const c of inserted ?? []) {
      allClients.push({ id: c.id, program_id: program.id, first_name: c.first_name, last_name: c.last_name });
    }
  }
  stats.clients = allClients.length;

  // 5. client_programs
  {
    const rows = allClients.map((c) => ({
      client_id: c.id, program_id: c.program_id, status: "active",
      enrolled_at: new Date(today.getTime() - randInt(30, 600) * 86400000).toISOString(),
      metadata: tag,
    }));
    const { error } = await supabaseAdmin.from("client_programs").insert(rows);
    if (error) throw new Error(`client_programs: ${error.message}`);
    stats.client_programs = rows.length;
  }

  // 6. Policies
  const policies: { id: string; client_id: string; program_id: string; start: Date; end: Date; premium: number; sum: number }[] = [];
  for (const c of allClients) {
    const { data: folio, error: fErr } = await supabaseAdmin
      .rpc("next_policy_folio", { _program_id: c.program_id });
    if (fErr) throw new Error(`next_policy_folio: ${fErr.message}`);

    const startOffset = randInt(-330, -10);
    const start = shiftDays(today, startOffset);
    const end = shiftDays(start, 365);
    const sumInsured = rand([50000, 75000, 100000, 150000, 200000, 250000]);
    const premium = Math.round(sumInsured * (0.012 + Math.random() * 0.008));

    const { data: pol, error } = await supabaseAdmin.from("policies").insert({
      folio, policy_number: folio,
      program_id: c.program_id, client_id: c.id,
      issue_date: isoDate(start), start_date: isoDate(start), end_date: isoDate(end),
      sum_insured: sumInsured, deductible: Math.round(sumInsured * 0.05),
      premium, status: "active",
      contracting_party: `${c.first_name} ${c.last_name}`,
      created_by: userId, metadata: tag,
    }).select("id").single();
    if (error) throw new Error(`policies(${folio}): ${error.message}`);
    policies.push({ id: pol.id, client_id: c.id, program_id: c.program_id, start, end, premium, sum: sumInsured });
  }
  stats.policies = policies.length;

  // 7. Beneficiaries
  {
    const rows: any[] = [];
    for (const p of policies) {
      const count = randInt(1, 3);
      let remaining = 100;
      for (let i = 0; i < count; i++) {
        const pct = i === count - 1 ? remaining : Math.floor(remaining / (count - i));
        remaining -= pct;
        rows.push({
          policy_id: p.id,
          full_name: `${rand(FIRST_NAMES_F)} ${rand(LAST_NAMES)} ${rand(LAST_NAMES)}`,
          relationship: rand(RELATIONSHIPS),
          percentage: pct, display_order: i, metadata: tag,
        });
      }
    }
    const { error } = await supabaseAdmin.from("beneficiaries").insert(rows);
    if (error) throw new Error(`beneficiaries: ${error.message}`);
    stats.beneficiaries = rows.length;
  }

  // 8. Dependents
  {
    const rows: any[] = [];
    for (const p of policies) {
      const count = randInt(0, 3);
      for (let i = 0; i < count; i++) {
        const dob = new Date(randInt(1980, 2020), randInt(0, 11), randInt(1, 28));
        rows.push({
          policy_id: p.id,
          full_name: `${rand([...FIRST_NAMES_F, ...FIRST_NAMES_M])} ${rand(LAST_NAMES)} ${rand(LAST_NAMES)}`,
          relationship: rand(RELATIONSHIPS),
          date_of_birth: isoDate(dob), metadata: tag,
        });
      }
    }
    if (rows.length) {
      const { error } = await supabaseAdmin.from("dependents").insert(rows);
      if (error) throw new Error(`dependents: ${error.message}`);
    }
    stats.dependents = rows.length;
  }

  // 9. Payments
  {
    const rows: any[] = [];
    for (const p of policies) {
      const monthly = Math.round(p.premium / 12);
      const monthsSinceStart = Math.min(
        12, Math.max(1, Math.floor((today.getTime() - p.start.getTime()) / (30 * 86400000))),
      );
      for (let m = 0; m < monthsSinceStart; m++) {
        const dueDate = shiftDays(p.start, m * 30);
        const overdue = today.getTime() - dueDate.getTime() > 0;
        const r = Math.random();
        let status: string; let paidAt: string | null = null;
        let paidAmount: number | null = null; let method: string | null = null;
        if (m < monthsSinceStart - 2) {
          if (r < 0.9) {
            status = "paid";
            paidAt = shiftDays(dueDate, randInt(-3, 5)).toISOString();
            paidAmount = monthly; method = rand(["bank_transfer", "card", "oxxo", "cash"]);
          } else { status = "overdue"; }
        } else {
          if (r < 0.55) {
            status = "paid";
            paidAt = shiftDays(dueDate, randInt(-2, 5)).toISOString();
            paidAmount = monthly; method = rand(["bank_transfer", "card", "oxxo"]);
          } else if (r < 0.8) {
            status = overdue ? "overdue" : "pending";
          } else { status = "pending"; }
        }
        rows.push({
          policy_id: p.id, amount: monthly, due_date: isoDate(dueDate),
          paid_at: paidAt, paid_amount: paidAmount, method, status,
          reconciled: status === "paid", metadata: tag,
        });
      }
    }
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabaseAdmin.from("payments").insert(rows.slice(i, i + 500));
      if (error) throw new Error(`payments: ${error.message}`);
    }
    stats.payments = rows.length;
  }

  // 10. Incidents
  {
    const sample = policies.filter(() => Math.random() < 0.2);
    const statuses = ["reported", "pending_review", "pass_issued", "in_treatment", "closed", "rejected"] as const;
    const rows = sample.map((p, idx) => {
      const occurred = shiftDays(today, -randInt(1, 120));
      const status = statuses[idx % statuses.length];
      const approved = status === "pass_issued" || status === "in_treatment" || status === "closed";
      return {
        policy_id: p.id, client_id: p.client_id,
        occurred_at: occurred.toISOString(),
        reported_at: shiftDays(occurred, randInt(0, 3)).toISOString(),
        accident_date: isoDate(occurred),
        accident_time: `${pad(randInt(0, 23), 2)}:${pad(randInt(0, 59), 2)}:00`,
        location_description: `${rand(STREETS)} #${randInt(100, 9999)}, ${rand(CITIES)[0]}`,
        hospital: rand(HOSPITALS),
        description: rand([
          "Caída en escaleras del trabajo",
          "Accidente automovilístico en cruce",
          "Lesión deportiva durante entrenamiento",
          "Resbalón en zona húmeda",
          "Choque por alcance en avenida",
        ]),
        status,
        approved_at: approved ? shiftDays(occurred, 1).toISOString() : null,
        approved_by: approved ? userId : null,
        rejected_at: status === "rejected" ? shiftDays(occurred, 2).toISOString() : null,
        rejected_by: status === "rejected" ? userId : null,
        rejection_reason: status === "rejected" ? "Evento fuera de la cobertura contratada" : null,
        created_by: userId, metadata: tag,
      };
    });
    if (rows.length) {
      const { error } = await supabaseAdmin.from("incidents").insert(rows);
      if (error) throw new Error(`incidents: ${error.message}`);
    }
    stats.incidents = rows.length;
  }

  return { ok: true, seed_run_id: seedRunId, stats };
}
