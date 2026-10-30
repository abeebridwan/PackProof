import { mkdirSync, readFileSync, writeFileSync, renameSync, rmdirSync } from 'node:fs';
import { z } from 'zod';

const Ledger = z.strictObject({ reservedCents: z.number().int().min(0).max(300), requests: z.number().int().min(0) });
export class ProbeBudget {
  constructor(readonly reservationCents: number, readonly creditsCents: number) {
    if (!Number.isInteger(reservationCents) || reservationCents < 1 || reservationCents > 75 || !Number.isFinite(creditsCents) || creditsCents < reservationCents) throw new Error('Confirmed pricing and credits required');
  }
  reserveMemory(ledger: z.infer<typeof Ledger>) {
    Ledger.parse(ledger);
    if (ledger.reservedCents + this.reservationCents > Math.min(300, this.creditsCents) || ledger.requests >= 7) throw new Error('P0 budget/request cap exhausted');
    return { reservedCents: ledger.reservedCents + this.reservationCents, requests: ledger.requests + 1 };
  }
  reserve() {
    mkdirSync('.local', { recursive: true });
    // Exclusive cross-process lock; fail closed if another probe is running or a lock remains after a crash.
    mkdirSync('.local/provider-budget.lock');
    try {
      let ledger = { reservedCents: 0, requests: 0 };
      try { ledger = Ledger.parse(JSON.parse(readFileSync('.local/provider-budget.json', 'utf8'))); }
      catch (e) { if (!(e instanceof Error && 'code' in e && e.code === 'ENOENT')) throw e; }
      const next = this.reserveMemory(ledger);
      writeFileSync('.local/provider-budget.tmp', JSON.stringify(next), { mode: 0o600 });
      renameSync('.local/provider-budget.tmp', '.local/provider-budget.json');
      return next;
    } finally { rmdirSync('.local/provider-budget.lock'); }
  }
}
