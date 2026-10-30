import assert from "node:assert/strict";
import { test } from "node:test";
import { balanceMatchingFailureDetails, generatePairsWithGemini, validatePairs } from "../lib/rounds/balanceGame.js";

test("validates each participant exactly once and derives the agreement score locally", () => {
  const choices = { a: ["A", "B"], b: ["A", "B"], c: ["A", "A"], d: ["B", "B"] };
  assert.deepEqual(validatePairs([{ a: "a", b: "b", score: 2 }, { a: "c", b: "d", score: 0 }], Object.keys(choices), choices), [
    { a: "a", b: "b", score: 2 }, { a: "c", b: "d", score: 0 },
  ]);
});

test("rejects self pairs, duplicate IDs, omitted IDs, and unknown IDs", () => {
  const choices = { a: ["A"], b: ["B"], c: ["A"], d: ["B"] };
  for (const result of [
    [{ a: "a", b: "a", score: 0 }, { a: "c", b: "d", score: 0 }],
    [{ a: "a", b: "b", score: 0 }, { a: "a", b: "d", score: 0 }],
    [{ a: "a", b: "b", score: 0 }],
    [{ a: "a", b: "x", score: 0 }, { a: "c", b: "d", score: 0 }],
  ]) assert.throws(() => validatePairs(result, Object.keys(choices), choices));
});

test("sends anonymous IDs to Gemini and accepts its structured pair response", async () => {
  let request;
  const pairs = await generatePairsWithGemini([
    { id: "random-1", choices: ["A", "A"] }, { id: "random-2", choices: ["A", "B"] },
  ], " \ntest-key \n", async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ pairs: [{ a: "random-1", b: "random-2", score: 1 }] }) }] } }] }), { status: 200 });
  });
  assert.equal(request.url.includes("gemini-3.8-flash"), true);
  assert.equal(request.options.headers["x-goog-api-key"], "test-key");
  assert.deepEqual(pairs, [{ a: "random-1", b: "random-2", score: 1 }]);
  assert.equal(request.options.body.includes("random-1"), true);
  assert.equal(request.options.body.includes("displayName"), false);
  const config=JSON.parse(request.options.body).generationConfig;
  assert.equal("temperature" in config,false);
  assert.deepEqual(config.thinkingConfig,{thinkingLevel:"low"});
  assert.equal(config.maxOutputTokens,8192);
});

test("does not substitute a mock result when provider configuration is absent", async () => {
  await assert.rejects(() => generatePairsWithGemini([], ""), /not configured/);
});

test("uses the final structured answer when thought text and split output parts are present",async()=>{
  const pairs=await generatePairsWithGemini([{id:"a",choices:["A"]},{id:"b",choices:["A"]}],"test-key",async()=>new Response(JSON.stringify({candidates:[{content:{parts:[
    {thought:true,text:"This is not the JSON answer"},{text:'{"pairs":[{"a":"a",'},{text:'"b":"b","score":1}]}'}
  ]}}]}),{status:200}));
  assert.deepEqual(pairs,[{a:"a",b:"b",score:1}]);
});

test("provider diagnostics contain only an HTTP status and an allowlisted reason",async()=>{
  for(const reason of ["API_KEY_INVALID","secret-student-private-key"]){
    try{
      await generatePairsWithGemini([],"test-secret",async()=>new Response(JSON.stringify({error:{message:"secret-student-private-key",details:[{reason}]}}),{status:400}));
      assert.fail("Provider failure must reject");
    }catch(error){
      assert.deepEqual(balanceMatchingFailureDetails(error),{category:"provider",httpStatus:400,reason:reason==="API_KEY_INVALID"?reason:"PROVIDER_REQUEST_FAILED"});
      assert.equal(JSON.stringify(balanceMatchingFailureDetails(error)).includes("secret-student"),false);
      assert.equal(error.message.includes("secret-student"),false);
    }
  }
  assert.deepEqual(balanceMatchingFailureDetails(new Error("private-student-id")),{category:"matching-failed"});
});

test("classifies empty model output and wrong pair scores without logging the response",async()=>{
 const entries=[{id:"private-a",choices:["A"]},{id:"private-b",choices:["A"]}];
 for(const [body,reason] of [
   [{candidates:[{finishReason:"MAX_TOKENS",content:{parts:[]}}]},"MAX_TOKENS"],
   [{candidates:[{content:{parts:[{text:JSON.stringify({pairs:[{a:"private-a",b:"private-b",score:0}]})}]}}]},"INVALID_PAIR_SCORE"]
 ]){
  await assert.rejects(()=>generatePairsWithGemini(entries,"test-key",async()=>new Response(JSON.stringify(body))),error=>{
    assert.deepEqual(balanceMatchingFailureDetails(error),{category:"provider-output",reason});
    assert.equal(JSON.stringify(balanceMatchingFailureDetails(error)).includes("private-"),false);
    return true;
  });
 }
});

test("transport diagnostics redact sensitive text and use only fixed reason codes",()=>{
 const error=new TypeError('Cannot convert secret-private-card into a ByteString');
 error.stack='TypeError: secret-private-card\n at generatePairsWithGemini (file:///workspace/lib/rounds/balanceGame.js:123:4)';
 assert.deepEqual(balanceMatchingFailureDetails(error),{category:'transport-or-format',reason:'INVALID_HEADER',siteLine:123});
 assert.equal(JSON.stringify(balanceMatchingFailureDetails(error)).includes('secret-private'),false);
 const network=new TypeError('fetch failed',{cause:{code:'ENOTFOUND',private:'secret-private-card'}});
 assert.equal(balanceMatchingFailureDetails(network).reason,'ENOTFOUND');
});

test("invalid secret characters stop before transport without disclosing the value",async()=>{
 let called=false;
 await assert.rejects(()=>generatePairsWithGemini([],"설명문 secret-marker",async()=>{called=true;throw new Error('must not run');}),error=>{
  assert.deepEqual(balanceMatchingFailureDetails(error),{category:'configuration',reason:'INVALID_API_KEY_FORMAT'});
  assert.equal(error.message.includes('secret-marker'),false);
  return true;
 });
 assert.equal(called,false);
});
