import React, { useState, useRef } from "react";
import * as XLSX from "xlsx";

interface StudentRosterImporterProps {
  onRegister: (names: string[]) => Promise<void>;
  busy?: boolean;
  onCancel?: () => void;
}

// 한국 초등학교 학생 이름 정제 함수 (2~4자 한글 이름 식별 및 헤더/번호 필터링)
export function extractStudentNames(rawText: string): string[] {
  if (!rawText) return [];

  // 줄바꿈, 탭, 쉼표, 슬래시, 공백 등으로 1차 토큰화
  const lines = rawText.split(/[\r\n\t,;/|]+/);
  const excludeWords = new Set([
    "이름", "성명", "학생", "학생명", "번호", "출석번호", "성별", "남", "여",
    "학번", "비고", "연락처", "학년", "반", "담임", "교사", "초등학교", "명렬표",
    "남학생", "여학생", "합계", "총원", "출석", "결석", "순번"
  ]);

  const candidates: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // "1. 김민지", "01 김민지", "1번 김민지" 등에서 번호 제거
    const withoutNum = trimmed.replace(/^[\d#·.\s번-]+\s*/, "").replace(/\s*[\d#·.\s번-]+$/, "");
    
    // 공백으로 나뉜 단어들 확인 (예: "김민지 이준호 박서연")
    const words = withoutNum.split(/\s+/);
    for (const word of words) {
      const cleaned = word.replace(/[^가-힣]/g, ""); // 한글만 추출
      if (cleaned.length >= 2 && cleaned.length <= 5 && !excludeWords.has(cleaned)) {
        candidates.push(cleaned);
      }
    }
  }

  // 중복 제거하면서 원래 순서 유지
  return Array.from(new Set(candidates));
}

// 바이너리 데이터(PDF, HWP 등)에서 한글 텍스트 패턴 추출
function extractHangulFromBinary(buffer: ArrayBuffer): string[] {
  const bytes = new Uint8Array(buffer);
  
  // 1. UTF-8 디코딩 시도
  let utf8Text = "";
  try {
    utf8Text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    utf8Text = "";
  }

  // 2. UTF-16LE 디코딩 시도 (HWP 본문 등)
  let utf16Text = "";
  try {
    utf16Text = new TextDecoder("utf-16le", { fatal: false }).decode(bytes);
  } catch {
    utf16Text = "";
  }

  const combined = `${utf8Text}\n${utf16Text}`;
  return extractStudentNames(combined);
}

export function StudentRosterImporter({ onRegister, busy = false, onCancel }: StudentRosterImporterProps): React.JSX.Element {
  const [mode, setMode] = useState<"file" | "paste">("file");
  const [pasteText, setPasteText] = useState("");
  const [extractedNames, setExtractedNames] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [newNameInput, setNewNameInput] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setParseError(null);
    setFileName(file.name);

    try {
      const lowerName = file.name.toLowerCase();

      // 1. 엑셀 파일 (.xlsx, .xls, .csv)
      if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls") || lowerName.endsWith(".csv")) {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });
        const allTexts: string[] = [];

        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          if (!sheet) continue;
          // 셀 데이터 텍스트로 변환
          const jsonRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
          for (const row of jsonRows) {
            if (Array.isArray(row)) {
              for (const cell of row) {
                if (cell !== null && cell !== undefined) {
                  allTexts.push(String(cell));
                }
              }
            }
          }
        }
        const names = extractStudentNames(allTexts.join("\n"));
        if (names.length === 0) {
          setParseError("엑셀 파일에서 학생 이름을 찾지 못했어요. 텍스트 직접 붙여넣기를 사용해 보세요.");
        } else {
          setExtractedNames(names);
        }
      }
      // 2. 텍스트 파일 (.txt)
      else if (lowerName.endsWith(".txt")) {
        const text = await file.text();
        const names = extractStudentNames(text);
        if (names.length === 0) {
          setParseError("텍스트 파일에서 학생 이름을 찾지 못했어요.");
        } else {
          setExtractedNames(names);
        }
      }
      // 3. PDF, HWP, HWPX 등 문서 파일
      else {
        const buffer = await file.arrayBuffer();
        const names = extractHangulFromBinary(buffer);
        if (names.length === 0) {
          setParseError(`${file.name} 파일에서 이름을 자동으로 추출하기 어려워요. 명단을 복사해 '텍스트 직접 붙여넣기' 탭에 넣어주세요.`);
        } else {
          setExtractedNames(names);
        }
      }
    } catch {
      setParseError("파일을 읽는 도중 오류가 발생했어요. 텍스트 직접 붙여넣기를 사용해 주세요.");
    }
  }

  function handlePasteParse() {
    setParseError(null);
    if (!pasteText.trim()) {
      setParseError("붙여넣은 명단 텍스트를 입력해 주세요.");
      return;
    }
    const names = extractStudentNames(pasteText);
    if (names.length === 0) {
      setParseError("입력한 내용에서 학생 이름을 찾지 못했어요. 한 줄에 한 명씩 이름을 적어주세요.");
    } else {
      setExtractedNames(names);
    }
  }

  function removeName(indexToRemove: number) {
    setExtractedNames((old) => old.filter((_, idx) => idx !== indexToRemove));
  }

  function addSingleName() {
    const trimmed = newNameInput.trim().replace(/[^가-힣]/g, "");
    if (trimmed.length >= 2 && trimmed.length <= 5) {
      if (!extractedNames.includes(trimmed)) {
        setExtractedNames((old) => [...old, trimmed]);
      }
      setNewNameInput("");
    }
  }

  return (
    <div className="roster-importer-card sub-panel">
      <div className="roster-importer-header">
        <div className="header-text-group">
          <h3>📋 학생 명단 자동 등록 / 가져오기</h3>
          <p className="field-help">엑셀, PDF, 한글 파일 또는 복사한 명단을 넣으면 학생 이름을 자동으로 찾아 깔끔하게 정리해요.</p>
        </div>
        {onCancel && (
          <button type="button" className="small outline close-btn" onClick={onCancel} disabled={busy}>
            ✕ 닫기
          </button>
        )}
      </div>

      <div className="importer-tabs">
        <button
          type="button"
          className={mode === "file" ? "tab-active" : "outline"}
          onClick={() => { setMode("file"); setParseError(null); }}
        >
          📁 파일 올리기 (엑셀·PDF·한글·TXT)
        </button>
        <button
          type="button"
          className={mode === "paste" ? "tab-active" : "outline"}
          onClick={() => { setMode("paste"); setParseError(null); }}
        >
          ✍️ 텍스트 직접 붙여넣기
        </button>
      </div>

      {mode === "file" ? (
        <div
          className={`dropzone ${isDragging ? "is-dragover" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const file = e.dataTransfer.files[0];
            if (file) void handleFile(file);
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv,.pdf,.hwp,.hwpx,.txt"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          <div className="dropzone-content">
            <span className="dropzone-icon">📄</span>
            <strong>{fileName ? `선택된 파일: ${fileName}` : "파일을 마우스로 끌어다 놓거나 클릭해 선택하세요"}</strong>
            <small>지원 형식: 엑셀(.xlsx, .xls, .csv), PDF(.pdf), 한글(.hwp, .hwpx), 텍스트(.txt)</small>
          </div>
        </div>
      ) : (
        <div className="paste-input-area">
          <label htmlFor="paste-textarea">
            나이스 명렬표나 메신저에서 복사한 학생 명단 붙여넣기
            <textarea
              id="paste-textarea"
              rows={5}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={"예시 1:\n1. 김민지\n2. 이준호\n3. 박서연\n\n예시 2 (공백/쉼표 구분):\n김민지, 이준호, 박서연, 최도윤"}
            />
          </label>
          <button type="button" className="outline" onClick={handlePasteParse} disabled={!pasteText.trim()}>
            명단에서 이름 자동 추출하기
          </button>
        </div>
      )}

      {parseError && (
        <p className="message error" role="alert" style={{ margin: "12px 0 0" }}>
          {parseError}
        </p>
      )}

      {extractedNames.length > 0 && (
        <div className="extracted-preview-box">
          <div className="preview-heading">
            <strong>정리된 학생 명단 (총 {extractedNames.length}명)</strong>
            <span className="field-help">제외할 이름은 ✕를 누르고, 빠진 학생은 아래에서 직접 추가하세요.</span>
          </div>

          <div className="name-tags-grid">
            {extractedNames.map((name, idx) => (
              <span key={`${name}_${idx}`} className="student-name-tag">
                <span className="tag-num">{idx + 1}</span>
                <span className="tag-name">{name}</span>
                <button
                  type="button"
                  className="tag-remove"
                  onClick={() => removeName(idx)}
                  title={`${name} 제외`}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>

          <div className="add-single-name-row">
            <input
              type="text"
              maxLength={10}
              placeholder="빠진 학생 이름 직접 입력"
              value={newNameInput}
              onChange={(e) => setNewNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addSingleName();
                }
              }}
            />
            <button type="button" className="small outline" onClick={addSingleName} disabled={!newNameInput.trim()}>
              이름 추가
            </button>
          </div>

          <div className="importer-action-footer">
            <button
              type="button"
              className="primary-cta wide"
              disabled={busy || extractedNames.length === 0}
              onClick={() => void onRegister(extractedNames)}
            >
              {busy ? "학생 등록 및 4자리 카드 발급 중…" : `✨ 학생 ${extractedNames.length}명 등록하고 카드 만들기`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
