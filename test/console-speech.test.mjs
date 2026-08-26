// Regression tests for the console's audio pipeline.
//
// Safari suspends speechSynthesis when the tab loses audio focus: it accepts an
// utterance and then fires neither onend nor onerror. drainSpeech is the only
// thing that hands the microphone back, so a chain built on onend leaves the
// console mute and deaf with no event left to wake it. These tests drive that
// case, plus the two other paths that used to end in the same silence.
//
// Run: node --test test/
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {makeConsole} from "./console-harness.mjs";

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
// let/const in the page live in the context's global lexical scope, so they are
// readable by evaluating them, not as sandbox properties.
const peek=(h,expr)=>vm.runInContext(expr,h.sandbox);
const start=h=>{vm.runInContext("running=true",h.sandbox);h.sandbox.startRec()};

test("End the session tears the console down completely",async t=>{
  const h=makeConsole();t.after(()=>h.cleanup());
  start(h);
  h.sandbox.stopAll();
  assert.equal(h.FakeSR.last.started,false,"microphone left hot after teardown");
  assert.equal(h.el("bigbtn").textContent,"Start the drive","button not reset");
});

test("a suspended synthesizer does not wedge the console",async t=>{
  const h=makeConsole();t.after(()=>h.cleanup());
  start(h);

  // Baseline: a healthy synthesizer drains and returns the microphone.
  h.sandbox.say("First line. Second line.");
  await sleep(20);
  assert.equal(peek(h,"speaking"),false,"queue did not drain");
  await sleep(400);
  assert.equal(h.FakeSR.last.started,true,"microphone did not come back");

  // Now the tab loses audio focus: the utterance is accepted and then silent.
  h.synth.mode="silent";
  h.sandbox.say("The road narrows ahead.");
  await sleep(50);
  assert.equal(peek(h,"speaking"),true,"should be mid-utterance");

  // The deadline nudges once, then gives up and hands back to the microphone.
  await sleep(9000);
  assert.equal(peek(h,"speaking"),false,"speech pipeline never recovered");
  assert.equal(h.FakeSR.last.started,true,"microphone never reopened");
});

test("an utterance that wakes up late does not restart narration",async t=>{
  const h=makeConsole();t.after(()=>h.cleanup());
  start(h);
  h.synth.mode="silent";
  h.sandbox.say("One. Two. Three.");
  await sleep(9000);
  assert.equal(peek(h,"speaking"),false);
  const spokenBefore=h.synth.spoken.length;
  // Safari finally delivers the stalled onend after we have moved on.
  h.synth._pending.forEach(u=>u.onend&&u.onend());
  await sleep(50);
  assert.equal(h.synth.spoken.length,spokenBefore,"stale onend resumed narration");
  assert.equal(peek(h,"speaking"),false,"stale onend re-entered the speech queue");
});

test("pause leaves the microphone open so resume can be heard",async t=>{
  const h=makeConsole();t.after(()=>h.cleanup());
  start(h);
  h.sandbox.handleUtterance("pause");
  await sleep(600);
  assert.equal(peek(h,"paused"),true);
  assert.equal(h.FakeSR.last.started,true,'"resume" could never be heard');
});

test("mute leaves the microphone open so the wake word can be heard",async t=>{
  const h=makeConsole();t.after(()=>h.cleanup());
  start(h);
  h.sandbox.handleUtterance("stop listening");
  await sleep(600);
  assert.equal(peek(h,"muted"),true);
  assert.equal(h.FakeSR.last.started,true,'"start listening" could never be heard');
});

test("the housekeeper reopens a microphone that died in the background",async t=>{
  const h=makeConsole();t.after(()=>h.cleanup());
  start(h);
  assert.equal(peek(h,"recActive"),true);
  // Safari kills recognition while hidden, and the auto-restart in onend throws
  // because the tab is not ready yet — the failure that used to be permanent.
  const r=h.FakeSR.last;
  vm.runInContext("recActive=false",h.sandbox);
  r.started=false;
  await sleep(5000);
  assert.equal(h.FakeSR.last.started,true,"housekeeper did not reopen the microphone");
});
