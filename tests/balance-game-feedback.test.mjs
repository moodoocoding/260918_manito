import assert from 'node:assert/strict';
import { test } from 'node:test';
import { balanceGameErrorText } from '../web/src/balanceGameFeedback.ts';

test('uses the Firebase error code to explain an unavailable round',()=>{
 const message='진행 중인 회차에서만 자리바꾸기를 할 수 있어요.';
 assert.equal(balanceGameErrorText({code:'functions/failed-precondition',message}),message);
});
test('keeps an internal message or private identifier out of student feedback',()=>{
 const privateMessage='internal state: student-private-id';
 assert.equal(balanceGameErrorText({code:'functions/internal',message:privateMessage}).includes(privateMessage),false);
 assert.equal(balanceGameErrorText({code:'functions/failed-precondition',message:privateMessage}).includes(privateMessage),false);
});
test('explains how to recover from a replaced card and temporary connection error',()=>{
 assert.match(balanceGameErrorText({code:'functions/permission-denied'}),/내 카드로 다시 입장/);
 assert.match(balanceGameErrorText({code:'functions/unavailable'}),/서버 연결/);
});
test('distinguishes a saved response with failed AI matching from a connection error',()=>{
 const message=balanceGameErrorText({code:'functions/unavailable',message:'짝을 만들지 못했어요. 잠시 후 다시 시도해 주세요.'});
 assert.match(message,/선택은 저장/);
 assert.match(message,/짝 정하기 다시 시도/);
 assert.equal(message.includes('서버 연결'),false);
});
