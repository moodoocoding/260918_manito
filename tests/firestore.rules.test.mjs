import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { readFile } from "node:fs/promises";

const projectId = "demo-manitto";
let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: await readFile("firestore.rules", "utf8"),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "teachers/teacher-a"), { verificationStatus: "verified" });
    await setDoc(doc(db, "teachers/teacher-b"), { verificationStatus: "verified" });
    await setDoc(doc(db, "classes/class-a"), {
      status: "active",
      teacherUids: ["teacher-a"],
      activeRoundId: "round-a",
    });
    await setDoc(doc(db, "classes/class-a/members/student-a"), {
      displayName: "가람",
      accessStatus: "active",
      sessionVersion: 1,
    });
    await setDoc(doc(db, "classes/class-a/members/student-b"), {
      displayName: "나래",
      accessStatus: "active",
      sessionVersion: 1,
    });
    await setDoc(doc(db, "classes/class-a/rounds/round-a"), {
      status: "active",
      title: "첫 번째 작전",
    });
    await setDoc(doc(db, "classes/class-a/rounds/round-a/participants/student-a"), {
      participationStatus: "active",
    });
    await setDoc(doc(db, "classes/class-a/rounds/round-a/participants/student-b"), {
      participationStatus: "active",
    });
    await setDoc(doc(db, "classes/class-a/rounds/round-a/studentData/student-a"), {
      targetDisplayName: "나래",
    });
    await setDoc(doc(db, "classes/class-a/rounds/round-a/studentData/student-b"), {
      targetDisplayName: "가람",
    });
    await setDoc(doc(db, "classes/class-a/rounds/round-a/assignmentSecrets/student-a"), {
      giverUid: "student-a",
      receiverUid: "student-b",
    });
    await setDoc(doc(db, "studentCredentials/student-a"), {
      classId: "class-a",
      studentUid: "student-a",
      secretHash: "never-visible",
    });
    await setDoc(doc(db, "classCodes/ABCDEFGH"), {
      classId: "class-a",
      status: "active",
    });
  });
});

after(async () => {
  await testEnv.cleanup();
});

function teacherDb(uid) {
  return testEnv.authenticatedContext(uid, { role: "teacher", teacherVerified: true }).firestore();
}

function studentDb(uid, classId = "class-a", sessionVersion = 1) {
  return testEnv.authenticatedContext(uid, {
    role: "student",
    classId,
    memberId: uid,
    sessionVersion,
  }).firestore();
}

test("signed-out users cannot read a class", async () => {
  const db = testEnv.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, "classes/class-a")));
});

test("the assigned teacher can read the class and its student data", async () => {
  const db = teacherDb("teacher-a");
  await assertSucceeds(getDoc(doc(db, "classes/class-a")));
  await assertSucceeds(
    getDoc(doc(db, "classes/class-a/rounds/round-a/studentData/student-a")),
  );
});

test("a teacher from another class cannot read the class", async () => {
  const db = teacherDb("teacher-b");
  await assertFails(getDoc(doc(db, "classes/class-a")));
});

test("suspended and unverified teachers cannot read student data", async () => {
  const unverified = testEnv.authenticatedContext("teacher-a", { role: "teacher" }).firestore();
  await assertFails(getDoc(doc(unverified, "classes/class-a")));
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "teachers/teacher-a"), { verificationStatus: "suspended" });
  });
  await assertFails(getDoc(doc(teacherDb("teacher-a"), "classes/class-a/members/student-a")));
});

test("a student can read only their own round view", async () => {
  const db = studentDb("student-a");
  await assertSucceeds(
    getDoc(doc(db, "classes/class-a/rounds/round-a/studentData/student-a")),
  );
  await assertFails(
    getDoc(doc(db, "classes/class-a/rounds/round-a/studentData/student-b")),
  );
});

test("an outdated student session cannot read student data", async () => {
  const db = studentDb("student-a", "class-a", 0);
  await assertFails(
    getDoc(doc(db, "classes/class-a/rounds/round-a/studentData/student-a")),
  );
});

test("relationship secrets are denied even to a classroom teacher", async () => {
  const db = teacherDb("teacher-a");
  await assertFails(
    getDoc(doc(db, "classes/class-a/rounds/round-a/assignmentSecrets/student-a")),
  );
});

test("login credentials and class-code lookups are server-only", async () => {
  const db = teacherDb("teacher-a");
  await assertFails(getDoc(doc(db, "studentCredentials/student-a")));
  await assertFails(getDoc(doc(db, "classCodes/ABCDEFGH")));
});

test("browser clients cannot write application documents", async () => {
  const db = studentDb("student-a");
  await assertFails(
    setDoc(doc(db, "classes/class-a/rounds/round-a/studentData/student-a/helpRequests/help-a"), {
      category: "talk_privately",
    }),
  );
  assert.ok(true);
});
