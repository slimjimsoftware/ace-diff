const C = require('../constants');

module.exports = function getTheme(acediff3, editor) {
  let { theme } = acediff3.options;
  if (editor === C.EDITOR_COMMON && acediff3.options.common.theme !== null) {
    theme = acediff3.options.common.theme;
  }
  return theme;
};
