import { z } from "zod";
import type {
  CompiledActiveProfile,
  CompiledMapping,
  CompiledProfileSet,
  HIDModifier,
  KeyMapping,
  MappingInput,
  MappingOutput,
  ProfileDocument,
  ProfileDraft,
  ProfileStateDocument
} from "../shared/hid.js";
import { KEY_CODES, MODIFIER_KEY_CODES, SYSTEM_KEY_CODES, normalizeModifiers } from "./key-codes.js";

const idSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]*$/, "must use lowercase letters, numbers, - or _");
const modifierSchema = z.enum(["command", "control", "option", "shift", "fn"]);
const modifiersSchema = z.array(modifierSchema).default([]).refine((items) => new Set(items).size === items.length, "duplicate modifier");

const keyReference = {
  key: z.string().min(1).optional(),
  keyCode: z.number().int().nonnegative().optional()
};
const systemReference = {
  key: z.string().min(1).optional(),
  systemCode: z.number().int().nonnegative().optional()
};

const exactlyOne = (value: { key?: string; keyCode?: number }, context: z.RefinementCtx) => {
  if ((value.key === undefined) === (value.keyCode === undefined)) {
    context.addIssue({ code: "custom", message: "exactly one of key or keyCode is required" });
  }
};
const exactlyOneSystem = (value: { key?: string; systemCode?: number }, context: z.RefinementCtx) => {
  if ((value.key === undefined) === (value.systemCode === undefined)) {
    context.addIssue({ code: "custom", message: "exactly one of key or systemCode is required" });
  }
};

const keyboardInputSchema = z.object({ kind: z.literal("keyboard"), ...keyReference, modifiers: modifiersSchema }).strict().superRefine(exactlyOne);
const modifierInputSchema = z.object({ kind: z.literal("modifier"), key: z.enum(["command", "control", "option", "shift", "fn", "capsLock"]), modifiers: modifiersSchema }).strict();
const systemInputSchema = z.object({ kind: z.literal("system"), ...systemReference }).strict().superRefine(exactlyOneSystem);
const hidUsageInputSchema = z.object({ kind: z.literal("hidUsage"), usage: z.number().int().min(1).max(0xFFFF) }).strict();
const inputSchema = z.union([keyboardInputSchema, modifierInputSchema, systemInputSchema, hidUsageInputSchema]);

const keyboardOutputSchema = z.object({ kind: z.literal("keyboard"), ...keyReference, modifiers: modifiersSchema }).strict().superRefine(exactlyOne);
const systemOutputSchema = z.object({ kind: z.literal("system"), ...systemReference }).strict().superRefine(exactlyOneSystem);
const outputSchema = z.union([
  keyboardOutputSchema,
  systemOutputSchema,
  z.object({ kind: z.literal("passthrough") }).strict(),
  z.object({ kind: z.literal("suppress") }).strict()
]);

const mappingSchema = z.object({ id: idSchema, from: inputSchema, to: outputSchema }).strict();
const scopeSchema = z.union([
  z.object({ kind: z.literal("global") }).strict(),
  z.object({ kind: z.literal("application"), bundleId: z.string().min(1) }).strict()
]);
const groupSchema = z.object({ id: idSchema, scope: scopeSchema, mappings: z.array(mappingSchema) }).strict();
export const profileDraftSchema = z.object({ id: idSchema, name: z.string().min(1), groups: z.array(groupSchema).min(1) }).strict();
const profileDocumentSchema = z.object({
  version: z.literal(1),
  keyboards: z.array(z.object({ type: z.number().int().nonnegative(), profiles: z.array(profileDraftSchema) }).strict())
}).strict();
const stateDocumentSchema = z.object({ version: z.literal(1), activeProfiles: z.record(z.string(), idSchema) }).strict();

const ensureUnique = (values: string[], label: string) => {
  const duplicates = values.filter((value, index) => values.indexOf(value) !== index);
  if (duplicates.length) throw new Error(`Duplicate ${label}: ${[...new Set(duplicates)].join(", ")}`);
};

export function triggerKey(input: MappingInput): string {
  const modifiers = normalizeModifiers(input.kind === "keyboard" || input.kind === "modifier" ? input.modifiers : undefined).join("+");
  if (input.kind === "system") return `system:${input.key ?? input.systemCode}`;
  if (input.kind === "hidUsage") return `hidUsage:${input.usage}`;
  if (input.kind === "modifier") return `modifier:${input.key}:${modifiers}`;
  return `keyboard:${input.key ?? input.keyCode}:${modifiers}`;
}

