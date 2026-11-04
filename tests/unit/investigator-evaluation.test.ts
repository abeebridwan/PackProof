import '../fixtures/clock.js';
import {it,expect} from 'vitest';
import {EVIDENCE_CASES} from '../fixtures/evidence-cases.js';
import {fixture,input} from '../fixtures/investigator-memory.js';
import {startInvestigation} from '../../src/server/investigator/graph.js';
for(const c of EVIDENCE_CASES)it(`P1 fixed evidence case: ${c.id}`,async()=>{const f=await fixture();const result=await startInvestigation(f.options,input(c.changes));expect(result.finding?.status).toBe(c.expected);expect(result.actions).toBeLessThanOrEqual(8);if(c.group!=='supported')expect(result.finding?.status).not.toBe('supported');const refs=new Set(f.dataset.records.map(r=>r.id));for(const claim of result.finding!.claims)for(const id of claim.evidence_refs)expect(refs.has(id)).toBe(true);},15000);
