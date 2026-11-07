import type { TrainingReport } from '../types';

export interface LogBackupContext {
  dog: { id: string; name: string };
  location: { id: string | null; name: string } | null;
  skills: { id: string; title: string }[];
  milestones: { id: string; title: string }[];
  distractions: { id: string; title: string }[];
}

// Deliberate allowlist: never serialize the account, database, session or outbox.
export function logBackup(report: TrainingReport, context: LogBackupContext, pictureFile: { name: string; type: string; dataUrl: string } | null) {
  return {
    format: 'training-tracker-log-backup', version: 1,
    capturedAt: new Date().toISOString(),
    purpose: 'Current form backup, not confirmation of device storage or server sync. No automatic import is provided.',
    report: {
      id: report.id, dogId: report.dogId, authorInstructorId: report.authorInstructorId,
      createdDate: report.createdDate, updatedDate: report.updatedDate,
      sessionDate: report.sessionDate, phase: report.phase, redFlag: report.redFlag,
      visibility: report.visibility, locationId: report.locationId, notes: report.notes,
      picture: report.picture, skillIds: [...report.skillIds], milestoneIds: [...report.milestoneIds],
      distractions: report.distractions.map(({ distractionId, severity }) => ({ distractionId, severity })),
    },
    references: {
      dog: { id: context.dog.id, name: context.dog.name },
      location: context.location && { id: context.location.id, name: context.location.name },
      skills: context.skills.filter(x => report.skillIds.includes(x.id)).map(({ id, title }) => ({ id, title })),
      milestones: context.milestones.filter(x => report.milestoneIds.includes(x.id)).map(({ id, title }) => ({ id, title })),
      distractions: context.distractions.filter(x => report.distractions.some(d => d.distractionId === x.id)).map(({ id, title }) => ({ id, title })),
    },
    pictureFile,
  };
}

export function readBackupPicture(file: File): Promise<{ name: string; type: string; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the selected picture.'));
    reader.onabort = () => reject(new Error('Picture reading was cancelled.'));
    reader.onload = () => typeof reader.result === 'string'
      ? resolve({ name: file.name, type: file.type, dataUrl: reader.result })
      : reject(new Error('Could not read the selected picture.'));
    reader.readAsDataURL(file);
  });
}

export function downloadLogBackup(backup: ReturnType<typeof logBackup>) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  try {
    link.href = url;
    link.download = `training-log-${backup.report.id.replace(/[^a-zA-Z0-9-]/g, '_')}.json`;
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    // Give the browser time to consume the URL; this does not confirm a saved file.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
