'use strict';
// English UI, left to right. t() only fills in {placeholders}.
function t(text, vars = {}) {
  return String(text).replace(/\{(\w+)\}/g, (all, k) => (k in vars ? vars[k] : all));
}
const money = (n) => 'JOD ' + Number(n).toFixed(2);
const tPickup = (label) => label;
