// io_flow_test.mjs (temporary) — verifies the exact call sequence the demo UI
// performs for the new "io" ruleset:
//   execute(sample) -> io_required (params resolved at signal time)
//   resolve_io({...}) -> state (decision from __io_result__, then cleared)
//   repeat -> fresh io_request again (no stale consumption)
'use strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const PKG = path.join(HERE, 'pkg');

const mod = await import(pathToFileURL(path.join(PKG, 'evorule_wasm_demo.js')).href);
mod.initSync({ module: readFileSync(path.join(PKG, 'evorule_wasm_demo_bg.wasm')) });
const { EvoRuleEngine, engine_version } = mod;
const { RULESETS, SAMPLES } = await import(pathToFileURL(path.join(HERE, 'rules.js')).href);

let failures = 0;
function check(cond, name, detail = '') {
  if (cond) console.log('PASS  ' + name);
  else { failures++; console.log('FAIL  ' + name + (detail ? '  | ' + detail : '')); }
}

console.log('engine_version: ' + engine_version());

const eng = new EvoRuleEngine();
eng.load_rules(JSON.stringify(RULESETS['io'].transform));

// --- 1. notify_request -> io_required with params resolved at signal time ---
const r1 = JSON.parse(eng.execute_instruction(JSON.stringify(SAMPLES['io'])));
check(r1.type === 'io_required', 'notify_request -> io_required', JSON.stringify(r1));
check(r1.io_type === 'call_service', 'io_type=call_service', JSON.stringify(r1));
check(r1.params?.service_name === 'approval-svc', 'params resolved at signal time', JSON.stringify(r1.params));

// --- 2. IoRequest fact on the audit chain, chain verified ---
const chain1 = JSON.parse(eng.get_audit_chain());
check(chain1.some((e) => e.fact_type === 'IoRequest'), 'IoRequest fact recorded');
check(eng.verify_audit_chain() === true, 'chain verified after io_required');

// --- 3. resolve_io -> state: decision=notified, io_status from __io_result__ ---
const r2 = JSON.parse(eng.resolve_io(JSON.stringify({ status: 'ok' })));
check(r2.type === 'state', 'resolve_io -> state (replay committed)', JSON.stringify(r2));
check(r2.payload?.data?.result?.decision === 'notified', 'decision=notified', JSON.stringify(r2.payload));
check(r2.payload?.data?.result?.io_status === 'ok', 'io_status consumed from __io_result__', JSON.stringify(r2.payload));
check(r2.payload?.__io_result__ === null || r2.payload?.__io_result__ === undefined, '__io_result__ cleared');
check(eng.verify_audit_chain() === true, 'chain verified after replay commit');

// --- 4. second notify_request -> fresh io_request (no stale consumption) ---
const r3 = JSON.parse(eng.execute_instruction(JSON.stringify(SAMPLES['io'])));
check(r3.type === 'io_required', 'second request -> fresh io_required (stale not consumed)', JSON.stringify(r3));
const r4 = JSON.parse(eng.resolve_io(JSON.stringify({ status: 'timeout' })));
check(r4.type === 'state' && r4.payload?.data?.result?.io_status === 'timeout', 'second resolve consumes new result', JSON.stringify(r4.payload));

// --- 5. external_tool_request branch ---
const r5 = JSON.parse(eng.execute_instruction(JSON.stringify({
  type: 'external_tool_request',
  params: { tool_name: 'risk-scoring', arguments: { amount: 5000 } },
})));
check(r5.type === 'io_required' && r5.io_type === 'call_external', 'external_tool_request -> io_required', JSON.stringify(r5));
check(r5.params?.tool_name === 'risk-scoring', 'tool_name resolved', JSON.stringify(r5.params));
const r6 = JSON.parse(eng.resolve_io(JSON.stringify({ status: 'ok' })));
check(r6.type === 'state' && r6.payload?.data?.result?.decision === 'executed', 'decision=executed', JSON.stringify(r6.payload));

// --- 6. business rulesets still behave (finance blocked path unchanged) ---
const fin = new EvoRuleEngine();
fin.load_rules(JSON.stringify(RULESETS['finance'].transform));
const rf = JSON.parse(fin.execute_instruction(JSON.stringify(SAMPLES['finance'])));
check(rf.type === 'state' && rf.payload?.data?.result?.decision === 'blocked', 'finance travel 5000 still blocked', JSON.stringify(rf.payload));

console.log('\nSUMMARY: failures=' + failures);
process.exit(failures ? 1 : 0);
