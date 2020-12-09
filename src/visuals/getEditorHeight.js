module.exports = function getEditorHeight(acediff3) {
  // editorHeight: document.getElementById(acediff.options.left.id).clientHeight
  return document.getElementById(acediff3.options.left.id).offsetHeight;
};
