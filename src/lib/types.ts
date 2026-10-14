export type Priority = 'Hoog' | 'Normaal' | 'Laag';
export type Status = 'To do' | 'Bezig' | 'Review' | 'Klaar';
export type Recurring = '' | 'wekelijks' | 'maandelijks';
export type Source = 'jira' | 'manual';
export type View = 'inbox' | 'week' | 'quarter' | 'team';
export type SortKey = 'prio' | 'due' | 'created';

/** Uren van één teamlid in één week (w = ISO-datum van de maandag). */
export interface Allocation {
  m: string;
  w: string;
  h: number;
}

export interface Item {
  id: string;
  source: Source;
  key: string;
  project: string;
  title: string;
  type: string;
  status: Status;
  jiraStatus: string;
  priority: Priority;
  assignee: string | null;
  reporter: string;
  requester: string;
  requesterName: string;
  created: string;
  start: string;
  due: string;
  estimate: number | null;
  /** Laatst bekende schatting in Jira. Zo zien we of de uren in de tool zijn aangepast. */
  jiraEstimate?: number | null;
  labels: string[];
  components: string[];
  epic: string;
  market: string;
  channel: string;
  note: string;
  recurring: Recurring;
  isNew: boolean;
  jiraClosed: boolean;
  allocations: Allocation[];
  demo: boolean;
}

export interface Vacation {
  from: string;
  to: string;
  label: string;
}

export interface Member {
  id: string;
  name: string;
  role: string;
  color: string;
  initials: string;
  hours: number;
  /** 1 = maandag … 7 = zondag */
  workdays: number[];
  type: 'intern' | 'extern';
  vacations: Vacation[];
  archived: boolean;
}

export interface Settings {
  site: string;
  projects: string;
  jql: string;
  interval: number;
  auto: boolean;
  demoSim: boolean;
}

export interface AppData {
  members: Member[];
  items: Item[];
  projects: string[];
  settings: Settings;
  syncIdx: number;
  lastSync: string;
}

export interface JiraIssue {
  key: string;
  summary: string;
  issueType: string;
  status: string;
  /** Statuscategorie uit Jira: 'new', 'indeterminate' of 'done'. Betrouwbaarder dan de (vertaalde) statusnaam. */
  statusCategory?: string;
  priority: string;
  assignee?: string;
  reporter: string;
  created: string;
  due: string;
  estimate: number | null;
  labels: string[];
  components: string[];
  epic: string;
}

export interface Filters {
  source: string;
  project: string;
  channel: string;
  market: string;
  requester: string;
}

export interface DragInfo {
  id: string;
  from: { m: string; w: string } | null;
}
