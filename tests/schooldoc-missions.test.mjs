import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../web/src/schooldocMissionsApi.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { createSchooldocMissionsClient, parseSchooldocMissionView, schooldocToday, schooldocCanReport, schooldocCanCancel, schooldocCheckLabel } =
  await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

const token = "00000000-0000-4000-8000-000000000001";
const id = "00000000-0000-4000-8000-000000000002";
const config = { endpoint: "https://virtual-fixture.supabase.co/functions/v1/class-missions-public", token };
const sampleMission = { id, title: "예시 미션", description: "가상 내용\n다음 줄", startDate: "2026-10-01", dueDate: "2026-10-30",
  requiresConfirmation: true, status: "open", check: "unmarked", checkedAt: null };
const sample = () => ({ className: "가상 학급", studentName: "가상 학생", missions: [{ ...sampleMission }] });
const signal = () => new AbortController().signal;
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });

test("same view/mark contract is sent to the original public endpoint without village credentials or identity in URL", async () => {
  const requests = [];
  const client = createSchooldocMissionsClient(config, async (url, init) => { requests.push({ url, init }); return json(sample()); });
  await client.view("  가상 학생  ", signal());
  await client.mark(" 23456789ABCD ", id, "reported", signal());
  await client.mark("가상 학생", id, "unmarked", signal());
  assert.deepEqual(requests.map(({ init }) => JSON.parse(init.body)), [
    { action: "view", token, studentName: "가상 학생", code: "가상 학생" },
    { action: "mark", token, studentName: "23456789ABCD", code: "23456789ABCD", missionId: id, status: "reported" },
    { action: "mark", token, studentName: "가상 학생", code: "가상 학생", missionId: id, status: "unmarked" },
  ]);
  for (const { url, init } of requests) {
    assert.equal(url, config.endpoint);
    assert.equal(init.method, "POST");
    assert.equal(init.credentials, "omit");
    assert.equal(init.cache, "no-store");
    assert.equal(init.referrerPolicy, "no-referrer");
    assert.equal(init.redirect, "error");
    assert.deepEqual(init.headers, { "Content-Type": "application/json" });
  }
});

test("pending/confirmed meanings are preserved and only the public projection is retained", async () => {
  const view = sample();
  view.roster = [{ name: "추가 정보" }];
  view.missions[0] = { ...sampleMission, check: "pending", checkedAt: "2026-10-30T00:00:00.000Z", studentId: "private" };
  const parsed = await createSchooldocMissionsClient(config, async () => json(view)).mark("가상 학생", id, "reported", signal());
  assert.equal(parsed.missions[0].check, "pending");
  assert.equal(parsed.missions[0].checkedAt, "2026-10-30T00:00:00.000Z");
  assert.equal("roster" in parsed, false);
  assert.equal("studentId" in parsed.missions[0], false);
  assert.equal(schooldocCheckLabel(parsed.missions[0], "2026-10-30"), "선생님 확인 중");
  assert.equal(schooldocCheckLabel({ ...sampleMission, check: "confirmed" }), "선생님 확인 완료");
});

test("malformed, duplicate, draft or oversized responses fail closed", () => {
  for (const value of [null, {}, { ...sample(), missions: [{ ...sampleMission, check: "success" }] },
    { ...sample(), missions: [{ ...sampleMission, status: "draft" }] },
    { ...sample(), missions: [{ ...sampleMission, title: "가".repeat(101) }] },
    { ...sample(), missions: [{ ...sampleMission, dueDate: "2026-01-01" }] },
    { ...sample(), missions: [{ ...sampleMission, startDate: "2026-02-31" }] },
    { ...sample(), missions: [{ ...sampleMission }, { ...sampleMission }] },
    { ...sample(), missions: Array.from({ length: 61 }, () => ({ ...sampleMission })) }]) {
    assert.throws(() => parseSchooldocMissionView(value), /미션 정보를 읽지 못/);
  }
});

test("student date hints follow Korea time and confirmed/exempt cannot be cancelled", () => {
  assert.equal(schooldocToday(new Date("2026-10-29T15:00:00.000Z")), "2026-10-30");
  assert.equal(schooldocCanReport(sampleMission, "2026-10-30"), true);
  assert.equal(schooldocCanReport(sampleMission, "2026-10-31"), false);
  assert.equal(schooldocCanReport({ ...sampleMission, status: "closed" }, "2026-10-30"), false);
  assert.equal(schooldocCanCancel({ ...sampleMission, check: "pending" }, "2026-10-30"), true);
  assert.equal(schooldocCanCancel({ ...sampleMission, check: "reported" }, "2026-10-30"), true);
  for (const check of ["unmarked", "confirmed", "exempt"]) assert.equal(schooldocCanCancel({ ...sampleMission, check }, "2026-10-30"), false);
});

