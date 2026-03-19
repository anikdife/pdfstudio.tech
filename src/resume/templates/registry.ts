export type ResumeTypeId = 'modern-dark' | 'ats' | 'executive' | 'creative';

export type ResumeTemplateStatus = 'implemented' | 'coming-soon';

export type ResumeTemplateCard = {
  id: string;
  title: string;
  subtitle?: string;
  status: ResumeTemplateStatus;
};

export function getResumeTypeLabel(type: ResumeTypeId): string {
  switch (type) {
    case 'modern-dark':
      return 'Modern Dark Resume';
    case 'ats':
      return 'ATS Clean Resume';
    case 'executive':
      return 'Executive Resume';
    case 'creative':
      return 'Creative Resume';
    default:
      return 'Resume';
  }
}

export function getResumeTemplatesByType(type: ResumeTypeId): ResumeTemplateCard[] {
  if (type === 'modern-dark') {
    return [
      {
        id: 'glassy-dark-v1',
        title: 'Glassy Dark Resume',
        subtitle: 'Implemented',
        status: 'implemented',
      },
      {
        id: 'coming-soon-1',
        title: 'Coming soon',
        status: 'coming-soon',
      },
      {
        id: 'coming-soon-2',
        title: 'Coming soon',
        status: 'coming-soon',
      },
    ];
  }

  return [];
}
