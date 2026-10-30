import { teacherServiceCatalog, type TeacherPage } from "./teacherNavigation";
import { WorldButton } from "./WorldPage";

export function TeacherServiceHub({ onOpen }: { onOpen: (page: TeacherPage) => void }) {
  return <section className="teacher-service-hub" aria-labelledby="teacher-services-title">
    <header className="teacher-service-heading"><div>
      <span className="context-badge">서비스 모음</span>
      <h2 id="teacher-services-title" data-teacher-page-title tabIndex={-1}>우리 반 운영을 한곳에서</h2>
      <p>학생·입장 정보는 학급 공통 관리에서, 각 활동은 아래 서비스에서 관리해요.</p>
    </div></header>
    <div className="teacher-service-grid">
      {teacherServiceCatalog.map((service) => <article key={service.id}
        className={`teacher-service-card${service.operational ? " teacher-service-card--available" : ""}`}>
        <div className="teacher-service-card-head"><span className="context-badge">{service.status}</span><h3>{service.title}</h3></div>
        <p>{service.description}</p>
        <WorldButton variant={service.operational ? "primary" : "secondary"} aria-label={`${service.action} · ${service.title}`} onClick={() => onOpen(service.page)}>
          {service.action}
        </WorldButton>
      </article>)}
    </div>
  </section>;
}

export function TeacherServiceConnection({ page, onOpen }: { page: TeacherPage; onOpen: (page: TeacherPage) => void }) {
  const service = teacherServiceCatalog.find((item) => item.page === page);
  if (!service?.connection) return null;
  return <section className="panel teacher-service-connection" aria-labelledby="teacher-connection-title">
    <header className="teacher-service-heading"><div>
      <span className="context-badge">{service.status}</span>
      <h2 id="teacher-connection-title" data-teacher-page-title tabIndex={-1}>{service.title}</h2>
      <p>{service.description}</p>
    </div></header>
    <div className="teacher-service-grid">
      <section aria-labelledby="teacher-student-capabilities"><h3 id="teacher-student-capabilities">{service.id === "teacher-mailbox" ? "준비된 학생 화면" : "학생 화면에서 제공하는 기능"}</h3>
        <ul>{service.connection.studentFeatures.map((feature) => <li key={feature}>{feature}</li>)}</ul>
        <p className="field-help">학생 기능의 제공 범위예요. 현재 학급의 설정·접수 현황을 조회한 결과는 아니에요.</p>
      </section>
      <section aria-labelledby="teacher-missing-capabilities"><h3 id="teacher-missing-capabilities">선생님 방에 연결할 관리 기능</h3>
        <ul>{service.connection.missingManagement.map((feature) => <li key={feature}>{feature}</li>)}</ul>
        <p className="field-help">아직 이곳에서는 해당 설정을 조회하거나 변경할 수 없어요.</p>
      </section>
    </div>
    <div className="actions">
      <WorldButton onClick={() => onOpen("services")}>서비스 모음으로</WorldButton>
      <WorldButton variant="secondary" onClick={() => onOpen("students")}>공통 학생·입장 카드 관리</WorldButton>
    </div>
  </section>;
}