function validateProfile(profile: ProfileDraft): void {
  ensureUnique(profile.groups.map(({ id }) => id), `group id in profile ${profile.id}`);
  const globals = profile.groups.filter(({ id, scope }) => id === "global" && scope.kind === "global");
  if (globals.length !== 1 || profile.groups.some(({ id, scope }) => (id === "global") !== (scope.kind === "global"))) {
    throw new Error(`Profile ${profile.id} must contain exactly one global group with id global`);
  }
  ensureUnique(
    profile.groups.flatMap(({ scope }) => scope.kind === "application" ? [scope.bundleId] : []),
    `application bundle id in profile ${profile.id}`
  );
  ensureUnique(profile.groups.flatMap(({ mappings }) => mappings.map(({ id }) => id)), `mapping id in profile ${profile.id}`);
  for (const group of profile.groups) {
    ensureUnique(group.mappings.map(({ from }) => triggerKey(from)), `trigger in group ${group.id}`);
  }
}

export function parseProfileDocument(value: unknown): ProfileDocument {
  const document = profileDocumentSchema.parse(value) as ProfileDocument;
  ensureUnique(document.keyboards.map(({ type }) => String(type)), "keyboard type");
  for (const keyboard of document.keyboards) {
    ensureUnique(keyboard.profiles.map(({ id }) => id), `profile id for keyboard type ${keyboard.type}`);
    keyboard.profiles.forEach(validateProfile);
  }
  return document;
}

export function parseStateDocument(value: unknown): ProfileStateDocument {
  const state = stateDocumentSchema.parse(value) as ProfileStateDocument;
  for (const type of Object.keys(state.activeProfiles)) {
    if (!/^\d+$/.test(type)) throw new Error(`Invalid keyboard type in activeProfiles: ${type}`);
  }
  return state;
}

function resolveKey(input: { key?: string; keyCode?: number }): number {
  if (input.keyCode !== undefined) return input.keyCode;
  const code = KEY_CODES[input.key!];
  if (code === undefined) throw new Error(`Unknown keyboard key: ${input.key}`);
  return code;
}

function resolveSystem(input: { key?: string; systemCode?: number }): number {
  if (input.systemCode !== undefined) return input.systemCode;
  const code = SYSTEM_KEY_CODES[input.key!];
  if (code === undefined) throw new Error(`Unknown system key: ${input.key}`);
  return code;
}

function compileOutput(output: MappingOutput): CompiledMapping["output"] {
  if (output.kind === "passthrough" || output.kind === "suppress") return { kind: output.kind, modifiers: [] };
  if (output.kind === "system") return { kind: "system", code: resolveSystem(output), modifiers: [] };
  return { kind: "keyboard", code: resolveKey(output), modifiers: normalizeModifiers(output.modifiers) };
}

function compileMapping(mapping: KeyMapping): CompiledMapping {
  const input = mapping.from;
  const code = input.kind === "system" ? resolveSystem(input)
    : input.kind === "hidUsage" ? input.usage
    : input.kind === "modifier" ? MODIFIER_KEY_CODES[input.key]
      : resolveKey(input);
  return {
    id: mapping.id,
    trigger: {
      kind: input.kind,
      code,
      modifiers: normalizeModifiers(input.kind === "keyboard" || input.kind === "modifier" ? input.modifiers : undefined)
    },
    output: compileOutput(mapping.to)
  };
}

export function compileProfiles(document: ProfileDocument, state: ProfileStateDocument, generation: number): CompiledProfileSet {
  const profiles: CompiledActiveProfile[] = [];
  for (const keyboard of document.keyboards) {
    const activeId = state.activeProfiles[String(keyboard.type)];
    if (!activeId) continue;
    const profile = keyboard.profiles.find(({ id }) => id === activeId);
    if (!profile) continue;
    const global = profile.groups.find(({ scope }) => scope.kind === "global")!;
    const applications: Record<string, CompiledMapping[]> = {};
    for (const group of profile.groups) {
      if (group.scope.kind === "application") applications[group.scope.bundleId] = group.mappings.map(compileMapping);
    }
    profiles.push({
      keyboardType: keyboard.type,
      profileId: profile.id,
      global: global.mappings.map(compileMapping),
      applications
    });
  }
  return { generation, profiles };
}

export function validateActiveProfiles(document: ProfileDocument, state: ProfileStateDocument): string[] {
  const errors: string[] = [];
  for (const [type, profileId] of Object.entries(state.activeProfiles)) {
    const keyboard = document.keyboards.find((entry) => entry.type === Number(type));
    if (!keyboard?.profiles.some(({ id }) => id === profileId)) errors.push(`Active profile ${profileId} does not exist for keyboard type ${type}`);
  }
  return errors;
}
