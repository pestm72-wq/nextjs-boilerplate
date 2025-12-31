export type Escalation = "GREEN" | "AMBER" | "RED";

export type Tiers = {
  daytime: "LEQ2" | "D3_6" | "DAILY";
  night: "NONE" | "LEQ1" | "MOST";
  saba: "LEQ2" | "D3_6" | "DAILY_MULTI";
};

export type Exacerbations = {
  ocs12m: boolean;
  ae12m: boolean; // A&E attendance or admission
  urgentCare12m: boolean;
  urgentCareCount12m?: number;
};

export type Preventer = {
  prescribed: "YES" | "NO" | "UNSURE";
  misses: "NEVER_OCC" | "OFTEN";
  technique: "YES" | "NOT_SURE" | "NO";
};

export type Lifestyle = {
  smoking: "NO" | "YES" | "EX";
  triggersCount: number;
  freeText?: string;
};

export type ReviewInput = {
  actTotal: number; // 5–25
  tiers: Tiers;
  exacerbations: Exacerbations;
  preventer: Preventer;
  lifestyle: Lifestyle;
};

export type TriageResult = {
  escalation: Escalation;
  amberTriggers: string[];
  redTriggers: string[];
  notes: string[];
};

export function computeActTotal(items: number[]): number {
  return items.reduce((a, b) => a + b, 0);
}

function hasOverReliance(actTotal: number, sabaTier: Tiers["saba"]) {
  return actTotal <= 19 && (sabaTier === "D3_6" || sabaTier === "DAILY_MULTI");
}

function escalateOneLevel(current: Escalation): Escalation {
  if (current === "GREEN") return "AMBER";
  if (current === "AMBER") return "RED";
  return "RED";
}

export function triage(input: ReviewInput): TriageResult {
  const amber: string[] = [];
  const red: string[] = [];
  const notes: string[] = [];

  // ACT thresholds
  if (input.actTotal <= 15) red.push("ACT ≤15 (very poor control)");
  else if (input.actTotal <= 19) amber.push("ACT 16–19 (suboptimal control)");

  // Symptoms tiers (NICE/BTS-aligned)
  if (input.tiers.daytime === "D3_6") amber.push("Daytime symptoms 3–6 days/week");
  if (input.tiers.daytime === "DAILY") red.push("Daytime symptoms every day");

  if (input.tiers.night === "LEQ1") amber.push("Night waking ≤1/week");
  if (input.tiers.night === "MOST") red.push("Night waking most nights/frequent");

  if (input.tiers.saba === "D3_6") amber.push("Reliever use 3–6 days/week");
  if (input.tiers.saba === "DAILY_MULTI") red.push("Reliever use daily / multiple times/day");

  // Exacerbations
  if (input.exacerbations.ocs12m) amber.push("Steroid tablets in last 12 months");
  if (input.exacerbations.ae12m) red.push("A&E attendance or hospital admission in last 12 months");

  if (input.exacerbations.urgentCare12m) {
    const c = input.exacerbations.urgentCareCount12m ?? 1;
    if (c >= 2) red.push("Urgent GP/OOH care ≥2 episodes");
    else amber.push("Urgent GP/OOH care in last 12 months");
  }

  // Preventer / adherence / technique
  if (input.preventer.prescribed === "NO" || input.preventer.prescribed === "UNSURE") {
    amber.push("Preventer inhaler: No/Not sure");
  }
  if (input.preventer.misses === "OFTEN") amber.push("Often misses preventer doses");
  if (input.preventer.technique !== "YES") amber.push("Needs inhaler technique review");

  // Lifestyle
  if (input.lifestyle.smoking === "YES") amber.push("Current smoker/vaper");
  if (input.lifestyle.triggersCount >= 3) amber.push("Multiple triggers reported (≥3)");

  // Baseline escalation
  let escalation: Escalation = "GREEN";
  if (red.length > 0) escalation = "RED";
  else if (amber.length > 0) escalation = "AMBER";

  // Aggregation: ≥2 AMBER => RED (if no RED already)
  if (red.length === 0 && amber.length >= 2) escalation = "RED";

  // ICS safety rule: preventer No/Unsure + any AMBER => RED
  const preventerAmber = amber.some(t => t.startsWith("Preventer inhaler"));
  if (preventerAmber && amber.length >= 1) {
    if (escalation !== "RED") escalation = "RED";
    notes.push("ICS safety rule applied");
  }

  // Over-reliance rule: ACT ≤19 AND reliever ≥3 days/week → escalate one level
  if (hasOverReliance(input.actTotal, input.tiers.saba)) {
    escalation = escalateOneLevel(escalation);
    notes.push("Over-reliance rule applied");
  }

  return { escalation, amberTriggers: amber, redTriggers: red, notes };
}

