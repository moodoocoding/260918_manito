import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { readFile } from "node:fs/promises";

const projectId = "demo-manitto-balance-rules";
const firestorePort = Number(process.env.MANITTO_TEST_FIRESTORE_PORT ?? 8280);
let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({projectId, firestore:{host:"127.0.0.1",port:firestorePort,rules:await readFile(process.env.MANITTO_TEST_RULES_FILE ?? "firestore.rules","utf8")}});
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db=context.firestore();
    const write = (path,data) => setDoc(doc(db,path),data);
    await Promise.all([
      write("classes/c1",{status:"active",teacherUids:["t1"],activeRoundId:"r1"}),
      write("classes/c1/members/s1",{accessStatus:"active",sessionVersion:1}),
      write("classes/c1/members/s2",{accessStatus:"active",sessionVersion:1}),
      write("classes/c1/members/s3",{accessStatus:"active",sessionVersion:1}),
      write("classes/c1/balanceGamePublic/progress",{completedNames:["가상 가람"],completedCount:1,participantCount:2,state:"collecting"}),
      write("classes/c1/balanceGameSecrets/current",{state:"collecting",participantUids:["s1","s2"]}),
      write("classes/c1/balanceGameSecrets/current/submissions/s1",{choices:Array(10).fill("A")}),
      write("classes/c1/rounds/r1",{status:"active"}),
      write("classes/c1/rounds/r1/participants/s1",{participationStatus:"active"}),
      write("classes/c1/rounds/r1/participants/s2",{participationStatus:"active"}),
      write("classes/c1/rounds/r1/balanceGamePublic/progress",{completedNames:["가람"],completedCount:1,participantCount:2,state:"collecting"}),
      write("classes/c1/rounds/r1/balanceGameSecrets/current",{state:"collecting"}),
      write("classes/c1/rounds/r1/balanceGameSecrets/current/submissions/s1",{choices:Array(10).fill("A")}),
    ]);
  });
});

test("class balance progress needs an active card and locked membership without a Manitto round",async()=>{
  const path="classes/c1/balanceGamePublic/progress";
  await assertSucceeds(getDoc(doc(student("s1"),path)));
  await assertFails(getDoc(doc(student("s3"),path)));
  await assertFails(getDoc(doc(student("outside","other"),path)));
  const old=testEnv.authenticatedContext("s1",{role:"student",classId:"c1",memberId:"s1",sessionVersion:0}).firestore();
  await assertFails(getDoc(doc(old,path)));
  await assertFails(getDoc(doc(student("s1"),"classes/c1/balanceGameSecrets/current")));
  await assertFails(getDoc(doc(student("s1"),"classes/c1/balanceGameSecrets/current/submissions/s1")));
  await assertFails(setDoc(doc(student("s1"),path),{completedNames:["forged"]}));
  await testEnv.withSecurityRulesDisabled((context)=>setDoc(doc(context.firestore(),"classes/c1"),{status:"archived"},{merge:true}));
  await assertFails(getDoc(doc(student("s1"),path)));
  await testEnv.withSecurityRulesDisabled((context)=>setDoc(doc(context.firestore(),"classes/c1"),{status:"active"},{merge:true}));
});

after(async()=>testEnv.cleanup());
const student = (uid,classId="c1") => testEnv.authenticatedContext(uid,{role:"student",classId,memberId:uid,sessionVersion:1}).firestore();

test("only active round participants can read completion names; answers and pair state are private",async()=>{
  const own=student("s1");
  await assertSucceeds(getDoc(doc(own,"classes/c1/rounds/r1/balanceGamePublic/progress")));
  await assertFails(getDoc(doc(own,"classes/c1/rounds/r1/balanceGameSecrets/current")));
  await assertFails(getDoc(doc(own,"classes/c1/rounds/r1/balanceGameSecrets/current/submissions/s1")));
  await assertFails(getDoc(doc(own,"classes/c1/rounds/r1/balanceGameSecrets/current/submissions/s2")));
  await assertFails(getDoc(doc(student("outside","other"),"classes/c1/rounds/r1/balanceGamePublic/progress")));
  await assertFails(setDoc(doc(own,"classes/c1/rounds/r1/balanceGamePublic/progress"),{completedNames:["forged"]}));
});
