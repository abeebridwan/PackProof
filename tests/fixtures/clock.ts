// Fixed signed fixtures must be evaluated at their recorded date, never today's wall clock.
// Only Date is faked; network, graph scheduling and timeout timers continue to run normally.
import {beforeEach,afterEach,vi} from 'vitest';
import {DEMO_AT} from '../../scripts/p1/demo.js';
beforeEach(()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(DEMO_AT));});
afterEach(()=>vi.useRealTimers());
