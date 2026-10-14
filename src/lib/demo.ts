import { DEPT_PERSON } from './constants';
import { addDays, iso, monday, toDate } from './dates';
import { blankItem } from './planning';
import type { AppData, Item, JiraIssue, Member, Settings } from './types';

export const DEFAULT_SETTINGS: Settings = {
  site: 'zibber.atlassian.net',
  projects: 'MKT',
  jql: 'project = MKT AND issuetype = Intake ORDER BY created DESC',
  interval: 5,
  auto: true,
  demoSim: true,
};

/** Voorbeeldteam en -werk, relatief aan vandaag zodat de demo altijd actueel oogt. */
export function buildDemo(): { members: Member[]; items: Item[]; projects: string[] } {
  const t = new Date();
  const m0 = monday(t);
  const W = (n: number) => iso(addDays(m0, 7 * n));
  const D = (n: number) => iso(addDays(t, n));

  const members: Member[] = [
    { id: 'm-vera', name: 'Vera Groen', role: 'Content marketeer', color: '#2E9C8F', initials: 'VG', hours: 24, workdays: [1, 2, 4], type: 'intern', vacations: [], archived: false },
    { id: 'm-eva', name: 'Eva Velers', role: 'Online marketeer', color: '#4F6FD8', initials: 'EV', hours: 32, workdays: [1, 2, 3, 4], type: 'intern', vacations: [{ from: W(3), to: iso(addDays(toDate(W(3)), 4)), label: 'Herfstvakantie' }], archived: false },
    { id: 'm-wouter', name: 'Wouter Priest', role: 'Head of Marketing', color: '#C27A3A', initials: 'WP', hours: 20, workdays: [1, 2, 3, 4, 5], type: 'intern', vacations: [], archived: false },
  ];

  const J = (key: string, title: string, project: string, o: Partial<Item>): Item => ({
    ...blankItem(), id: 'd-' + key, source: 'jira', key, title, project, epic: project, type: 'Task', jiraStatus: 'To Do', demo: true, ...o,
  });
  const M = (id: string, title: string, project: string, o: Partial<Item>): Item => ({
    ...blankItem(), id: 'd-' + id, source: 'manual', title, project, demo: true, requesterName: DEPT_PERSON[o.requester || ''] || '', ...o,
  });

  const items: Item[] = [
    J('MKT-214', 'Landingspagina Zibber Flex BE', 'Zibber Flex lancering', { type: 'Story', jiraStatus: 'In Progress', status: 'Bezig', priority: 'Hoog', assignee: 'm-eva', reporter: 'Wouter Priest', created: D(-12), due: D(10), estimate: 16, market: 'BE', channel: 'website', requester: 'Sales', labels: ['BE', 'website'], components: ['Sales'], allocations: [{ m: 'm-eva', w: W(0), h: 8 }, { m: 'm-eva', w: W(1), h: 8 }] }),
    J('MKT-219', 'LinkedIn-campagne makelaars DE', 'Makelaarscampagne DE', { priority: 'Hoog', reporter: 'Jonas Becker', created: D(-2), due: D(18), estimate: 12, market: 'DE', channel: 'LinkedIn', requester: 'Sales', labels: ['DE', 'LinkedIn'], components: ['Sales'], isNew: true }),
    J('MKT-221', 'Brochure update pakketten', 'Merk & content', { reporter: 'Sanne de Wit', created: D(-9), due: D(25), estimate: 10, market: 'Alle', channel: 'content', requester: 'Sales', labels: ['content'], components: ['Sales'], assignee: 'm-vera', allocations: [{ m: 'm-vera', w: W(1), h: 6 }] }),
    J('MKT-223', 'Persbericht Zibber Flex NL', 'Zibber Flex lancering', { reporter: 'Wouter Priest', created: D(-6), due: D(7), estimate: 4, market: 'NL', channel: 'content', requester: 'Directie', labels: ['NL', 'content'], components: ['Directie'] }),
    J('MKT-208', "SEO-audit woningpagina's NL", 'Website', { jiraStatus: 'In Progress', status: 'Bezig', assignee: 'm-vera', reporter: 'Eva Velers', created: D(-20), due: D(9), estimate: 14, market: 'NL', channel: 'SEO', requester: 'Marketing', labels: ['NL', 'SEO'], allocations: [{ m: 'm-vera', w: W(0), h: 6 }, { m: 'm-vera', w: W(2), h: 8 }] }),
    J('MKT-225', 'Intake: banner Vastgoeddag Utrecht', 'Events Q4', { type: 'Intake', priority: 'Hoog', reporter: 'Lotte Janssen', created: D(-1), due: D(12), estimate: null, market: 'NL', channel: 'events', requester: 'Customer Relations', labels: ['NL', 'events'], components: ['Customer Relations'], isNew: true }),
    J('MKT-226', 'Intake: salesdeck makelaars BE', 'Sales-support', { type: 'Intake', reporter: 'Pieter Claes', created: D(-1), due: D(16), estimate: 6, market: 'BE', channel: 'sales-support', requester: 'Sales', labels: ['BE', 'sales-support'], components: ['Sales'], isNew: true }),
    J('MKT-201', 'Case study Makelaardij Van Dijk', 'Merk & content', { jiraStatus: 'Done', status: 'Klaar', jiraClosed: true, assignee: 'm-eva', reporter: 'Vera Groen', created: D(-30), due: D(3), estimate: 8, market: 'NL', channel: 'content', requester: 'Customer Relations', allocations: [{ m: 'm-eva', w: W(0), h: 4 }, { m: 'm-eva', w: W(1), h: 4 }] }),
    J('MKT-217', 'E-mailflow onboarding Zibber Flex', 'Zibber Flex lancering', { type: 'Story', jiraStatus: 'In Review', status: 'Review', assignee: 'm-eva', reporter: 'Wouter Priest', created: D(-15), due: D(5), estimate: 12, market: 'NL', channel: 'e-mail', requester: 'Product', allocations: [{ m: 'm-eva', w: W(0), h: 12 }] }),
    J('MKT-228', 'Intake: advertentie Vastgoedmarkt magazine DE', 'Makelaarscampagne DE', { type: 'Intake', priority: 'Laag', reporter: 'Jonas Becker', created: D(0), due: D(30), estimate: 5, market: 'DE', channel: 'content', requester: 'Sales', isNew: true }),
    J('MKT-210', "Webinar 'Data in de makelaardij'", 'Events Q4', { jiraStatus: 'In Progress', status: 'Bezig', assignee: 'm-vera', reporter: 'Wouter Priest', created: D(-25), due: D(28), estimate: 24, market: 'NL', channel: 'events', requester: 'Marketing', allocations: [{ m: 'm-vera', w: W(0), h: 8 }, { m: 'm-wouter', w: W(1), h: 4 }, { m: 'm-vera', w: W(2), h: 8 }] }),
    J('MKT-230', "Vertaling productpagina's DE", 'Website', { reporter: 'Eva Velers', created: D(-4), due: D(21), estimate: 8, market: 'DE', channel: 'website', requester: 'Product' }),
    M('m1', 'Nieuwsbrief november NL', 'Nieuwsbrieven', { assignee: 'm-vera', due: D(14), estimate: 8, market: 'NL', channel: 'e-mail', requester: 'Marketing', status: 'Bezig', created: D(-7), allocations: [{ m: 'm-vera', w: W(0), h: 4 }, { m: 'm-vera', w: W(1), h: 4 }] }),
    M('m2', 'Nieuwsbrief november BE', 'Nieuwsbrieven', { due: D(16), estimate: 6, market: 'BE', channel: 'e-mail', requester: 'Marketing', created: D(-7) }),
    M('m3', 'Maandrapportage marketing', 'Rapportage', { assignee: 'm-wouter', estimate: 4, market: 'Alle', channel: 'content', requester: 'Directie', recurring: 'maandelijks', created: D(-60) }),
    M('m4', 'Social media-planning', 'Merk & content', { assignee: 'm-vera', estimate: 2, market: 'Alle', channel: 'LinkedIn', requester: 'Marketing', recurring: 'wekelijks', created: D(-60) }),
    M('m5', 'Contentkalender december LinkedIn', 'Merk & content', { assignee: 'm-vera', due: D(8), estimate: 6, market: 'Alle', channel: 'LinkedIn', requester: 'Marketing', created: D(-3), allocations: [{ m: 'm-vera', w: W(0), h: 6 }] }),
    M('m6', 'Standbouw Vastgoeddag Utrecht', 'Events Q4', { assignee: 'm-wouter', due: D(20), estimate: 10, market: 'NL', channel: 'events', requester: 'Customer Relations', created: D(-10), allocations: [{ m: 'm-wouter', w: W(2), h: 6 }, { m: 'm-wouter', w: W(3), h: 4 }] }),
    M('m7', 'Klantverhalen video', 'Merk & content', { priority: 'Laag', due: D(45), estimate: 12, market: 'NL', channel: 'content', requester: 'Customer Relations', created: D(-5) }),
    M('m8', 'Kwartaalplan Q1 2027', 'Rapportage', { assignee: 'm-wouter', priority: 'Hoog', due: D(40), estimate: 8, market: 'Alle', channel: 'content', requester: 'Directie', created: D(-8), allocations: [{ m: 'm-wouter', w: W(4), h: 8 }] }),
    M('m9', 'Google Ads-campagne Zibber Flex NL', 'Zibber Flex lancering', { assignee: 'm-eva', due: D(19), estimate: 6, market: 'NL', channel: 'website', requester: 'Sales', created: D(-6), allocations: [{ m: 'm-eva', w: W(2), h: 6 }] }),
  ];

  return {
    members,
    items,
    projects: ['Zibber Flex lancering', 'Makelaarscampagne DE', 'Merk & content', 'Website', 'Events Q4', 'Sales-support', 'Nieuwsbrieven', 'Rapportage'],
  };
}

