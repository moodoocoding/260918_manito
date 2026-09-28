import assert from "node:assert/strict";
import {test} from "node:test";
import {classifyMail} from "../lib/rounds/mailTimeline.js";

test("first notes and all replies stay in their original conversation", () => {
  const timeline = classifyMail([
    {messageId:"a-reply",direction:"inbox",replyToMessageId:"a-root",createdAtMillis:4},
    {messageId:"b-reply",direction:"sent",replyToMessageId:"b-root",createdAtMillis:3},
    {messageId:"b-root",direction:"inbox",replyToMessageId:null,createdAtMillis:2},
    {messageId:"a-root",direction:"sent",replyToMessageId:null,createdAtMillis:1},
  ]);
  assert.equal(timeline.get("a-root").conversation,"caredFor");
  assert.equal(timeline.get("a-reply").conversation,"caredFor");
  assert.equal(timeline.get("b-root").conversation,"carer");
  assert.equal(timeline.get("b-reply").conversation,"carer");
  assert.deepEqual([...timeline.values()].map(({sequence})=>sequence),[0,1,2,3]);
});

test("missing and cyclic reply links are not assigned to either friend", () => {
  const timeline = classifyMail([
    {messageId:"missing",direction:"inbox",replyToMessageId:"gone",createdAtMillis:1},
    {messageId:"cycle-a",direction:"sent",replyToMessageId:"cycle-b",createdAtMillis:2},
    {messageId:"cycle-b",direction:"inbox",replyToMessageId:"cycle-a",createdAtMillis:3},
  ]);
  assert.ok([...timeline.values()].every(({conversation})=>conversation==="unknown"));
});
