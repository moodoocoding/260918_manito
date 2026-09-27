import { HttpsError, onCall } from "firebase-functions/v2/https";
import { assertClassTeacher, requireVerifiedTeacher } from "../shared/authorization.js";
import { requireFreshAppCheck } from "../shared/appCheck.js";
import { callableOptions } from "../shared/callableOptions.js";
import { db } from "../shared/firebase.js";
import { requireDocumentId, requireRecord } from "../shared/validation.js";

export const getClassAccessInfo = onCall(callableOptions, async (request) => {
  requireFreshAppCheck(request);
  const teacherUid = await requireVerifiedTeacher(request);
  const input = requireRecord(request.data);
  const classId = requireDocumentId(input.classId, "학급");
  const classSnapshot = await db.doc(`classes/${classId}`).get();
  assertClassTeacher(classSnapshot.data(), teacherUid);
  const codes = await db.collection("classCodes").where("classId", "==", classId).get();
  const activeCode = codes.docs.find((item) => item.get("status") === "active");
  if (!activeCode) throw new HttpsError("not-found", "학급 코드를 찾지 못했어요.");
  return {
    classId,
    classCode: activeCode.id,
    name: classSnapshot.get("name") as string,
    schoolYear: classSnapshot.get("schoolYear") as number,
    gradeBand: classSnapshot.get("gradeBand") as string,
    memberCount: classSnapshot.get("memberCount") as number,
  };
});

export const listClasses = onCall(callableOptions, async (request) => {
  requireFreshAppCheck(request);
  const teacherUid = await requireVerifiedTeacher(request);
  const classes = await db.collection("classes").where("teacherUids", "array-contains", teacherUid).get();
  return { classes: classes.docs.filter((item) => item.get("status") === "active").map((item) => ({
    classId: item.id,
    name: item.get("name") as string,
    schoolYear: item.get("schoolYear") as number,
    gradeBand: item.get("gradeBand") as string,
    memberCount: item.get("memberCount") as number,
  })) };
});
