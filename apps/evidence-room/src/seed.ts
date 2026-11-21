import type { DataStore } from '@x10/shared/data';
import { DAY, HOUR } from '@x10/shared/lib';
import type { SeedContext } from '@x10/shared/runtime';

import type { EvidenceKind, Priority, Schema, Side, Status, ThreadKind } from './model';

/**
 * One fictional year-end audit in fieldwork: 7 areas, 48 requests across every status and ageing bucket,
 * 4 auditors and 6 client people, 59 evidence entries and 41 thread messages. Dates come from ctx.now:
 * due dates sit 6 hours after a whole number of days from now, so ageing buckets stay stable for hours.
 *
 * Expected figures (asserted in seed.test.ts and e2e/acceptance.spec.ts):
 * statuses: 18 accepted, 7 submitted, 6 query, 8 in progress, 7 open, 2 withdrawn.
 * ageing of the 21 outstanding: 10 not due, 5 at 1–7 days late, 3 at 8–14, 3 at 15+.
 * progress: Revenue 3/9, Payroll 3/5, Fixed assets 3/6, Cash 3/6, Inventory 1/7, Tax 2/6, IT general controls 3/7.
 */

type Who = 'dana' | 'morgan' | 'riley' | 'sam' | 'priya' | 'jo' | 'kai' | 'lee' | 'ana' | 'tom';

interface Ev {
  k: EvidenceKind;
  t: string;
  l: string;
  n?: string;
  v?: number;
}

interface Msg {
  by: Who;
  kind?: ThreadKind;
  body: string;
  /** Days ago. */
  at: number;
}

interface Req {
  t: string;
  d: string;
  st: Status;
  o: Who | null;
  /** Due date in days from now (negative: past). */
  due: number;
  p?: Priority;
  /** Days ago submitted / accepted. */
  s?: number;
  acc?: number;
  ev?: Ev[];
  th?: Msg[];
}

interface Area {
  code: string;
  name: string;
  lead: Who;
  reqs: Req[];
}

