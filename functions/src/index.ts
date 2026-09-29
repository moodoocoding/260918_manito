import { setGlobalOptions } from "firebase-functions/v2";

setGlobalOptions({
  region: "asia-northeast3",
  maxInstances: 10,
  concurrency: 40,
  memory: "256MiB",
  timeoutSeconds: 60,
});

export { createClass, updateClassInfo } from "./classes/createClass.js";
export { registerStudents } from "./classes/registerStudents.js";
export { getPrintableCards, reissueMissingCards } from "./classes/printStudentCards.js";
export { loginStudent } from "./students/loginStudent.js";
export { rotateStudentCredential } from "./students/rotateStudentCredential.js";
export { getTeacherStatus } from "./teachers/getTeacherStatus.js";
export { getClassAccessInfo, listClasses } from "./classes/getClassAccessInfo.js";
export { getStudentHome, listStudentRounds } from "./students/getStudentHome.js";
export { setStudentAccess, updateStudentName, removeStudentMember } from "./students/setStudentAccess.js";
export { deleteClassData } from "./classes/deleteClassData.js";
export { createRightsRequest, listMyRightsRequests, getRightsRequestsForTeacher } from "./classes/rightsRequests.js";
export { listRounds, getRoundSettingsForTeacher, createRound, updateRound, prepareRound, startRound,
  changeRoundStatus, extendRound, getAssignmentsForTeacher, deleteRound } from "./rounds/flow.js";
export { getMissionCatalog, createCustomMission, updateCustomMission, deleteCustomMission, setMissionStatus, setStudentMissionFocus, replaceMission } from "./rounds/missions.js";
export { getStudentCommunity, getTeacherCommunity, updateRoundCommunity } from "./rounds/community.js";
export { getStudentActivity, sendMessage, reviewMessage, hideMessage, reactToMessage,
  createHelpRequest, resolveHelpRequest, getTeacherRoundOverview, getMessageForReview,
  listTeacherMessages, moderateMessage } from "./rounds/activity.js";
export {getTeacherStudentStatus, getTeacherStudentDetail} from "./rounds/teacherStudentStatus.js";
export { stopRoundParticipation, revealRound, sendThankYou,
  saveReflection, copyRoundSettings, getRoundReflectionsForTeacher } from "./rounds/reveal.js";
