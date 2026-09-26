import { setGlobalOptions } from "firebase-functions/v2";

setGlobalOptions({
  region: "asia-northeast3",
  maxInstances: 10,
  concurrency: 40,
  memory: "256MiB",
  timeoutSeconds: 60,
});

export { createClass } from "./classes/createClass.js";
export { registerStudents } from "./classes/registerStudents.js";
export { loginStudent } from "./students/loginStudent.js";
export { rotateStudentCredential } from "./students/rotateStudentCredential.js";