test("no identity is sent to an unexpected endpoint or with invalid input", async () => {
  let calls = 0;
  const fetcher = async () => { calls++; return json(sample()); };
  for (const endpoint of ["https://other.example/functions/v1/class-missions-public", "http://virtual-fixture.supabase.co/functions/v1/class-missions-public",
    `${config.endpoint}?name=person`, "https://virtual-fixture.supabase.co/functions/v1/class-missions-admin"]) {
    await assert.rejects(createSchooldocMissionsClient({ ...config, endpoint }, fetcher).view("가상 학생", signal()), /연결 정보/);
  }
  const client = createSchooldocMissionsClient(config, fetcher);
  await assert.rejects(client.view(" ", signal()), /본인 이름/);
  await assert.rejects(client.mark("가상 학생", "wrong-id", "reported", signal()), /미션을 다시/);
  await assert.rejects(client.mark("가상 학생", id, "confirmed", signal()), /미션을 다시/);
  assert.equal(calls, 0);
});

test("known errors are shown safely; network/5xx/invalid JSON after mark are uncertain", async () => {
  const client = createSchooldocMissionsClient(config, async () => json({ error: "요청이 많습니다. 1분 후 다시 시도해 주세요." }, 429));
  await assert.rejects(client.view("가상 학생", signal()), (error) => error.status === 429 && !error.uncertain && /1분/.test(error.message));
  const internal = createSchooldocMissionsClient(config, async () => json({ error: "secret stack trace" }, 503));
  await assert.rejects(internal.mark("가상 학생", id, "reported", signal()), (error) => error.uncertain && !error.message.includes("secret"));
  const lost = createSchooldocMissionsClient(config, async () => { throw new TypeError("private request details"); });
  await assert.rejects(lost.mark("가상 학생", id, "reported", signal()), (error) => error.uncertain && !error.message.includes("private"));
  const malformed = createSchooldocMissionsClient(config, async () => new Response("<html>bad gateway</html>"));
  await assert.rejects(malformed.mark("가상 학생", id, "reported", signal()), (error) => error.uncertain);
});

test("aborted page requests do not make new calls or become save success", async () => {
  let calls = 0;
  const client = createSchooldocMissionsClient(config, async (_url, init) => {
    calls++;
    return new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true }));
  });
  const already = new AbortController(); already.abort();
  await assert.rejects(client.view("가상 학생", already.signal), (error) => error.name === "AbortError");
  assert.equal(calls, 0);
  const active = new AbortController();
  const pending = client.mark("가상 학생", id, "reported", active.signal);
  active.abort();
  await assert.rejects(pending, (error) => error.name === "AbortError");
  assert.equal(calls, 1);
});

test("a save timeout requires reconciliation rather than automatic retransmission", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0;
  const client = createSchooldocMissionsClient(config, async (_url, init) => {
    calls++;
    return new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("timeout", "AbortError")), { once: true }));
  });
  const pending = client.mark("가상 학생", id, "reported", signal());
  context.mock.timers.tick(20_000);
  await assert.rejects(pending, (error) => error.uncertain && /응답이 늦어/.test(error.message));
  assert.equal(calls, 1);
  context.mock.timers.reset();
});

test("hidden pages, page departure and BFCache restore clear credentials, while cleanup removes listeners", async () => {
  const privacySource = await readFile(new URL("../web/src/schooldocMissionsPrivacy.ts", import.meta.url), "utf8");
  const privacyCode = ts.transpileModule(privacySource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  const { observeSchooldocPrivacy } = await import(`data:text/javascript;base64,${Buffer.from(privacyCode).toString("base64")}`);
  const doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
  const page = new EventTarget();
  let credential = "가상 개인 코드";
  let clears = 0;
  const stop = observeSchooldocPrivacy(() => { credential = ""; clears++; }, doc, page);
  doc.dispatchEvent(new Event("visibilitychange"));
  assert.equal(clears, 0);
  doc.visibilityState = "hidden"; doc.dispatchEvent(new Event("visibilitychange"));
  assert.equal(credential, ""); assert.equal(clears, 1);
  page.dispatchEvent(new Event("pagehide"));
  assert.equal(clears, 2);
  page.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
  assert.equal(clears, 3);
  stop(); doc.dispatchEvent(new Event("visibilitychange")); page.dispatchEvent(new Event("pagehide"));
  assert.equal(clears, 3);
});
