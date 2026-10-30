import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { StudentTeacherMailbox, emptyTeacherMailboxDraft } from "../src/StudentTeacherMailbox";
import { TeacherMailbox, type TeacherMailboxApi } from "../src/TeacherMailbox";
import type { CreateTeacherMailInput, TeacherMailDetail } from "../src/teacherMailTypes";
import "../src/style.css";
import "../src/student-teacher-mailbox.css";

// This isolated fixture never calls a production API or writes browser storage.
const records: TeacherMailDetail[] = Array.from({length:21},(_,index)=>({
  mailId:`qa-report-${index}`,kind:"report",status:"received",studentName:`예시 학생 ${index+1}`,
  createdAt:new Date(Date.UTC(2026,9,30,1,21-index)).toISOString(),report:{
    relatedStudents:["가상 친구 가","가상 친구 나"],occurredAt:"어제 점심시간",location:"운동장",
    incident:"가상 테스트 상황이에요.\n실제 사건이나 학생 정보가 아니에요.",reason:"잘 모르겠어요",
    witnesses:[{name:"가상 목격학생",otherClass:true,className:"3학년 4반"}],feelings:"속상해요",
    desiredAction:"선생님과 이야기하고 싶어요",neededHelp:"함께 살펴봐 주세요",
  },
}));
const qa = {failSend:false,failList:false,failResolve:false,sendIds:[] as string[]};
const api:TeacherMailboxApi={
  async list(input) {
    if(qa.failList){qa.failList=false;throw new Error("fixture");}
    const matched=records.filter(item=>item.kind===input.kind&&item.status===input.status);
    const offset=input.cursor?matched.findIndex(item=>item.mailId===input.cursor)+1:0;
    const page=matched.slice(offset,offset+20);
    return {items:page.map(({mailId,kind,status,studentName,createdAt,resolvedAt})=>({mailId,kind,status,studentName,createdAt,resolvedAt})),nextCursor:matched.length>offset+20?page.at(-1)!.mailId:null};
  },
  async detail({mailId}) { const value=records.find(item=>item.mailId===mailId); if(!value)throw new Error("fixture"); return structuredClone(value); },
  async resolve({mailId,resolution}) {
    if(qa.failResolve){qa.failResolve=false;throw new Error("fixture");}
    const value=records.find(item=>item.mailId===mailId);if(!value)throw new Error("fixture");
    value.status="resolved";value.resolution=resolution;value.resolvedAt=new Date().toISOString();return {mailId,status:"resolved"};
  },
};
function Fixture(){
  const draft=useRef(emptyTeacherMailboxDraft());
  const [mode,setMode]=useState<"student"|"teacher">("student");
  const [revision,setRevision]=useState(0);
  const [notice,setNotice]=useState("");
  async function submit(input:CreateTeacherMailInput){
    qa.sendIds.push(input.requestId);
    if(qa.failSend){qa.failSend=false;throw new Error("fixture");}
    const mailId=`qa-${crypto.randomUUID()}`;
    records.unshift({mailId,kind:input.kind,status:"received",studentName:"가상 작성 학생",createdAt:new Date().toISOString(),...(input.kind==="letter"?{letter:input.letter}:{report:input.report})});
    setNotice(`가상 전송 ${qa.sendIds.length}회 · 재시도 요청 ID 동일: ${qa.sendIds.length>1&&qa.sendIds.at(-1)===qa.sendIds.at(-2)?"예":"해당 없음"}`);
    return {mailId,status:"received" as const};
  }
  return <div className="app-shell student-app"><main className="content">
    <section className="panel" style={{marginBottom:24}} aria-label="가상 데이터 점검 도구">
      <h1>우체통 가상 동작 점검</h1><p>실제 학생·교사·서버와 연결되지 않은 검증 화면입니다.</p>
      <div className="action-row">
        <button onClick={()=>setMode("student")}>학생 화면</button><button onClick={()=>setMode("teacher")}>교사 화면</button>
        <button onClick={()=>{qa.failSend=true;setNotice("다음 전송 실패 준비");}}>다음 전송 실패</button>
        <button onClick={()=>{qa.failList=true;setNotice("다음 목록 실패 준비");}}>다음 목록 실패</button>
        <button onClick={()=>{qa.failResolve=true;setNotice("다음 처리 실패 준비");}}>다음 처리 실패</button>
        <button onClick={()=>{draft.current=emptyTeacherMailboxDraft();qa.sendIds=[];setRevision(value=>value+1);setNotice("초안 초기화");}}>초안 초기화</button>
      </div>{notice&&<p role="status">{notice}</p>}
    </section>
    {mode==="student"?<StudentTeacherMailbox key={revision} draftRef={draft} onSubmit={submit} preview onBack={()=>{draft.current=emptyTeacherMailboxDraft();setRevision(value=>value+1);}}/>:<TeacherMailbox classId="qa-only" api={api}/>}
  </main></div>;
}
createRoot(document.getElementById("root")!).render(<Fixture/>);
