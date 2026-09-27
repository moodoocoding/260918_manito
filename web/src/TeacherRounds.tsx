import React, { useCallback, useEffect, useState } from "react";
import { call } from "./firebase";

type Member = { studentUid: string; displayName: string; accessStatus: string };
type Round = { roundId: string; title: string; status: string; startsAt: string; endsAt: string;
  activityDates: string[]; participantCount: number; rosterVersion: number; allowFreeTextMessages: boolean };
type Overview = { helps: Array<{helpId: string; studentName: string; category: string; note: string}>;
  pendingMessages: Array<{messageId: string; senderName: string; receiverName: string; text: string}>;
  participation: Array<{studentUid: string; displayName: string; status: string}>; activityDates: string[] };
type Assignment = { giverUid: string; giverName: string; receiverName: string };
type Settings = { participantIds: string[]; excludedPairs: Array<{a: string; b: string}>;
  missionIds: string[]; activityDates: string[] };

function localInput(date: string) {
  const d = new Date(date);
  const offset = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 16);
}

function plannedDates() {
  const date = new Date();
  const dates: string[] = [];
  while (dates.length < 5) {
    if (date.getDay() !== 0 && date.getDay() !== 6) dates.push(new Intl.DateTimeFormat("sv-SE", {timeZone:"Asia/Seoul", year:"numeric", month:"2-digit", day:"2-digit"}).format(date));
    date.setDate(date.getDate() + 1);
  }
  return dates;
}

