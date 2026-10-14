import { memberInitials } from '../lib/planning';
import type { Member } from '../lib/types';
import { Avatar } from './ui';

/** Uitvoerder: teamlid uit de tool, anders de assignee uit Jira, anders "Niet toegewezen". */
export function Assignee({ member, jiraName }: { member?: Member; jiraName?: string }) {
  if (member) {
    return (
      <span className="inbox-assignee">
        <Avatar color={member.color} initials={memberInitials(member)} size={24} fontSize={10} />
        <span className="ellipsis inbox-person-name">{member.name}</span>
      </span>
    );
  }
  if (jiraName) {
    return (
      <span className="inbox-person">
        <span className="ellipsis inbox-person-name">{jiraName}</span>
        <span className="ellipsis inbox-person-dept">in Jira</span>
      </span>
    );
  }
  return <span className="inbox-unassigned">Niet toegewezen</span>;
}