export function freshData(): AppData {
  const d = buildDemo();
  return { ...d, settings: { ...DEFAULT_SETTINGS }, syncIdx: 0, lastSync: new Date().toISOString() };
}

/** Tickets die de gesimuleerde Jira-koppeling één voor één "binnen laat komen". */
export function demoPool(): { issue: JiraIssue; close?: string }[] {
  const t = new Date();
  const D = (n: number) => iso(addDays(t, n));
  return [
    { issue: { key: 'MKT-231', summary: 'Intake: mailing nieuwe klanten BE', issueType: 'Intake', status: 'To Do', priority: 'High', reporter: 'Pieter Claes', created: D(0), due: D(9), estimate: 5, labels: ['BE', 'e-mail'], components: ['Sales'], epic: 'Nieuwsbrieven' } },
    { issue: { key: 'MKT-232', summary: 'Intake: one-pager API-koppeling makelaars', issueType: 'Intake', status: 'To Do', priority: 'Medium', reporter: 'Lotte Janssen', created: D(0), due: D(15), estimate: null, labels: ['NL', 'content'], components: ['Product'], epic: 'Merk & content' }, close: 'MKT-217' },
    { issue: { key: 'MKT-233', summary: 'Intake: LinkedIn-posts Zibber Flex DE', issueType: 'Intake', status: 'To Do', priority: 'Medium', reporter: 'Jonas Becker', created: D(0), due: D(13), estimate: 3, labels: ['DE', 'LinkedIn'], components: ['Sales'], epic: 'Zibber Flex lancering' } },
  ];
}
