import { useCallback, useEffect, useRef, useState } from "react";
import { call } from "./firebase";

type MyRequest = {rightsRequestId:string;kind:string;status:string;createdAt:string};
type TeacherRequest = MyRequest & {studentName:string;note:string};
const labels: Record<string,string> = {access:"내 정보 열람",correction:"정보 정정",deletion:"정보 삭제"};

export function StudentRights() {
  const [kind,setKind] = useState("access");
  const [note,setNote] = useState("");
  const [items,setItems] = useState<MyRequest[]>([]);
  const [busy,setBusy] = useState(false);
  const [notice,setNotice] = useState("");
  const [error,setError] = useState("");
  const pending = useRef<{key:string;requestId:string}|null>(null);
  const load = useCallback(async () => {
    const result = await call<null,{requests:MyRequest[]}>("listMyRightsRequests",null);
    setItems(result.requests);
  },[]);
  useEffect(()=>{void load().catch(()=>setError("요청 목록을 불러오지 못했어요."));},[load]);
  async function submit() {
    setBusy(true);setError("");setNotice("");
    try {
      const key = JSON.stringify([kind,note.trim()]);
      if (pending.current?.key !== key) pending.current = {key,requestId:crypto.randomUUID()};
      await call<object,object>("createRightsRequest",{kind,note,requestId:pending.current.requestId});
      pending.current = null;setNote("");await load();setNotice("요청을 접수했어요. 선생님과 직접 확인해 주세요.");
    } catch(caught) {setError(caught instanceof Error?caught.message:"요청을 접수하지 못했어요.");}
    finally {setBusy(false);}
  }
  return <section className="panel"><h2>내 정보에 관해 요청하기</h2><p>열람·정정·삭제를 요청할 수 있어요. 요청 접수 뒤 선생님이 본인과 처리 방법을 확인해요.</p>
    {error && <p className="message error" role="alert">{error}</p>}{notice && <p className="message success" role="status">{notice}</p>}
    <label>요청 종류<select value={kind} onChange={(e)=>setKind(e.target.value)}>{Object.entries(labels).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
    <label>선생님께 전할 말 (선택)<textarea rows={2} maxLength={300} value={note} onChange={(e)=>setNote(e.target.value)} /></label>
    <button disabled={busy} onClick={()=>void submit()}>요청 접수</button>
    {items.length>0 && <><h3>내 요청</h3><ul>{items.map((item)=><li key={item.rightsRequestId}>{labels[item.kind]??item.kind} · {item.status==="received"?"접수됨":item.status}</li>)}</ul></>}
  </section>;
}

export function TeacherRights({classId}:{classId:string}) {
  const [items,setItems] = useState<TeacherRequest[]>([]);
  const [error,setError] = useState("");
  const load = useCallback(async()=>{
    const result = await call<object,{requests:TeacherRequest[]}>("getRightsRequestsForTeacher",{classId});
    setItems(result.requests);
  },[classId]);
  useEffect(()=>{void load().catch(()=>setError("정보 요청을 불러오지 못했어요."));},[load]);
  return <section className="panel"><h2>학생 정보 요청</h2><p>접수 내역을 비공개로 확인하고 학교의 개인정보 담당 절차에 따라 본인 확인과 처리를 진행해 주세요. 여기의 접수 표시는 처리 완료를 뜻하지 않습니다.</p>
    {error && <p className="message error" role="alert">{error}</p>}
    <button className="small outline" onClick={()=>void load().catch(()=>setError("정보 요청을 불러오지 못했어요."))}>요청 새로고침</button>
    {items.length===0?<p>접수된 요청이 없어요.</p>:<ul className="member-list">{items.map((item)=><li key={item.rightsRequestId}><span><strong>{item.studentName} · {labels[item.kind]??item.kind}</strong><small>{item.note||"추가 설명 없음"} · 접수됨</small></span></li>)}</ul>}
  </section>;
}
