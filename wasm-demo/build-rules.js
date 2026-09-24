// SPDX-License-Identifier: CC0-1.0
// build-rules.js — regenerates ./rules.js from the canonical rule-set sources.
//
// Sources (business rulesets):
//   $EVORULE_RULES_DIR or ../../evorule-console-cloud/static/rules/
//     20_finance_rules.json  -> "finance"
//     21_medical_rules.json  -> "medical"
//     22_djbh_rules.json     -> "djbh"
// The fourth ruleset ("io") is the D11 replay-contract demo: it is authored
// inline below because it demonstrates the effect-layer io_request ->
// resolve -> replay loop, not a business domain.
//
// Run: node build-rules.js
// The output file starts with an AUTO-GENERATED marker — do not edit rules.js
// by hand; edit the sources or this script instead.

'use strict';

const { readFileSync, writeFileSync, existsSync } = require('node:fs');
const path = require('node:path');

const HERE = __dirname;
const RULES_DIR =
  process.env.EVORULE_RULES_DIR ||
  path.join(HERE, '..', '..', 'evorule-console-cloud', 'static', 'rules');

// --- business rulesets: id -> { file, name, desc } --------------------------
const SOURCES = [
  {
    id: 'finance',
    file: '20_finance_rules.json',
    name: 'Finance · expense control',
    desc: 'Reimbursement limits (travel > 3000 blocked)',
  },
  {
    id: 'medical',
    file: '21_medical_rules.json',
    name: 'Medical · antibiotic tiers',
    desc: 'Special-tier antibiotics are outpatient-blocked (ML Decree No.84)',
  },
  {
    id: 'djbh',
    file: '22_djbh_rules.json',
    name: 'MLPS 2.0 · access control',
    desc: 'Least-privilege: non-admins must not request admin (L3 §8.1.4.2.d)',
  },
];

// --- D11 replay-contract demo ruleset (authored inline) ---------------------
// Two-phase pattern (same as the shipped server constitution):
//   phase 1: payload.__io_result__ absent  -> lone io_request leaf
//            (params resolve to concrete values at signal time)
//   phase 2: payload.__io_result__ present -> consume the resolved result,
//            record the decision, then clear __io_result__ = null
//            (JSON null counts as "cleared" for the exists predicate, so a
//            follow-up instruction starts a fresh io_request instead of
//            consuming the stale one).
function consumeArm(decision, statusPath) {
  return [
    {
      type: 'set',
      params: { attr: '__exec__.payload.data', operation: 'set', value: '__exec__.instruction.params' },
    },
    {
      type: 'set',
      params: { attr: '__exec__.payload.data.result.decision', operation: 'set', value: decision },
    },
    {
      type: 'set',
      params: { attr: '__exec__.payload.data.result.io_status', operation: 'set', value: statusPath },
    },
    { type: 'set', params: { attr: '__exec__.payload.__io_result__', operation: 'set', value: null } },
  ];
}

function ioBranch(instructionType, ioLeaf, decision, statusPath) {
  return {
    type: 'branch',
    params: {
      domain: { type: 'instruction', instruction_type: instructionType },
      on_true: [
        {
          type: 'branch',
          params: {
            domain: {
              type: 'not',
              inner: { type: 'exists', path: '__exec__.payload.__io_result__' },
            },
            on_true: [ioLeaf],
            on_false: consumeArm(decision, statusPath),
          },
        },
      ],
      on_false: [],
    },
  };
}

const IO_TRANSFORM = [
  ioBranch(
    'notify_request',
    {
      type: 'io_request',
      params: {
        io_type: 'call_service',
        service_name: '__exec__.instruction.params.service_name',
        'args?': '__exec__.instruction.params.args',
      },
    },
    'notified',
    '__exec__.payload.__io_result__.status'
  ),
  ioBranch(
    'external_tool_request',
    {
      type: 'io_request',
      params: {
        io_type: 'call_external',
        tool_name: '__exec__.instruction.params.tool_name',
        'arguments?': '__exec__.instruction.params.arguments',
      },
    },
    'executed',
    '__exec__.payload.__io_result__.status'
  ),
];

// --- assemble ---------------------------------------------------------------
function loadTransform(file) {
  const p = path.join(RULES_DIR, file);
  if (!existsSync(p)) {
    throw new Error(`source ruleset not found: ${p} (set EVORULE_RULES_DIR)`);
  }
  const doc = JSON.parse(readFileSync(p, 'utf8'));
  const arr = Array.isArray(doc) ? doc : doc.transform;
  if (!Array.isArray(arr) || arr.length === 0) {
    throw new Error(`no transform array in ${p}`);
  }
  return arr;
}

const RULESETS = {};
for (const s of SOURCES) {
  const transform = loadTransform(s.file);
  RULESETS[s.id] = {
    name: s.name,
    desc: s.desc,
    ruleCount: transform.length,
    transform,
  };
}
RULESETS['io'] = {
  name: 'External IO · effect layer',
  desc: 'io_request → external resolve → deterministic replay (D11 contract)',
  ruleCount: IO_TRANSFORM.length,
  transform: IO_TRANSFORM,
};

const SAMPLES = {
  finance: {
    type: 'finance_expense_limit_check',
    params: { expense: { type: 'travel', amount: 5000 } },
  },
  medical: {
    type: 'medical_antibiotic_tier_check',
    params: { prescription: { antibiotic_tier: 'special' }, visit: { type: 'outpatient' } },
  },
  djbh: {
    type: 'djbh_access_control_check',
    params: { requested_permission: 'admin', user_role: 'auditor' },
  },
  io: {
    type: 'notify_request',
    params: { service_name: 'approval-svc', args: { message: 'expense 5000 needs approval' } },
  },
};

// --- emit -------------------------------------------------------------------
const header =
  '// AUTO-GENERATED by build-rules.js — do not edit by hand.\n' +
  '// Rebuild: node build-rules.js\n';
const body =
  'export const RULESETS = ' +
  JSON.stringify(RULESETS, null, 2) +
  ';\n' +
  'export const SAMPLES = ' +
  JSON.stringify(SAMPLES, null, 2) +
  ';\n';

const outPath = path.join(HERE, 'rules.js');
writeFileSync(outPath, header + body, 'utf8');
console.log(
  'rules.js written: ' +
    Object.entries(RULESETS)
      .map(([id, rs]) => `${id}/${rs.ruleCount}`)
      .join(', ')
);
