import type { DemoScript } from '@x10/shared/demo';

const DANA = 'demo-coord-dana';
const MORGAN = 'demo-auditor-morgan';
const SAM = 'demo-owner-sam';

export const script: DemoScript = {
  title: 'Evidence Room: the audit request list as a card catalogue',
  persona: DANA,
  scenes: [
    {
      id: 'hook',
      say: [
        'Every year-end audit runs on a long list of client requests, and nobody can see all of it at once.',
        'Evidence Room turns that list into a card catalogue: one drawer per audit area, one card per request.',
      ],
      async run(h) {
        await h.goto('/', DANA);
        await h.pause(2500);
        await h.hover(h.page.locator('[data-testid="drawer"][data-code="REV"]'));
        await h.pause(2500);
      },
    },
    {
      id: 'read',
      say: ['Red tabs are overdue, paper clips are open queries, and the brass strip fills as the auditor accepts evidence.'],
      async run(h) {
        await h.spotlight(h.page.locator('[data-testid="drawer"][data-code="INV"]'), 3000);
        await h.spotlight(h.page.getByTestId('plaque'), 2500);
      },
    },
    {
      id: 'lens',
      say: ['Switch the lens to ageing, and the same cards show how late each one is.'],
      async run(h) {
        await h.click(h.page.getByRole('radiogroup', { name: 'Lens' }).getByRole('radio', { name: /Ageing/ }));
        await h.pause(3500);
      },
    },
    {
      id: 'today',
      say: ['Today ranks what needs attention; this one opens Revenue and lifts out the bad debt provision, seventeen days late.'],
      async run(h) {
        await h.click(h.page.getByRole('button', { name: /REV-09 Bad debt provision calculation is 17 days late/ }));
        await h.pause(4000);
      },
    },
    {
      id: 'view-as',
      say: ['View as auditor, and only the submissions waiting for review stay lit.'],
      async run(h) {
        await h.page.keyboard.press('Escape');
        await h.page.keyboard.press('Escape');
        await h.click(h.page.getByRole('radiogroup', { name: 'View as' }).getByRole('radio', { name: 'Auditor', exact: true }));
        await h.pause(3500);
        await h.click(h.page.getByRole('radiogroup', { name: 'View as' }).getByRole('radio', { name: 'All', exact: true }));
      },
    },
    {
      id: 'owner',
      say: [
        'Sam owns that request. From his Today, the reading desk shows the card, its evidence and its thread.',
        'Adding the first evidence moves the card to in progress; submitting sends it to the auditor.',
      ],
      async run(h) {
        await h.goto('/', SAM);
        await h.click(h.page.getByRole('button', { name: /REV-09 Bad debt provision calculation is 17 days late/ }));
        await h.pause(1500);
        await h.click(h.page.getByTestId('focus-open'));
        await h.pause(1200);
        const form = h.page.getByTestId('evidence-form');
        await h.type(form.getByLabel('Title'), 'Provision workings and policy');
        await h.fill(form.getByLabel('Link'), 'https://files.example.com/finance/fy26/bad-debt');
        await h.click(form.getByRole('button', { name: 'Add to the card' }));
        await h.pause(1500);
        await h.click(h.page.getByRole('button', { name: 'Submit to the auditor' }));
        await h.pause(2000);
      },
    },
    {
      id: 'trolley',
      say: [
        'As the lead auditor, the returns trolley lists every submission, oldest first, to accept or query.',
        'Only auditors get these buttons, and a query needs a real question.',
      ],
      async run(h) {
        await h.goto('/trolley', MORGAN);
        await h.spotlight(h.page.locator('[data-testid="trolley-row"][data-ref="REV-09"]'), 2500);
        await h.click(h.page.locator('[data-testid="trolley-row"][data-ref="REV-09"]').getByRole('button', { name: 'Query' }));
        await h.type(h.page.getByRole('dialog').getByLabel('Query for the client'), 'Please add the specific provisions over 20,000.');
        await h.click(h.page.getByRole('dialog').getByRole('button', { name: 'Send the query' }));
        await h.pause(1500);
      },
    },
    {
      id: 'clip',
      say: ['Back in the catalogue, the card wears its paper clip until the client answers.'],
      async run(h) {
        await h.goto('/', MORGAN);
        await h.click(h.page.getByRole('radio', { name: 'All', exact: true }));
        await h.type(h.page.getByLabel('Find a card'), 'REV-09');
        await h.page.keyboard.press('Enter');
        await h.pause(3500);
      },
    },
    {
      id: 'slip',
      say: ['On a new request slip, the room shows what was already asked, so the same reconciliation is not requested twice.'],
      async run(h) {
        await h.goto('/slip', MORGAN);
        await h.select(h.page.getByLabel('Audit area'), 'Cash');
        await h.type(h.page.getByLabel('Title'), 'bank reconciliation');
        await h.spotlight(h.page.getByTestId('similar-item').filter({ visible: true }).first(), 3000);
      },
    },
    {
      id: 'shelf',
      say: ['The shelf list is the pack for the weekly audit meeting: progress and ageing by area, as a CSV or on paper.'],
      async run(h) {
        await h.goto('/shelf', DANA);
        await h.spotlight(h.page.getByTestId('shelf-areas'), 3500);
      },
    },
    {
      id: 'takeaway',
      say: ['One room for both sides, and every request where everyone can see it.'],
      async run(h) {
        await h.goto('/', DANA);
        await h.pause(3500);
      },
    },
  ],
};
