import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../web/src/teacherNavigation.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { teacherLanding, teacherLocation, teacherServiceCatalog } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

test("sign-in opens the existing one-class service hub without creating or substituting a class", () => {
  assert.deepEqual(teacherLanding("/teacher", ["existing-class"]), { classId: "existing-class", page: "services" });
});

test("zero or several classes keep explicit class selection", () => {
  for (const ids of [[], ["class-a", "class-b"]]) {
    assert.deepEqual(teacherLanding("/teacher", ids), { classId: null, page: "classes" });
  }
});

test("an explicit class route survives a different sole class and is left for server authorization", () => {
  assert.deepEqual(teacherLanding("/teacher/classes/requested-class/students", ["different-class"]), {
    classId: "requested-class", page: "students",
  });
});

test("every service card opens a restorable class-scoped route", () => {
  for (const service of teacherServiceCatalog) {
    assert.deepEqual(teacherLocation(`/teacher/classes/existing-class/${service.page}`), {
      classId: "existing-class", page: service.page,
    });
  }
});

test("legacy safety and unknown class subpages retain the selected class", () => {
  assert.deepEqual(teacherLocation("/teacher/classes/existing-class/safety"), { classId: "existing-class", page: "status" });
  assert.deepEqual(teacherLocation("/teacher/classes/existing-class/obsolete-view"), { classId: "existing-class", page: "services" });
});

test("a student path cannot be interpreted as a teacher class deep link", () => {
  assert.deepEqual(teacherLocation("/student/classes/example/status"), { classId: null, page: "classes" });
});
