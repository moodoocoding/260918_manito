import assert from "node:assert/strict";
import { test } from "node:test";
import { matchParticipants } from "../lib/rounds/matching.js";

for (const size of [4, 5, 17, 40]) {
  test(`matching gives each of ${size} students one distinct friend`, () => {
    const ids = Array.from({ length: size }, (_, index) => `student-${index}`);
    const result = matchParticipants(ids, [], [], null, () => 0.5);
    assert.ok(result);
    assert.equal(result.size, size);
    assert.equal(new Set(result.values()).size, size);
    for (const id of ids) assert.notEqual(result.get(id), id);
  });
}

test("required exclusions are never relaxed and an impossible roster has no result", () => {
  const ids = ["a", "b", "c", "d"];
  const exclusions = [["a", "b"], ["a", "c"]];
  const result = matchParticipants(ids, exclusions, [], null, () => 0);
  assert.ok(result);
  assert.equal(result.get("a"), "d");
  const impossible = [["a", "b"], ["a", "c"], ["a", "d"]];
  assert.equal(matchParticipants(ids, impossible, [], null), null);
});

test("the immediately preceding directed pairs are avoided when another solution exists", () => {
  const ids = ["a", "b", "c", "d"];
  const previous = ids.map((giverUid, index) => ({
    giverUid, receiverUid: ids[(index + 1) % ids.length], count: 1, lastRoundId: "round-one",
  }));
  const result = matchParticipants(ids, [], previous, "round-one", () => 0);
  assert.ok(result);
  for (const pair of previous) assert.notEqual(result.get(pair.giverUid), pair.receiverUid);
});
