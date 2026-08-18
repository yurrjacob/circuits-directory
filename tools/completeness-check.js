#!/usr/bin/env node
/* The profile completeness meter drives what the portal nags a supplier about,
   so the arithmetic needs to be right at both ends: an untouched profile must
   read 0% and a finished one exactly 100%. A meter that never reaches the end
   is worse than no meter — it tells a paying customer they are never done.

   Only the two pure pieces of portal.js are evaluated here, so no DOM is
   needed. Run on its own, or via tools/check.js. */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, '..', 'portal.js'), 'utf8');
const block = src.slice(src.indexOf('const PROFILE_FIELDS'), src.indexOf('function renderNextSteps'));
assert.ok(block, 'could not find the completeness code in portal.js');

// indirect eval so the declarations land somewhere the assertions can see them
(0, eval)(block
  .replace('const PROFILE_FIELDS', 'globalThis.PROFILE_FIELDS')
  .replace('function profileCompleteness', 'globalThis.profileCompleteness = function'));

const empty = profileCompleteness({});
assert.strictEqual(empty.pct, 0, `an untouched profile reads ${empty.pct}%, expected 0`);
assert.strictEqual(empty.missing.length, PROFILE_FIELDS.length,
  'an untouched profile does not list every field as missing');

const full = {};
PROFILE_FIELDS.forEach(f => { full[f.key] = 'x'; });
const done = profileCompleteness(full);
assert.strictEqual(done.pct, 100, `a finished profile reads ${done.pct}%, expected 100`);
assert.strictEqual(done.missing.length, 0, 'a finished profile still lists missing fields');

// whitespace is not content — " " must not count as a filled field
const blank = {};
PROFILE_FIELDS.forEach(f => { blank[f.key] = '   '; });
assert.strictEqual(profileCompleteness(blank).pct, 0, 'spaces are being counted as a filled field');

// a realistic half-finished profile
const partial = profileCompleteness({ logo: 'https://x/l.png', description: 'We make things', website: 'https://x' });
assert.ok(partial.pct > 0 && partial.pct < 100, `a partial profile reads ${partial.pct}%`);
assert.ok(partial.missing.some(f => f.key === 'phone'), 'a missing phone number is not flagged');
assert.ok(!partial.missing.some(f => f.key === 'logo'), 'a present logo is wrongly flagged as missing');

// nulls, undefined and a missing company object must not crash the dashboard
assert.strictEqual(profileCompleteness({ logo: null, description: undefined }).pct, 0);
assert.strictEqual(profileCompleteness(null).pct, 0, 'a missing company object crashes the meter');

console.log(`profile completeness OK — empty 0%, full 100%, sample partial ${partial.pct}%`);
