// This structural type keeps the database contract independent from the Admin
// SDK until the first server command is implemented. Firestore Timestamp values
// satisfy this shape.
export interface FirestoreTimestamp {
  seconds: number;
  nanoseconds: number;
}

export type ClassStatus = "active" | "archived";
export type MemberAccessStatus = "pending" | "active" | "blocked" | "withdrawn";
export type GradeBand = "lower" | "middle" | "upper";
export type RoundStatus =
  | "draft"
  | "ready"
  | "active"
  | "paused"
  | "reveal_pending"
  | "revealed"
  | "archived"
  | "cancelled";

export interface TeacherDocument {
  displayName: string;
  verificationStatus: "pending" | "verified" | "suspended";
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
}

export interface ClassDocument {
  name: string;
  schoolYear: number;
  gradeBand: GradeBand;
  ownerUid: string;
  teacherUids: string[];
  status: ClassStatus;
  activeRoundId: string | null;
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
}

export interface MemberDocument {
  displayName: string;
  displayNameSortKey: string;
  accessStatus: MemberAccessStatus;
  sessionVersion: number;
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
}

export interface RoundDocument {
  title: string;
  status: RoundStatus;
  rosterVersion: number;
  startsAt: FirestoreTimestamp | null;
  endsAt: FirestoreTimestamp | null;
  revealedAt: FirestoreTimestamp | null;
  allowFreeTextMessages: boolean;
  sourceRoundId: string | null;
  createdBy: string;
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
}

export interface RoundParticipantDocument {
  participationStatus: "active" | "stopped";
  displayNameSnapshot: string;
  stoppedAt: FirestoreTimestamp | null;
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
}

export interface AssignmentSecretDocument {
  giverUid: string;
  receiverUid: string;
  rosterVersion: number;
  createdAt: FirestoreTimestamp;
}

export interface StudentRoundViewDocument {
  createdAt: FirestoreTimestamp;
  targetDisplayName?: string | null;
  incomingDisplayName?: string | null;
  revealedAt?: FirestoreTimestamp;
}

export interface MissionInstanceDocument {
  catalogMissionId: string;
  titleSnapshot: string;
  bodySnapshot: string;
  scheduledFor: string;
  status: "available" | "completed" | "skipped" | "replaced";
  replacementCount: number;
  requestId: string | null;
  updatedAt: FirestoreTimestamp;
}

export interface MessageSecretDocument {
  senderUid: string;
  receiverUid: string;
  kind: "encouragement" | "thank_you";
  body: string;
  inputMode: "preset" | "free_text";
  reviewStatus: "not_required" | "pending" | "approved" | "rejected" | "cancelled";
  requestId: string;
  createdAt: FirestoreTimestamp;
  reviewedAt: FirestoreTimestamp | null;
  reviewedBy: string | null;
}

export interface HelpRequestDocument {
  category: "uncomfortable_message" | "activity_difficulty" | "talk_privately";
  relatedMessageId: string | null;
  status: "open" | "acknowledged" | "resolved";
  createdAt: FirestoreTimestamp;
  resolvedAt: FirestoreTimestamp | null;
  resolvedBy: string | null;
}

export interface StudentCredentialDocument {
  classId: string;
  studentUid: string;
  lookupDigest: string;
  secretHash: string;
  secretSalt: string;
  codeVersion: number;
  failedAttempts: number;
  lockedUntil: FirestoreTimestamp | null;
  sessionVersion: number;
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
}
