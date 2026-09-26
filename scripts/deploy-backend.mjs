import { spawnSync } from "node:child_process";

const [projectId, confirmationFlag, confirmationValue] = process.argv.slice(2);

function fail(message) {
  console.error(`\n배포 중단: ${message}\n`);
  process.exit(1);
}

if (!projectId) {
  fail(
    "Firebase 프로젝트 ID가 필요합니다. " +
      "예: npm run deploy:backend -- manitto-classroom-dev-taeho --confirm manitto-classroom-dev-taeho",
  );
}

if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)) {
  fail("프로젝트 ID 형식이 올바르지 않습니다(6~30자의 소문자, 숫자, 하이픈). ");
}

if (projectId.startsWith("demo-")) {
  fail("demo-* 프로젝트는 Emulator 전용이므로 실제 배포 대상으로 사용할 수 없습니다.");
}

if (confirmationFlag !== "--confirm" || confirmationValue !== projectId) {
  fail(
    "잘못된 프로젝트 배포를 막기 위해 프로젝트 ID를 한 번 더 입력해야 합니다. " +
      `--confirm ${projectId}`,
  );
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: "inherit",
    shell: false,
  });

  if (result.error) {
    fail(`${command} 실행 실패: ${result.error.message}`);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log(`\n배포 대상: ${projectId}`);
console.log("1/2 Cloud Functions 빌드");
run("npm", ["run", "build"]);

console.log("\n2/2 Firestore 규칙·인덱스와 Cloud Functions 배포");
run("npx", [
  "--no-install",
  "firebase",
  "deploy",
  "--project",
  projectId,
  "--only",
  "firestore,functions",
  "--non-interactive",
]);

console.log(`\n배포 완료: https://console.firebase.google.com/project/${projectId}/overview`);