const AREAS: Area[] = [
  {
    code: 'REV',
    name: 'Revenue',
    lead: 'morgan',
    reqs: [
      {
        t: 'Revenue by stream reconciled to the general ledger',
        d: 'Monthly revenue by stream for the full year, tied to the trial balance. Explain any difference over 5,000.',
        st: 'accepted', o: 'sam', due: -20, p: 'high', s: 21, acc: 18,
        ev: [
          { k: 'file', t: 'Revenue by stream FY26', l: 'Year-end FY26/Revenue/revenue-by-stream-fy26.xlsx' },
          { k: 'link', t: 'Trial balance extract at period end', l: 'https://files.example.com/finance/fy26/trial-balance' },
          { k: 'file', t: 'Revenue by stream FY26, reconciling items added', l: 'Year-end FY26/Revenue/revenue-by-stream-fy26-v2.xlsx', v: 2 },
        ],
        th: [
          { by: 'morgan', kind: 'query', body: 'Month 9 is 18,400 short of the ledger. Please add the reconciling items.', at: 24 },
          { by: 'sam', body: 'Reconciling items are on a new tab: two credit notes posted a month late against month 9 invoices.', at: 22 },
        ],
      },
      {
        t: 'Listing of customer contracts over 250,000',
        d: 'All contracts signed or amended in the year with a value over 250,000, with start dates and terms.',
        st: 'accepted', o: 'sam', due: -18, s: 20, acc: 16,
        ev: [{ k: 'file', t: 'Contract listing over 250k', l: 'Year-end FY26/Revenue/contracts-over-250k.xlsx' }],
        th: [{ by: 'morgan', body: 'Thanks, this is complete.', at: 16 }],
      },
      {
        t: 'Revenue cut-off: invoices either side of period end',
        d: 'Invoices dated in the last ten days before and the first ten days after period end, with delivery evidence, to test cut-off.',
        st: 'query', o: 'sam', due: -12, p: 'high', s: 9,
        ev: [
          { k: 'file', t: 'Cut-off invoice listing', l: 'Year-end FY26/Revenue/cutoff-invoices.xlsx' },
          { k: 'link', t: 'Delivery notes folder', l: 'https://files.example.com/finance/fy26/delivery-notes' },
        ],
        th: [
          { by: 'morgan', kind: 'query', body: 'Three invoices dated after period end show deliveries before it. Please send the signed delivery notes for invoices 20931, 20934 and 20940.', at: 7 },
        ],
      },
      {
        t: 'Credit notes raised after period end',
        d: 'All credit notes raised from period end to the date of this request, with the original invoice for each.',
        st: 'in_progress', o: 'sam', due: -4,
        ev: [{ k: 'file', t: 'Credit notes after period end, first month', l: 'Year-end FY26/Revenue/credit-notes-post-ye.xlsx' }],
        th: [{ by: 'dana', body: 'Sam is pulling the second month of credit notes; the first month is attached.', at: 2 }],
      },
      {
        t: 'Deferred revenue roll-forward',
        d: 'Opening balance, additions, releases and closing balance by contract type, agreed to the ledger.',
        st: 'submitted', o: 'sam', due: -2, s: 3,
        ev: [
          { k: 'file', t: 'Deferred revenue roll-forward', l: 'Year-end FY26/Revenue/deferred-revenue-rf.xlsx' },
          { k: 'note', t: 'Release policy', l: '', n: 'Releases follow the straight-line policy in the revenue memo, section 4.' },
          { k: 'file', t: 'Deferred revenue roll-forward, corrected opening balance', l: 'Year-end FY26/Revenue/deferred-revenue-rf-v2.xlsx', v: 2 },
        ],
        th: [
          { by: 'morgan', kind: 'query', body: 'The opening balance does not agree to last year’s signed accounts. Which figure is right?', at: 8 },
          { by: 'sam', body: 'Last year’s figure is right; the roll-forward used a draft. Corrected in version 2.', at: 4 },
        ],
      },
      {
        t: 'Sample of 25 sales invoices with proof of delivery',
        d: 'The sample is listed on the selection sheet. For each item, the invoice, the order and the proof of delivery.',
        st: 'in_progress', o: 'sam', due: 5, p: 'high',
        ev: [{ k: 'link', t: 'Sales sample, first 12 of 25', l: 'https://files.example.com/finance/fy26/sales-sample' }],
        th: [{ by: 'sam', body: 'First 12 of the sample are in the folder; the rest by Friday.', at: 1 }],
      },
      {
        t: 'Customer rebate accruals and the agreements behind them',
        d: 'Rebate accrual at period end by customer, with the signed rebate agreements.',
        st: 'open', o: null, due: 6,
      },
      {
        t: 'Trade receivables ageing at period end',
        d: 'Aged debtors at period end agreed to the ledger, with the provision matrix.',
        st: 'accepted', o: 'sam', due: -15, s: 17, acc: 13,
        ev: [{ k: 'file', t: 'Aged debtors at period end', l: 'Year-end FY26/Revenue/aged-debtors.xlsx' }],
      },
      {
        t: 'Bad debt provision calculation',
        d: 'The provision workings, the policy and any specific provisions over 20,000.',
        st: 'open', o: 'sam', due: -17, p: 'high',
        th: [{ by: 'dana', body: 'Assigned to Sam. The credit team owns the workings; Sam will collect them.', at: 19 }],
      },
    ],
  },
  {
    code: 'PAY',
    name: 'Payroll',
    lead: 'riley',
    reqs: [
      {
        t: 'Payroll reconciliation to the general ledger, all twelve months',
        d: 'Gross pay, employer taxes and pension per the payroll reports agreed to the ledger each month.',
        st: 'accepted', o: 'priya', due: -20, p: 'high', s: 21, acc: 17,
        ev: [
          { k: 'file', t: 'Payroll to ledger FY26', l: 'Year-end FY26/Payroll/payroll-to-gl.xlsx' },
          { k: 'link', t: 'Monthly payroll reports', l: 'https://files.example.com/payroll/fy26/monthly-reports' },
          { k: 'file', t: 'Payroll to ledger FY26, month 9 fixed', l: 'Year-end FY26/Payroll/payroll-to-gl-v2.xlsx', v: 2 },
        ],
        th: [
          { by: 'riley', kind: 'query', body: 'Month 9 employer pension does not agree; the difference is 3,212.', at: 23 },
          { by: 'priya', body: 'A late joiner was back-dated in month 10. Version 2 shows it.', at: 22 },
        ],
      },
      {
        t: 'Starters and leavers listing for the year',
        d: 'Name, start or leave date, and the payroll month of the first or last payment.',
        st: 'accepted', o: 'priya', due: -16, s: 18, acc: 15,
        ev: [{ k: 'file', t: 'Starters and leavers FY26', l: 'Year-end FY26/Payroll/starters-leavers.xlsx' }],
      },
      {
        t: 'Sample of 15 employees: contracts and pay slips',
        d: 'For each selected employee, the signed contract, the latest pay change letter and the pay slip for the selected month.',
        st: 'query', o: 'priya', due: -3, s: 6,
        ev: [
          { k: 'link', t: 'Employee sample pack', l: 'https://files.example.com/payroll/fy26/sample-pack' },
          { k: 'file', t: 'Pay slips, selected month', l: 'Year-end FY26/Payroll/payslips-sample.pdf' },
        ],
        th: [
          { by: 'riley', kind: 'query', body: 'Employees 7 and 12 have no pay change letter for the spring pay rise. Can you send them?', at: 4 },
          { by: 'priya', body: 'HR is retrieving both letters from the archive; expect them early next week.', at: 3 },
        ],
      },
      {
        t: 'Bonus accrual and the approval minutes',
        d: 'The year-end bonus accrual by scheme, with the committee minutes approving the pool.',
        st: 'submitted', o: 'priya', due: -1, p: 'high', s: 2,
        ev: [{ k: 'file', t: 'Bonus accrual FY26', l: 'Year-end FY26/Payroll/bonus-accrual.xlsx' }],
        th: [{ by: 'priya', body: 'The minutes are on page 4 of the accrual workbook.', at: 2 }],
      },
      {
        t: 'Payroll tax filings for the year',
        d: 'The monthly payroll tax returns and payment confirmations.',
        st: 'accepted', o: 'priya', due: -10, s: 12, acc: 9,
        ev: [{ k: 'link', t: 'Payroll tax filings', l: 'https://files.example.com/payroll/fy26/tax-filings' }],
      },
      {
        t: 'Holiday pay accrual calculation',
        d: 'Untaken leave at period end by employee, valued at current pay.',
        st: 'withdrawn', o: 'priya', due: -9,
        th: [{ by: 'riley', kind: 'withdrawal', body: 'Covered by the holiday pay tab in the PAY-01 workbook; no separate request needed.', at: 12 }],
      },
    ],
  },
  {
    code: 'FA',
    name: 'Fixed assets',
    lead: 'jo',
    reqs: [
      {
        t: 'Fixed asset register reconciled to the general ledger',
        d: 'Cost and accumulated depreciation by asset class, agreed to the ledger at period end.',
        st: 'accepted', o: 'lee', due: -19, p: 'high', s: 21, acc: 16,
        ev: [{ k: 'file', t: 'Fixed asset register FY26', l: 'Year-end FY26/Fixed assets/far-fy26.xlsx' }],
      },
      {
        t: 'Additions over 50,000 with invoices',
        d: 'Every addition over 50,000 with the invoice and the capital approval form.',
        st: 'accepted', o: 'lee', due: -14, s: 13, acc: 10,
        ev: [
          { k: 'file', t: 'Additions over 50k', l: 'Year-end FY26/Fixed assets/additions-50k.xlsx' },
          { k: 'link', t: 'Addition invoices', l: 'https://files.example.com/finance/fy26/fa-invoices' },
          { k: 'file', t: 'Capital approval forms', l: 'Year-end FY26/Fixed assets/capex-approvals.pdf', v: 2 },
        ],
        th: [
          { by: 'jo', kind: 'query', body: 'The invoices are here, but the capital approval forms are missing for four additions.', at: 15 },
          { by: 'lee', body: 'Approval forms added as one PDF.', at: 13 },
        ],
      },
      {
        t: 'Disposals and proceeds',
        d: 'Assets disposed of in the year, net book value at disposal, proceeds and the gain or loss.',
        st: 'submitted', o: 'lee', due: -5, s: 4,
        ev: [{ k: 'file', t: 'Disposals FY26', l: 'Year-end FY26/Fixed assets/disposals.xlsx' }],
        th: [{ by: 'lee', body: 'The gain on disposal agrees to the ledger.', at: 4 }],
      },
      {
        t: 'Depreciation recalculation workbook',
        d: 'Depreciation by asset class with useful lives and any changes to estimates.',
        st: 'in_progress', o: 'lee', due: -6,
        ev: [{ k: 'file', t: 'Depreciation workings, draft', l: 'Year-end FY26/Fixed assets/depreciation-draft.xlsx' }],
        th: [{ by: 'lee', body: 'Draft attached; the useful life review for vehicles is still with the controller.', at: 5 }],
      },
      {
        t: 'Impairment review memo',
        d: 'Management’s review of impairment indicators and any impairment testing.',
        st: 'open', o: null, due: 9, p: 'high',
      },
      {
        t: 'Capital commitments at period end',
        d: 'Contracted but not provided capital commitments, with the contracts.',
        st: 'accepted', o: 'lee', due: -12, s: 13, acc: 11,
        ev: [
          {
            k: 'note',
            t: 'Capital commitments',
            l: '',
            n: 'Two contracts: warehouse racking (182,000) and a forklift fleet lease (96,500). Both contracts are in the board pack.',
          },
        ],
      },
    ],
  },
  {
    code: 'CASH',
    name: 'Cash',
    lead: 'riley',
    reqs: [
      {
        t: 'Bank reconciliations for all operating accounts at period end',
        d: 'Reconciliations for every operating account with the bank statement and the list of reconciling items.',
        st: 'accepted', o: 'sam', due: -21, p: 'high', s: 20, acc: 18,
        ev: [
          { k: 'file', t: 'Bank reconciliations at period end', l: 'Year-end FY26/Cash/bank-recs.xlsx' },
          { k: 'link', t: 'Bank statements at period end', l: 'https://files.example.com/treasury/fy26/statements' },
          { k: 'file', t: 'Bank reconciliations with cleared items', l: 'Year-end FY26/Cash/bank-recs-v2.xlsx', v: 2 },
        ],
        th: [
          { by: 'riley', kind: 'query', body: 'Please show when the three largest outstanding cheques cleared.', at: 22 },
          { by: 'sam', body: 'Clearing dates added in version 2; all three cleared within nine days.', at: 21 },
        ],
      },
      {
        t: 'Bank confirmation letters',
        d: 'Authority letters for the auditor to request confirmations from each bank.',
        st: 'accepted', o: 'dana', due: -14, s: 16, acc: 12,
        ev: [{ k: 'file', t: 'Signed bank authority letters', l: 'Year-end FY26/Cash/bank-authorities.pdf' }],
      },
      {
        t: 'Cash count certificate for petty cash',
        d: 'The petty cash count at period end, signed by two people.',
        st: 'accepted', o: 'dana', due: -11, s: 13, acc: 10,
        ev: [{ k: 'file', t: 'Petty cash count', l: 'Year-end FY26/Cash/petty-cash-count.pdf' }],
      },
      {
        t: 'Foreign currency revaluation of bank balances',
        d: 'The closing rates used and the revaluation of each foreign currency account.',
        st: 'query', o: 'sam', due: -9, p: 'high', s: 6,
        ev: [
          { k: 'file', t: 'FX revaluation', l: 'Year-end FY26/Cash/fx-revaluation.xlsx' },
          { k: 'link', t: 'Closing rates source', l: 'https://files.example.com/treasury/fy26/closing-rates' },
        ],
        th: [{ by: 'riley', kind: 'query', body: 'The euro account uses the average rate, not the closing rate. Please revalue it at the closing rate.', at: 5 }],
      },
      {
        t: 'Restricted cash and bank guarantees',
        d: 'Any cash that is restricted or pledged, and guarantees issued by the banks.',
        st: 'submitted', o: 'sam', due: -2, s: 1,
        ev: [{ k: 'note', t: 'Restricted cash', l: '', n: 'One rent deposit of 45,000 held in escrow; no bank guarantees outstanding.' }],
        th: [{ by: 'sam', body: 'The escrow letter is in the lease file if you need it.', at: 1 }],
      },
      {
        t: 'Intercompany loan statements',
        d: 'Statements for each intercompany loan, with interest charged in the year.',
        st: 'in_progress', o: 'sam', due: 3,
        ev: [{ k: 'file', t: 'Intercompany loans', l: 'Year-end FY26/Cash/ic-loans.xlsx' }],
      },
      {
        t: 'Bank statements for the month after period end',
        d: 'All operating accounts.',
        st: 'withdrawn', o: 'sam', due: -7,
        th: [{ by: 'riley', kind: 'withdrawal', body: 'Duplicate: the statements came with the CASH-01 pack.', at: 10 }],
      },
    ],
  },
  {
    code: 'INV',
    name: 'Inventory',
    lead: 'kai',
    reqs: [
      {
        t: 'Stock count instructions and count sheets',
        d: 'The count instructions issued to staff and the signed count sheets from both sites.',
        st: 'accepted', o: 'ana', due: -20, p: 'high', s: 20, acc: 17,
        ev: [
          { k: 'file', t: 'Count instructions', l: 'Year-end FY26/Inventory/count-instructions.pdf' },
          { k: 'link', t: 'Count sheets, main site', l: 'https://files.example.com/ops/fy26/count-sheets' },
          { k: 'link', t: 'Count sheets, second site', l: 'https://files.example.com/ops/fy26/count-sheets-site-2', v: 2 },
        ],
        th: [
          { by: 'kai', kind: 'query', body: 'Only the main site count sheets are here. Please add the second site.', at: 22 },
          { by: 'ana', body: 'Second site sheets added.', at: 21 },
        ],
      },
      {
        t: 'Inventory valuation: standard cost roll',
        d: 'Standard costs at period end, the cost roll and the variance analysis.',
        st: 'query', o: 'ana', due: -16, p: 'high', s: 14,
        ev: [
          { k: 'file', t: 'Standard cost roll', l: 'Year-end FY26/Inventory/std-cost-roll.xlsx' },
          { k: 'file', t: 'Variance analysis', l: 'Year-end FY26/Inventory/variances.xlsx' },
        ],
        th: [
          { by: 'kai', kind: 'query', body: 'Purchase price variances are 6% of stock. Please explain why the standards were not updated.', at: 12 },
          { by: 'ana', body: 'Working on it with the cost accountant.', at: 10 },
        ],
      },
      {
        t: 'Slow-moving and obsolete stock provision',
        d: 'Items with no movement in 12 months, the provision policy and the calculation.',
        st: 'in_progress', o: 'ana', due: -10,
        ev: [{ k: 'file', t: 'Slow-moving stock listing', l: 'Year-end FY26/Inventory/slow-moving.xlsx' }],
        th: [{ by: 'kai', body: 'Please include the provision policy with the listing.', at: 6 }],
      },
      {
        t: 'Goods received not invoiced at period end',
        d: 'The listing at period end with the ten largest items supported.',
        st: 'submitted', o: 'ana', due: -4, s: 5,
        ev: [{ k: 'file', t: 'Goods received not invoiced', l: 'Year-end FY26/Inventory/grni.xlsx' }],
        th: [{ by: 'ana', body: 'The ten largest items are highlighted.', at: 5 }],
      },
      {
        t: 'Inventory held by third parties: confirmations',
        d: 'Confirmation letters for stock held at the two third-party warehouses.',
        st: 'open', o: 'ana', due: 4,
        th: [{ by: 'dana', body: 'Assigned to Ana. The letters go out this week.', at: 3 }],
      },
      {
        t: 'Cost of sales reconciliation',
        d: 'Cost of sales per the ledger agreed to the inventory movement.',
        st: 'open', o: null, due: 8,
      },
      {
        t: 'Test counts at the second warehouse',
        d: 'The results of the auditor’s test counts, agreed to the final stock listing.',
        st: 'query', o: 'ana', due: 2, s: 3,
        ev: [{ k: 'file', t: 'Final stock listing', l: 'Year-end FY26/Inventory/final-stock.xlsx' }],
        th: [{ by: 'kai', kind: 'query', body: 'Two of our test counts do not agree to the final listing (items 4471 and 5520). Please explain.', at: 1.5 }],
      },
    ],
  },
  {
    code: 'TAX',
    name: 'Tax',
    lead: 'jo',
    reqs: [
      {
        t: 'Current tax computation',
        d: 'The draft current tax computation with the reconciliation of profit to taxable profit.',
        st: 'accepted', o: 'lee', due: -15, p: 'high', s: 15, acc: 12,
        ev: [
          { k: 'file', t: 'Tax computation, draft', l: 'Year-end FY26/Tax/ct-comp-draft.xlsx' },
          { k: 'link', t: 'Tax adviser letter', l: 'https://files.example.com/finance/fy26/tax-adviser' },
          { k: 'file', t: 'Tax computation, final', l: 'Year-end FY26/Tax/ct-comp-final.xlsx', v: 2 },
        ],
        th: [
          { by: 'jo', kind: 'query', body: 'Disallowed entertainment looks low against the ledger. Please check.', at: 17 },
          { by: 'lee', body: 'Corrected in the final computation.', at: 16 },
        ],
      },
      {
        t: 'Deferred tax workings',
        d: 'Temporary differences, the rates used and the movement in the deferred tax balance.',
        st: 'submitted', o: 'lee', due: -3, p: 'high', s: 2,
        ev: [{ k: 'file', t: 'Deferred tax workings', l: 'Year-end FY26/Tax/deferred-tax.xlsx' }],
        th: [{ by: 'lee', body: 'Rates reflect the change enacted in the year.', at: 2 }],
      },
      {
        t: 'Tax payments and refunds schedule',
        d: 'Instalments paid and refunds received in the year, with bank evidence.',
        st: 'accepted', o: 'lee', due: -12, s: 14, acc: 11,
        ev: [{ k: 'file', t: 'Tax payments FY26', l: 'Year-end FY26/Tax/tax-payments.xlsx' }],
      },
      {
        t: 'Correspondence with the tax authority this year',
        d: 'Letters, enquiries and any open matters.',
        st: 'in_progress', o: 'lee', due: -2,
        ev: [{ k: 'link', t: 'Tax correspondence folder', l: 'https://files.example.com/finance/fy26/tax-correspondence' }],
        th: [{ by: 'lee', body: 'One open enquiry on research credits; the letter is in the folder.', at: 2 }],
      },
      {
        t: 'Transfer pricing documentation',
        d: 'The transfer pricing policy and the documentation for intercompany charges.',
        st: 'open', o: null, due: 10,
      },
      {
        t: 'Sales tax returns reconciled to the ledger',
        d: 'Each quarterly return agreed to the ledger, with differences explained.',
        st: 'query', o: 'lee', due: -19, s: 18,
        ev: [{ k: 'file', t: 'Sales tax reconciliation', l: 'Year-end FY26/Tax/sales-tax-rec.xlsx' }],
        th: [{ by: 'jo', kind: 'query', body: 'Quarter 3 differs from the ledger by 7,860 with no explanation.', at: 16 }],
      },
    ],
  },
  {
    code: 'ITGC',
    name: 'IT general controls',
    lead: 'kai',
    reqs: [
      {
        t: 'User access listing for the finance system',
        d: 'All active users with their roles, exported from the system with the run date visible.',
        st: 'accepted', o: 'tom', due: -17, p: 'high', s: 17, acc: 14,
        ev: [
          { k: 'file', t: 'User access export', l: 'Year-end FY26/IT/user-access-export.csv' },
          { k: 'note', t: 'Export method', l: '', n: 'Exported by the system administrator from the admin console.' },
          { k: 'file', t: 'User access export with run date', l: 'Year-end FY26/IT/user-access-export-v2.pdf', v: 2 },
        ],
        th: [
          { by: 'kai', kind: 'query', body: 'The export has no run date or parameters. Please re-run it with the header visible.', at: 19 },
          { by: 'tom', body: 'Re-run with the header; a capture of the parameters is included.', at: 18 },
        ],
      },
      {
        t: 'Leavers removed from the finance system within five days',
        d: 'For each leaver, the leave date and the date access was removed.',
        st: 'accepted', o: 'tom', due: -13, s: 15, acc: 12,
        ev: [{ k: 'file', t: 'Leaver access removal', l: 'Year-end FY26/IT/leaver-removal.xlsx' }],
      },
      {
        t: 'Change management tickets for the year',
        d: 'All changes released to the finance system, with approval and testing evidence.',
        st: 'submitted', o: 'tom', due: -6, p: 'high', s: 7,
        ev: [{ k: 'link', t: 'Change tickets export', l: 'https://files.example.com/it/fy26/changes' }],
        th: [{ by: 'tom', body: 'The export links the test evidence for each ticket.', at: 7 }],
      },
      {
        t: 'Privileged access review evidence',
        d: 'The quarterly reviews of administrator accounts, with sign-off.',
        st: 'in_progress', o: 'tom', due: -5, p: 'high',
        ev: [{ k: 'file', t: 'Privileged access review, quarters 1 and 2', l: 'Year-end FY26/IT/pa-review-q1-q2.pdf' }],
        th: [{ by: 'tom', body: 'Quarters 3 and 4 are waiting for the CIO’s sign-off.', at: 3 }],
      },
      {
        t: 'Backup and restore test results',
        d: 'The restore tests performed in the year and their results.',
        st: 'accepted', o: 'tom', due: -8, s: 10, acc: 7,
        ev: [{ k: 'file', t: 'Restore tests', l: 'Year-end FY26/IT/restore-tests.pdf' }],
      },
      {
        t: 'Batch job monitoring: failed job log',
        d: 'The failed job log for the year and how each failure was resolved.',
        st: 'in_progress', o: 'tom', due: 6,
        ev: [{ k: 'file', t: 'Failed job log', l: 'Year-end FY26/IT/failed-jobs.xlsx' }],
      },
      {
        t: 'Segregation of duties matrix for the finance system',
        d: 'Roles that conflict and how they are prevented or monitored.',
        st: 'open', o: 'tom', due: 12,
      },
    ],
  },
];

