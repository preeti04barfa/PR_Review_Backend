export interface ReviewPRJob {
  githubId: string;
  repo: string;
  pr: number;
}

export enum PRReviewStatus {
  PENDING = 'Pending',
  IN_PROGRESS = 'In Progress',
  COMPLETED = 'Completed',
  FAILED = 'Failed',
}