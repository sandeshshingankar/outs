export type NotificationItem = {
  id: string;
  title: string;
  body: string | null;
  isRead: boolean;
  readColumn: 'is_read' | 'read' | 'read_at';
  link: string | null;
  createdAt: string;
};

function getReadState(row: Record<string, unknown>) {
  if (typeof row.is_read === 'boolean') return { isRead: row.is_read, readColumn: 'is_read' as const };
  if (typeof row.read === 'boolean') return { isRead: row.read, readColumn: 'read' as const };
  if (Object.hasOwn(row, 'read_at')) return { isRead: row.read_at !== null, readColumn: 'read_at' as const };
  throw new Error('The notifications table must include is_read, read, or read_at to track unread status.');
}

export function normalizeNotifications(rows: Record<string, unknown>[]): NotificationItem[] {
  return rows.map((row) => {
    if (typeof row.id !== 'string' || typeof row.created_at !== 'string') {
      throw new Error('The notifications table must include id and created_at fields.');
    }
    const readState = getReadState(row);
    const title = typeof row.title === 'string' ? row.title : typeof row.type === 'string' ? row.type : null;
    if (!title) throw new Error('The notifications table must include a title or type field.');
    const body = typeof row.body === 'string' ? row.body : typeof row.message === 'string' ? row.message : null;
    const relatedTask = typeof row.task_id === 'string' ? `/tasks/${row.task_id}` : null;
    const linkValue = typeof row.link === 'string' ? row.link
      : typeof row.action_url === 'string' ? row.action_url
        : typeof row.href === 'string' ? row.href : relatedTask;
    return {
      id: row.id,
      title,
      body,
      ...readState,
      link: linkValue,
      createdAt: row.created_at,
    };
  });
}
