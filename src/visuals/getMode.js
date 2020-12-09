const C = require('../constants');

module.exports = function getMode(acediff3, editor) {
  let { mode } = acediff3.options;
  if (editor === C.EDITOR_COMMON && acediff3.options.common.mode !== null) {
    mode = acediff3.options.common.mode;
  }
  return mode;
};
