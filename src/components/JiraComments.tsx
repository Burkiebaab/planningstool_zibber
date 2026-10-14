import { useEffect, useState } from 'react';
import { fmt, hhmm } from '../lib/dates';
import { fetchComments, postComment } from '../lib/jiraLive';
import type { JiraComment } from '../lib/types';
import { LinkedText } from './ui';

const when = (s: string) => {
  const d = new Date(s);
  return isNaN(d.getTime()) ? '' : fmt(d) + ', ' + hhmm(d);
};

/** Opmerkingen van een Jira-ticket: de laatste uit Jira, en zelf een opmerking plaatsen. */
export function JiraComments({ issueKey }: { issueKey: string }) {
  const [comments, setComments] = useState<JiraComment[] | null>(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let live = true;
    void fetchComments(issueKey).then((r) => {
      if (!live) return;
      if (r.ok) setComments(r.comments);
      else setError(r.message);
    });
    return () => {
      live = false;
    };
  }, [issueKey]);

  const post = async () => {
    setPosting(true);
    setError('');
    const r = await postComment(issueKey, draft);
    setPosting(false);
    if (!r.ok) return setError('Niet geplaatst: ' + r.message);
    setComments((c) => [r.comment, ...(c || [])]);
    setDraft('');
  };

  const shown = comments ? (showAll ? comments : comments.slice(0, 3)) : [];

  return (
    <div className="panel-section">
      <span className="panel-h">Opmerkingen in Jira</span>
      <div className="comment-new">
        <textarea
          className="input textarea"
          rows={2}
          placeholder={`Opmerking plaatsen bij ${issueKey}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="button" className="btn btn-md btn-primary" disabled={posting || !draft.trim()} onClick={post}>
          {posting ? 'Plaatsen…' : 'Plaatsen in Jira'}
        </button>
      </div>
      {error && <span className="field-error">{error}</span>}
      {comments === null && !error && <span className="muted" style={{ fontSize: 13 }}>Opmerkingen laden…</span>}
      {comments?.length === 0 && <span className="muted" style={{ fontSize: 13 }}>Nog geen opmerkingen in Jira.</span>}
      {shown.map((c) => (
        <div key={c.id} className="comment">
          <div className="comment-head">
            <strong>{c.author}</strong>
            <span>{when(c.created)}</span>
          </div>
          <LinkedText text={c.text} className="comment-text" />
        </div>
      ))}
      {comments && comments.length > 3 && (
        <button type="button" className="link-btn" style={{ alignSelf: 'flex-start', padding: 0 }} onClick={() => setShowAll(!showAll)}>
          {showAll ? 'Minder tonen' : `Alle ${comments.length} opmerkingen tonen`}
        </button>
      )}
    </div>
  );
}