export function TeacherRounds({ classId, gradeBand, members }: {
  classId: string; gradeBand: string; members: Member[];
}) {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [chosen, setChosen] = useState<string>("");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [catalog, setCatalog] = useState<Array<{missionId: string; text: string}>>([]);
  const [title, setTitle] = useState("");
  const [start, setStart] = useState(() => localInput(new Date().toISOString()));
  const [end, setEnd] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 14); return localInput(d.toISOString()); });
  const [dates, setDates] = useState(() => plannedDates().join(", "));
  const [participants, setParticipants] = useState<string[]>([]);
  const [excludedPairs, setExcludedPairs] = useState<Array<{a: string; b: string}>>([]);
  const [pairA, setPairA] = useState("");
  const [pairB, setPairB] = useState("");
  const [missionIds, setMissionIds] = useState<string[]>([]);
  const [allowFree, setAllowFree] = useState(false);
  const [nextTitle, setNextTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [resolution, setResolution] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const result = await call<{classId: string}, {rounds: Round[]}>("listRounds", {classId});
    setRounds(result.rounds);
  }, [classId]);
  const loadOverview = useCallback(async (roundId: string) => {
    const result = await call<object, Overview>("getTeacherRoundOverview", {classId, roundId});
    setOverview(result);
  }, [classId]);
  useEffect(() => { setChosen(""); setOverview(null); setAssignments(null); void load().catch(() => setError("회차 목록을 불러오지 못했어요.")); }, [load]);
  useEffect(() => { void call<object, {missions: typeof catalog}>("getMissionCatalog", {gradeBand})
    .then((result) => setCatalog(result.missions)).catch(() => setCatalog([])); }, [gradeBand]);
  useEffect(() => { setParticipants(members.filter((m) => m.accessStatus === "active").map((m) => m.studentUid)); }, [members]);
  const current = rounds.find((item) => item.roundId === chosen);

  async function run(action: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); await load(); if (chosen) await loadOverview(chosen); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "처리하지 못했어요."); }
    finally { setBusy(false); }
  }
  function formData() {
    return { classId, title, startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString(),
      activityDates: dates.split(/[\s,]+/).filter(Boolean), participantIds: participants,
      excludedPairs: excludedPairs.map(({a,b}) => [a,b]), missionIds, allowFreeTextMessages: allowFree };
  }
  async function saveRound(event: React.FormEvent) {
    event.preventDefault();
    await run(async () => {
      const payload = formData();
      if (missionIds.length !== 3) throw new Error("미션 3개를 선택해 주세요.");
      const result = current && ["draft", "ready"].includes(current.status)
        ? await call<object, {roundId: string}>("updateRound", {...payload, roundId: current.roundId, requestId: crypto.randomUUID()})
        : await call<object, {roundId: string}>("createRound", {...payload, requestId: crypto.randomUUID()});
      setChosen(result.roundId); setNotice("회차 설정을 저장했어요.");
    });
  }
  async function action(name: string) {
    if (!current) return;
    await run(async () => {
      if (name === "prepare") {
        await call<object, object>("prepareRound", {classId, roundId: current.roundId});
      } else if (name === "start") {
        await call<object, object>("startRound", {classId, roundId: current.roundId,
          rosterVersion: current.rosterVersion, requestId: crypto.randomUUID()});
      } else if (name === "reveal") {
        await call<object, object>("revealRound", {classId, roundId: current.roundId, requestId: crypto.randomUUID()});
      } else {
        await call<object, object>("changeRoundStatus", {classId, roundId: current.roundId,
          action: name, requestId: crypto.randomUUID()});
      }
      setNotice("회차 상태를 변경했어요.");
    });
  }
  async function selectRound(roundId: string) {
    setChosen(roundId); setAssignments(null); setOverview(null);
    if (!roundId) { setTitle(""); setExcludedPairs([]); setMissionIds([]);
      setDates(plannedDates().join(", ")); return; }
    try {
      const round = rounds.find((r) => r.roundId === roundId);
      const settings = await call<object, Settings>("getRoundSettingsForTeacher", {classId, roundId});
      if (round) { setTitle(round.title); setStart(localInput(round.startsAt)); setEnd(localInput(round.endsAt));
        setAllowFree(round.allowFreeTextMessages); }
      setParticipants(settings.participantIds); setMissionIds(settings.missionIds);
      setDates(settings.activityDates.length ? settings.activityDates.join(", ") : plannedDates().join(", "));
      setExcludedPairs(settings.excludedPairs);
      await loadOverview(roundId);
    } catch { setError("회차 현황을 불러오지 못했어요."); }
  }
  async function review(messageId: string, decision: "approve" | "reject") {
    if (!current) return;
    await run(async () => { await call<object, object>("reviewMessage", {classId, roundId: current.roundId,
      messageId, decision, requestId: crypto.randomUUID()}); setNotice("쪽지를 검토했어요."); });
  }
  async function resolve(helpId: string) {
    if (!current) return;
    await run(async () => { await call<object, object>("resolveHelpRequest", {classId, roundId: current.roundId,
      helpId, resolution: resolution[helpId], requestId: crypto.randomUUID()}); setNotice("도움 요청을 처리했어요."); });
  }
  async function stop(studentUid: string) {
    if (!current) return;
    await run(async () => { await call<object, object>("stopRoundParticipation", {classId,
      roundId: current.roundId, studentUid, requestId: crypto.randomUUID()}); setNotice("참여를 중단했어요."); });
  }
  async function copySettings() {
    if (!current || !nextTitle.trim()) return;
    await run(async () => {
      const startDate = new Date(); const endDate = new Date(); endDate.setDate(endDate.getDate() + 14);
      const result = await call<object, {roundId: string}>("copyRoundSettings", {classId,
        sourceRoundId: current.roundId, title: nextTitle, startsAt: startDate.toISOString(),
        endsAt: endDate.toISOString(), requestId: crypto.randomUUID()});
      setChosen(result.roundId); setTitle(nextTitle); setStart(localInput(startDate.toISOString()));
      setEnd(localInput(endDate.toISOString())); setDates(plannedDates().join(", "));
      setNotice("설정을 복사했어요. 수업일을 확인하고 저장해 주세요.");
    });
  }

  return <section className="panel round-panel">
    <h2>회차 운영</h2>
    {error && <p className="message error" role="alert">{error}</p>}
    {notice && <p className="message success" role="status">{notice}</p>}
    <label>회차 선택<select value={chosen} onChange={(event) => void selectRound(event.target.value)}>
      <option value="">새 회차</option>{rounds.map((round) => <option key={round.roundId} value={round.roundId}>{round.title} · {round.status}</option>)}
    </select></label>
    {(!current || ["draft", "ready"].includes(current.status)) && <form className="stack" onSubmit={(event) => void saveRound(event)}>
      <h3>{current ? "회차 설정 수정" : "새 회차 만들기"}</h3>
      <label>주제<input required maxLength={60} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <label>시작 시각<input required type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} /></label>
      <label>종료 시각<input required type="datetime-local" value={end} onChange={(event) => setEnd(event.target.value)} /></label>
      <label>수업일 5일 또는 10일 (쉼표로 구분)<textarea rows={2} value={dates} onChange={(event) => setDates(event.target.value)} /></label>
      <fieldset><legend>참가 학생 ({participants.length}명)</legend><div className="choice-grid">{members.map((m) => <label key={m.studentUid} className="check-line"><input type="checkbox" checked={participants.includes(m.studentUid)} disabled={m.accessStatus !== "active"} onChange={(event) => setParticipants((old) => event.target.checked ? [...old, m.studentUid] : old.filter((id) => id !== m.studentUid))} />{m.displayName}</label>)}</div></fieldset>
      <fieldset><legend>필수 제외 관계</legend><div className="action-row"><select aria-label="첫 번째 학생" value={pairA} onChange={(e) => setPairA(e.target.value)}><option value="">첫 번째 학생</option>{members.map((m) => <option key={m.studentUid} value={m.studentUid}>{m.displayName} ({m.studentUid.slice(-4)})</option>)}</select><select aria-label="두 번째 학생" value={pairB} onChange={(e) => setPairB(e.target.value)}><option value="">두 번째 학생</option>{members.map((m) => <option key={m.studentUid} value={m.studentUid}>{m.displayName} ({m.studentUid.slice(-4)})</option>)}</select><button type="button" className="small outline" disabled={!pairA || !pairB || pairA === pairB} onClick={() => { if (!excludedPairs.some((p) => [p.a,p.b].includes(pairA) && [p.a,p.b].includes(pairB))) setExcludedPairs((old) => [...old,{a:pairA,b:pairB}]); setPairA(""); setPairB(""); }}>제외 추가</button></div><ul>{excludedPairs.map((p,index) => <li key={`${p.a}_${p.b}`}>{members.find((m) => m.studentUid === p.a)?.displayName} ↔ {members.find((m) => m.studentUid === p.b)?.displayName} <button type="button" className="small outline" onClick={() => setExcludedPairs((old) => old.filter((_,i) => i !== index))}>제거</button></li>)}</ul></fieldset>
      <fieldset><legend>이번 회차 미션 3개</legend><div className="choice-grid">{catalog.map((m) => <label key={m.missionId} className="check-line"><input type="checkbox" checked={missionIds.includes(m.missionId)} onChange={(event) => setMissionIds((old) => event.target.checked ? [...old, m.missionId] : old.filter((id) => id !== m.missionId))} />{m.text}</label>)}</div></fieldset>
      <label className="check-line"><input type="checkbox" checked={allowFree} onChange={(event) => setAllowFree(event.target.checked)} />자유 쪽지 허용 (교사 승인 후 전달)</label>
      <button disabled={busy}>설정 저장</button>
    </form>}
    {current && <div className="stack"><p><strong>{current.title}</strong> · {current.status} · {current.participantCount}명</p>
      <div className="action-row">
        {current.status === "draft" && <button disabled={busy} onClick={() => void action("prepare")}>조건 확인</button>}
        {current.status === "ready" && <button disabled={busy} onClick={() => void action("start")}>매칭하고 시작</button>}
        {current.status === "active" && <><button disabled={busy} onClick={() => void action("pause")}>일시정지</button><button disabled={busy} onClick={() => void action("end")}>활동 종료</button></>}
        {current.status === "paused" && <><button disabled={busy} onClick={() => void action("resume")}>재개</button><button disabled={busy} onClick={() => void action("end")}>활동 종료</button></>}
        {current.status === "reveal_pending" && <button disabled={busy} onClick={() => void action("reveal")}>정체 공개 승인</button>}
        {["revealed", "cancelled"].includes(current.status) && <button disabled={busy} onClick={() => void action("archive")}>보관하고 다음 회차 준비</button>}
        {["draft", "ready", "active", "paused"].includes(current.status) && <button className="outline" disabled={busy} onClick={() => void action("cancel")}>회차 취소</button>}
      </div>
      {["revealed", "archived", "cancelled"].includes(current.status) && <div className="review-card"><label>다음 회차 주제<input value={nextTitle} onChange={(e) => setNextTitle(e.target.value)} maxLength={60} /></label><button disabled={busy || !nextTitle.trim()} onClick={() => void copySettings()}>설정만 복사해 새 회차 만들기</button></div>}
      <button className="small outline" disabled={busy} onClick={() => void loadOverview(current.roundId)}>현황 새로고침</button>
      {overview && <>
        <h3>1. 도움 요청</h3>{overview.helps.length === 0 ? <p>대기 중인 요청이 없어요.</p> : overview.helps.map((h) => <div className="review-card" key={h.helpId}><strong>{h.studentName} · {h.category}</strong><p>{h.note}</p><input aria-label={`${h.studentName} 처리 내용`} placeholder="처리 내용" value={resolution[h.helpId] ?? ""} onChange={(e) => setResolution((old) => ({...old, [h.helpId]: e.target.value}))} /><button disabled={busy || !resolution[h.helpId]} onClick={() => void resolve(h.helpId)}>처리 완료</button></div>)}
        <h3>2. 검토할 쪽지</h3>{overview.pendingMessages.length === 0 ? <p>대기 중인 쪽지가 없어요.</p> : overview.pendingMessages.map((m) => <div className="review-card" key={m.messageId}><strong>{m.senderName} → {m.receiverName}</strong><p>{m.text}</p><button disabled={busy} onClick={() => void review(m.messageId, "approve")}>승인</button><button className="outline" disabled={busy} onClick={() => void review(m.messageId, "reject")}>반려</button></div>)}
        <h3>3. 참가 상태</h3><ul className="member-list">{overview.participation.map((p) => <li key={p.studentUid}><span>{p.displayName} · {p.status}</span>{p.status === "active" && ["active", "paused", "reveal_pending"].includes(current.status) && <button className="small outline" disabled={busy} onClick={() => void stop(p.studentUid)}>참여 중단</button>}</li>)}</ul>
        <h3>4. 일정</h3><p>{overview.activityDates.join(", ")}</p>
      </>}
      {["active", "paused", "reveal_pending", "revealed"].includes(current.status) && <><button className="small outline" disabled={busy} onClick={() => void run(async () => { const result = await call<object, {assignments: Assignment[]}>("getAssignmentsForTeacher", {classId, roundId: current.roundId}); setAssignments(result.assignments); })}>안전 대응용 배정표 열람</button>{assignments && <table><thead><tr><th>챙기는 학생</th><th>챙겨 줄 친구</th></tr></thead><tbody>{assignments.map((a) => <tr key={a.giverUid}><td>{a.giverName}</td><td>{a.receiverName}</td></tr>)}</tbody></table>}</>}
    </div>}
  </section>;
}
