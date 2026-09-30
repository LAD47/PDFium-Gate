'use strict';

const assert = require('assert/strict');
const { createEmailAttachmentPdfPointAdapter } = require('../src/platform/email-attachment-pdf-point');

async function run() {
  const calls = [];
  const runtimeFrame = {
    async executeJavaScript(code, userGesture) {
      assert.match(code, /#scroller/);
      assert.equal(userGesture, true);
      return {ok:true,left:12,top:34,width:800,height:600};
    }
  };
  const target = { runtimeFrame };
  const adapter = createEmailAttachmentPdfPointAdapter({
    resolvePdfTarget(token) {
      assert.equal(token, 'token-1');
      return target;
    },
    async capturePdfViewerPoint(frame, x, y) {
      calls.push({frame,x,y});
      return {ok:true,candidates:[{pageIndex:0,pageX:100,pageY:200}]};
    }
  });

  const result = await adapter.resolve({token:'token-1',x:196,y:328.8});
  assert.equal(result.ok, true);
  assert.deepEqual(result.scrollerRect, {left:12,top:34,width:800,height:600});
  assert.deepEqual(result.viewerRootPoint, {x:208,y:362.8});
  assert.equal(calls.length, 1);
  assert.equal(calls[0].frame, runtimeFrame);
  assert.equal(calls[0].x, 208);
  assert.equal(calls[0].y, 362.8);
  assert.deepEqual(result.candidates, [{pageIndex:0,pageX:100,pageY:200}]);

  const missing = await adapter.resolve({token:'',x:1,y:2});
  assert.equal(missing.ok, false);
  assert.match(missing.error, /token/i);

  const unresolved = createEmailAttachmentPdfPointAdapter({
    resolvePdfTarget:()=>null,
    capturePdfViewerPoint:async()=>({ok:true,candidates:[]})
  });
  const unresolvedResult = await unresolved.resolve({token:'token-2',x:1,y:2});
  assert.equal(unresolvedResult.ok, false);
  assert.match(unresolvedResult.error, /embedded PDF-target/i);

  console.log('Email Import PDF point adapter OK: wrapper click coordinates map through viewer scroller geometry and fail closed when identity is unavailable.');
}

run().catch(error => {
  console.error('Email Import PDF point adapter failed.');
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