/** People who are not demo personas (fictional). */
const EXTRA: Record<'jo' | 'kai' | 'lee' | 'ana' | 'tom', { sub: string; name: string }> = {
  jo: { sub: 'seed-auditor-jo', name: 'Jo Lindqvist' },
  kai: { sub: 'seed-auditor-kai', name: 'Kai Moreno' },
  lee: { sub: 'seed-owner-lee', name: 'Lee Adebayo' },
  ana: { sub: 'seed-owner-ana', name: 'Ana Petrov' },
  tom: { sub: 'seed-owner-tom', name: 'Tom Fischer' },
};

const SIDE: Record<Who, Side> = {
  dana: 'client', sam: 'client', priya: 'client', lee: 'client', ana: 'client', tom: 'client',
  morgan: 'auditor', riley: 'auditor', jo: 'auditor', kai: 'auditor',
};

/** Fictional, generic seed data. Dates are computed from ctx.now. Runs once (runSeed checks a marker row). */
export async function seed(store: DataStore<Schema>, ctx: SeedContext): Promise<void> {
  const [dana, morgan, riley, sam, priya] = ctx.people;
  const who: Record<Who, { sub: string; name: string }> = {
    dana: { sub: dana.sub, name: dana.displayName },
    morgan: { sub: morgan.sub, name: morgan.displayName },
    riley: { sub: riley.sub, name: riley.displayName },
    sam: { sub: sam.sub, name: sam.displayName },
    priya: { sub: priya.sub, name: priya.displayName },
    ...EXTRA,
  };
  const now = ctx.now.getTime();
  const ago = (days: number) => new Date(now - days * DAY).toISOString();
  // Due 6 hours past a whole number of days, so "days late" does not tick over minutes after seeding.
  const due = (days: number) => new Date(now + days * DAY + 6 * HOUR).toISOString();
  const d = new Date(now);
  const periodEnd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 4, 0, 12)).toISOString();

  const engagement = await store.repo('Engagement').create({
    name: 'FY2026 year-end audit',
    periodEnd,
    fieldworkStart: ago(21),
    fieldworkEnd: due(14),
    status: 'fieldwork',
  });
  const engagementId = engagement.id;

  const members: [Who, 'lead' | 'member' | 'coordinator'][] = [
    ['dana', 'coordinator'], ['sam', 'member'], ['priya', 'member'], ['lee', 'member'], ['ana', 'member'], ['tom', 'member'],
    ['morgan', 'lead'], ['riley', 'member'], ['jo', 'member'], ['kai', 'member'],
  ];
  for (const [w, role] of members) {
    await store.repo('Member').create({ engagementId, personSub: who[w].sub, personName: who[w].name, side: SIDE[w], role });
  }

  for (const [pos, a] of AREAS.entries()) {
    const area = await store.repo('AuditArea').create({
      engagementId,
      name: a.name,
      code: a.code,
      position: pos + 1,
      leadAuditorName: who[a.lead].name,
    });
    for (const [i, r] of a.reqs.entries()) {
      const owner = r.o ? who[r.o] : null;
      const req = await store.repo('EvidenceRequest').create({
        engagementId,
        areaId: area.id,
        ref: `${a.code}-${String(i + 1).padStart(2, '0')}`,
        title: r.t,
        detail: r.d,
        ownerSub: owner?.sub ?? null,
        ownerName: owner?.name ?? null,
        dueAt: due(r.due),
        priority: r.p ?? 'normal',
        status: r.st,
        createdBy: who[a.lead].sub,
        submittedAt: r.s !== undefined ? ago(r.s) : null,
        acceptedAt: r.acc !== undefined ? ago(r.acc) : null,
        acceptedBy: r.acc !== undefined ? who[a.lead].sub : null,
      });
      const firstQuery = r.th?.find((m) => m.kind === 'query')?.at;
      for (const [j, e] of (r.ev ?? []).entries()) {
        const v = e.v ?? 1;
        // Round 1 lands before the first submission; round 2 after the query that asked for it.
        const at = v === 1 ? Math.max(r.s ?? 1, firstQuery ?? 0) + 1 + j * 0.1 : (r.s ?? 1) + 0.4;
        await store.repo('Evidence').create({
          requestId: req.id,
          kind: e.k,
          title: e.t,
          location: e.l,
          note: e.n ?? null,
          addedBy: owner?.sub ?? who.dana.sub,
          addedAt: ago(at),
          version: v,
        });
      }
      for (const m of r.th ?? []) {
        await store.repo('Thread').create({
          requestId: req.id,
          bySub: who[m.by].sub,
          byName: who[m.by].name,
          side: SIDE[m.by],
          kind: m.kind ?? 'message',
          body: m.body,
          at: ago(m.at),
        });
      }
    }
  }
}
