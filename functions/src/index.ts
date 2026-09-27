import { setGlobalOptions } from "firebase-functions/v2";

setGlobalOptions({
  region: "asia-northeast3",
  maxInstances: 10,
  concurrency: 40,
  memory: "256MiB",
  timeoutSeconds: 60,
});

export { createClass } from "./classes/createClass.js";
export { registerStudents } from "./classes/registerStudents.js";
export { loginStudent } from "./students/loginStudent.js";
export { rotateStudentCredential } from "./students/rotateStudentCredential.js";
export { getTeacherStatus } from "./teachers/getTeacherStatus.js";
export { getClassAccessInfo, listClasses } from "./classes/getClassAccessInfo.js";
export { getStudentHome } from "./students/getStudentHome.js";
export { setStudentAccess } from "./students/setStudentAccess.js";
export { deleteClassData } from "./classes/deleteClassData.js";
export { listRounds, getRoundSettingsForTeacher, createRound, updateRound, prepareRound, startRound,
  changeRoundStatus, getAssignmentsForTeacher } from "./rounds/flow.js";
export { getMissionCatalog, setMissionStatus, replaceMission } from "./rounds/missions.js";
export { getStudentActivity, sendMessage, reviewMessage, hideMessage,
  createHelpRequest, resolveHelpRequest, getTeacherRoundOverview } from "./rounds/activity.js";
export { stopRoundParticipation, revealRound, sendThankYou,
  saveReflection, copyRoundSettings } from "./rounds/reveal.js";
