import { HttpsError, onCall } from "firebase-functions/v2/https";
import { db } from "../shared/firebase.js";
import { requireActiveStudent } from "../shared/student.js";

export const getStudentHome = onCall( async (request) => {
  const uid = request.auth?.uid;
  const token = request.auth?.token;
  if (!uid || token?.role !== "student" || token.memberId !== uid || typeof token.classId !== "string") {
    throw new HttpsError("permission-denied", "학생 계정을 확인해 주세요.");
  }
  const classId = token.classId;
  const [classSnapshot, memberSnapshot] = await Promise.all([
    db.doc(`classes/${classId}`).get(),
    db.doc(`classes/${classId}/members/${uid}`).get(),
  ]);
  if (
    !classSnapshot.exists || classSnapshot.get("status") !== "active"
    || !memberSnapshot.exists || memberSnapshot.get("accessStatus") !== "active"
    || memberSnapshot.get("sessionVersion") !== token.sessionVersion
  ) throw new HttpsError("permission-denied", "입장 카드가 변경되었어요. 선생님께 확인해 주세요.");

  const roundId = classSnapshot.get("activeRoundId") ?? classSnapshot.get("lastRoundId");
  const gradeBand = classSnapshot.get("gradeBand") as string;
  if (typeof roundId !== "string") {
    return { displayName: memberSnapshot.get("displayName") as string,
      className: classSnapshot.get("name") as string, gradeBand, round: null };
  }
  const [round, participation, view] = await Promise.all([
    db.doc(`classes/${classId}/rounds/${roundId}`).get(),
    db.doc(`classes/${classId}/rounds/${roundId}/participants/${uid}`).get(),
    db.doc(`classes/${classId}/rounds/${roundId}/studentData/${uid}`).get(),
  ]);
  if (!round.exists || !participation.exists || participation.get("participationStatus") !== "active"
    || (classSnapshot.get("activeRoundId") !== roundId
      && !["revealed", "archived"].includes(round.get("status")))) {
    return { displayName: memberSnapshot.get("displayName") as string,
      className: classSnapshot.get("name") as string, gradeBand, round: null };
  }
  const roundStatus = round.get("status") as string;
  return {
    displayName: memberSnapshot.get("displayName") as string,
    className: classSnapshot.get("name") as string,
    gradeBand,
    round: {
      title: round.get("title") as string,
      status: roundStatus,
      targetDisplayName: ["active", "paused", "reveal_pending", "revealed"].includes(roundStatus) && view.exists
        ? (view.get("targetDisplayName") as string | null) : null,
      incomingDisplayName: roundStatus === "revealed" && view.exists
        ? (view.get("incomingDisplayName") as string | null) : null,
      roundId,
    },
  };
});

export const listStudentRounds = onCall(async (request) => {
  const student = await requireActiveStudent(request);
  const rounds = await student.classRef.collection("rounds").get();
  const completed = rounds.docs.filter((doc) => ["revealed", "archived"].includes(doc.get("status")));
  const own = await Promise.all(completed.map(async (round) => ({
    round, participant: await round.ref.collection("participants").doc(student.uid).get(),
  })));
  return { rounds: own.filter(({participant}) => participant.exists
    && participant.get("participationStatus") === "active")
    .map(({round}) => ({roundId: round.id, title: round.get("title") as string,
      status: round.get("status") as string,
      startsAt: round.get("startsAt")?.toDate()?.toISOString() as string}))
    .sort((a,b) => b.startsAt.localeCompare(a.startsAt)) };
});
