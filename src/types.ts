import { Timestamp } from "firebase/firestore";

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: 'professor' | 'admin' | 'pending';
  isBlocked: boolean;
  createdAt: Timestamp;
}

export interface LabRoom {
  id: string;
  roomNumber: string;
  description?: string;
}

export interface UsageLog {
  id: string;
  professorId: string;
  professorName: string;
  professorEmail: string;
  roomNumber: string;
  campus: string;
  college: string;
  program: string;
  year: string;
  section: string;
  estimatedDuration?: number;
  startTime: Timestamp;
  endTime?: Timestamp;
  durationMinutes?: number;
  autoEnded?: boolean;
}

export interface PreAuthorizedUser {
  email: string;
  role: 'professor' | 'admin';
  addedAt: Timestamp;
}
