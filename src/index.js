/* eslint-disable max-len */
/* eslint-disable no-console,no-use-before-define,camelcase,no-param-reassign,no-plusplus,block-scoped-var,no-redeclare,no-var,vars-on-top */

// Diffing library
const DiffMatchPatch = require('diff-match-patch');

const merge = require('./helpers/merge');
const throttle = require('./helpers/throttle');
const debounce = require('./helpers/debounce');
const normalizeContent = require('./helpers/normalizeContent');

const getCurve = require('./visuals/getCurve');
const getMode = require('./visuals/getMode');
const getTheme = require('./visuals/getTheme');
const getLine = require('./visuals/getLine');
const getEditorHeight = require('./visuals/getEditorHeight');
const createArrow = require('./visuals/createArrow');

const ensureElement = require('./dom/ensureElement');
const query = require('./dom/query');
const C = require('./constants');

// Range module placeholder
let Range;

function getRangeModule(ace) {
  if (ace.Range) {
    return ace.Range;
  }

  const requireFunc = (ace.acequire || ace.require);
  if (requireFunc) {
    return requireFunc('ace/range');
  }

  return false;
}

// our constructor
function AceDiff3(options = {}) {
  // Ensure instance is a constructor with `new`
  if (!(this instanceof AceDiff3)) {
    return new AceDiff3(options);
  }

  // Current instance we pass around to other functions
  const acediff3 = this;
  const getDefaultAce = () => (window ? window.ace : undefined);

  acediff3.options = merge({
    ace: getDefaultAce(),
    mode: null,
    theme: null,
    element: null,
    diffGranularity: C.DIFF_GRANULARITY_BROAD,
    lockScrolling: false, // not implemented yet
    showDiffs: true,
    showConnectors: true,
    maxDiffs: 5000,
    left: {
      id: null,
      content: null,
      mode: null,
      theme: null,
      editable: true,
      copyLinkEnabled: true,
    },
    common: {
      id: null,
      content: null,
      mode: null,
      theme: null,
      editable: true,
      copyLinkEnabled: false,
    },
    right: {
      id: null,
      content: null,
      mode: null,
      theme: null,
      editable: true,
      copyLinkEnabled: true,
    },
    classes: {
      gutter1: 'acediff3__gutter1',
      gutter2: 'acediff3__gutter1',
      diff: 'acediff3__diffLine',
      connector: 'acediff3__connector',
      newCodeConnectorLink: 'acediff3__newCodeConnector',
      newCodeConnectorLinkContent: '&#8594;',
      deletedCodeConnectorLink: 'acediff3__deletedCodeConnector',
      deletedCodeConnectorLinkContent: '&#8592;',
      copyRightContainer: 'acediff3__copy--right',
      copyLeftContainer: 'acediff3__copy--left',
    },
    connectorYOffset: 0,
  }, options);

  const { ace } = acediff3.options;

  if (!ace) {
    const errMessage = 'No ace editor found nor supplied - `options.ace` or `window.ace` is missing';
    console.error(errMessage);
    return new Error(errMessage);
  }

  Range = getRangeModule(ace);
  if (!Range) {
    const errMessage = 'Could not require Range module for Ace. Depends on your bundling strategy, but it usually comes with Ace itself. See https://ace.c9.io/api/range.html, open an issue on GitHub ace-diff/ace-diff';
    console.error(errMessage);
    return new Error(errMessage);
  }

  if (acediff3.options.element === null) {
    const errMessage = 'You need to specify an element for Ace-diff - `options.element` is missing';
    console.error(errMessage);
    return new Error(errMessage);
  }

  if (acediff3.options.element instanceof HTMLElement) {
    acediff3.el = acediff3.options.element;
  } else {
    acediff3.el = document.body.querySelector(acediff3.options.element);
  }

  if (!acediff3.el) {
    const errMessage = `Can't find the specified element ${acediff3.options.element}`;
    console.error(errMessage);
    return new Error(errMessage);
  }

  acediff3.options.left.id = ensureElement(acediff3.el, 'acediff3__left');
  acediff3.options.classes.gutter1 = ensureElement(acediff3.el, 'acediff3__gutter1');
  acediff3.options.common.id = ensureElement(acediff3.el, 'acediff3__common');
  acediff3.options.classes.gutter2 = ensureElement(acediff3.el, 'acediff3__gutter2');
  acediff3.options.right.id = ensureElement(acediff3.el, 'acediff3__right');

  acediff3.el.innerHTML = `<div class="acediff3__wrap">${acediff3.el.innerHTML}</div>`;

  // instantiate the editors in an internal data structure
  // that will store a little info about the diffs and
  // editor content
  acediff3.editors = {
    left: {
      ace: ace.edit(acediff3.options.left.id),
      markers: [],
      lineLengths: [],
    },
    common: {
      ace: ace.edit(acediff3.options.common.id),
      markers: [],
      lineLengths: [],
    },
    right: {
      ace: ace.edit(acediff3.options.right.id),
      markers: [],
      lineLengths: [],
    },
    editorHeight: null,
  };

  // set up the editors
  acediff3.editors.left.ace.getSession().setMode(getMode(acediff3, C.EDITOR_LEFT));
  acediff3.editors.common.ace.getSession().setMode(getMode(acediff3, C.EDITOR_COMMON));
  acediff3.editors.right.ace.getSession().setMode(getMode(acediff3, C.EDITOR_RIGHT));
  acediff3.editors.left.ace.setReadOnly(!acediff3.options.left.editable);
  acediff3.editors.common.ace.setReadOnly(!acediff3.options.common.editable);
  acediff3.editors.right.ace.setReadOnly(!acediff3.options.right.editable);
  acediff3.editors.left.ace.setTheme(getTheme(acediff3, C.EDITOR_LEFT));
  acediff3.editors.common.ace.setTheme(getTheme(acediff3, C.EDITOR_COMMON));
  acediff3.editors.right.ace.setTheme(getTheme(acediff3, C.EDITOR_RIGHT));

  acediff3.editors.left.ace.setValue(normalizeContent(acediff3.options.left.content), -1);
  acediff3.editors.common.ace.setValue(normalizeContent(acediff3.options.common.content), -1);
  acediff3.editors.right.ace.setValue(normalizeContent(acediff3.options.right.content), -1);

  // store the visible height of the editors (assumed the same)
  acediff3.editors.editorHeight = getEditorHeight(acediff3);

  // The lineHeight is set to 0 initially and we need to wait for another tick to get it
  // Thus moving the diff() with it
  setTimeout(() => {
    // assumption: editors have same line heights
    acediff3.lineHeight = acediff3.editors.common.ace.renderer.lineHeight;

    addEventHandlers(acediff3);
    createCopyContainers(acediff3);
    createGutter(acediff3);
    acediff3.diff();
  }, 1);
}

// our public API
AceDiff3.prototype = {

  // allows on-the-fly changes to the AceDiff instance settings
  setOptions(options) {
    merge(this.options, options);
    this.diff();
  },

  getNumDiffs() {
    return this.diffs1.length + this.diffs2.length;
  },

  // exposes the Ace editors in case the dev needs it
  getEditors() {
    return {
      left: this.editors.left.ace,
      common: this.editors.common.ace,
      right: this.editors.right.ace,
    };
  },

  // our main diffing function. I actually don't think this needs to exposed: it's called automatically,
  // but just to be safe, it's included
  diff() {
    const dmp = new DiffMatchPatch();
    const val1 = this.editors.left.ace.getSession().getValue();
    const val2 = this.editors.common.ace.getSession().getValue();
    const val3 = this.editors.right.ace.getSession().getValue();
    const diff1 = dmp.diff_main(val2, val1);
    const diff2 = dmp.diff_main(val3, val2);
    dmp.diff_cleanupSemantic(diff1);
    dmp.diff_cleanupSemantic(diff2);

    this.editors.left.lineLengths = getLineLengths(this.editors.left);
    this.editors.common.lineLengths = getLineLengths(this.editors.common);
    this.editors.right.lineLengths = getLineLengths(this.editors.right);

    // parse the raw diff into something a little more palatable
    const diffs1 = [];
    const diffs2 = [];
    const offset = {
      left: 0,
      common: 0,
      right: 0,
    };

    diff1.forEach((chunk, index, array) => {
      const chunkType = chunk[0];
      let text = chunk[1];

      // Fix for #28 https://github.com/ace-diff/ace-diff/issues/28
      if (array[index + 1] && text.endsWith('\n') && array[index + 1][1].startsWith('\n')) {
        text += '\n';
        diff1[index][1] = text;
        diff1[index + 1][1] = diff1[index + 1][1].replace(/^\n/, '');
      }

      // oddly, occasionally the algorithm returns a diff with no changes made
      if (text.length === 0) {
        return;
      }
      if (chunkType === C.DIFF_EQUAL) {
        offset.left += text.length;
        offset.common += text.length;
      } else if (chunkType === C.DIFF_DELETE) {
        diffs1.push(computeDiff(this, C.DIFF_DELETE, offset.left, offset.common, text));
        offset.common += text.length;
      } else if (chunkType === C.DIFF_INSERT) {
        diffs1.push(computeDiff(this, C.DIFF_INSERT, offset.left, offset.common, text));
        offset.left += text.length;
      }
    }, this);

    diff2.forEach((chunk, index, array) => {
      const chunkType = chunk[0];
      let text = chunk[1];

      // Fix for #28 https://github.com/ace-diff/ace-diff/issues/28
      if (array[index + 1] && text.endsWith('\n') && array[index + 1][1].startsWith('\n')) {
        text += '\n';
        diff2[index][1] = text;
        diff2[index + 1][1] = diff2[index + 1][1].replace(/^\n/, '');
      }

      // oddly, occasionally the algorithm returns a diff with no changes made
      if (text.length === 0) {
        return;
      }
      if (chunkType === C.DIFF_EQUAL) {
        offset.common += text.length;
        offset.right += text.length;
      } else if (chunkType === C.DIFF_DELETE) {
        diffs2.push(computeDiff(this, C.DIFF_DELETE, offset.common, offset.right, text));
        offset.right += text.length;
      } else if (chunkType === C.DIFF_INSERT) {
        diffs2.push(computeDiff(this, C.DIFF_INSERT, offset.common, offset.right, text));
        offset.common += text.length;
      }
    }, this);

    // simplify our computed diffs; this groups together multiple diffs on subsequent lines
    this.diffs1 = simplifyDiffs(this, diffs1);
    this.diffs2 = simplifyDiffs(this, diffs2);

    // if we're dealing with too many diffs, fail silently
    if (this.diffs1.length + this.diffs2.length > this.options.maxDiffs) {
      return;
    }

    clearDiffs(this);
    decorate(this);
  },

  destroy() {
    // destroy the editors
    const leftValue = this.editors.left.ace.getValue();
    this.editors.left.ace.destroy();
    let oldDiv = this.editors.left.ace.container;
    let newDiv = oldDiv.cloneNode(false);
    newDiv.textContent = leftValue;
    oldDiv.parentNode.replaceChild(newDiv, oldDiv);

    const commonValue = this.editors.common.ace.getValue();
    this.editors.common.ace.destroy();
    oldDiv = this.editors.common.ace.container;
    newDiv = oldDiv.cloneNode(false);
    newDiv.textContent = commonValue;
    oldDiv.parentNode.replaceChild(newDiv, oldDiv);

    const rightValue = this.editors.right.ace.getValue();
    this.editors.right.ace.destroy();
    oldDiv = this.editors.right.ace.container;
    newDiv = oldDiv.cloneNode(false);
    newDiv.textContent = rightValue;
    oldDiv.parentNode.replaceChild(newDiv, oldDiv);

    document.getElementById(this.options.classes.gutter1).innerHTML = '';
    document.getElementById(this.options.classes.gutter2).innerHTML = '';
    removeEventHandlers();
  },
};

let removeEventHandlers = () => { };

function addEventHandlers(acediff3) {
  acediff3.editors.left.ace.getSession().on('changeScrollTop', throttle(() => { updateGap(acediff3); }, 16));
  acediff3.editors.common.ace.getSession().on('changeScrollTop', throttle(() => { updateGap(acediff3); }, 16));
  acediff3.editors.right.ace.getSession().on('changeScrollTop', throttle(() => { updateGap(acediff3); }, 16));

  const diff = acediff3.diff.bind(acediff3);
  acediff3.editors.left.ace.on('change', diff);
  acediff3.editors.common.ace.on('change', diff);
  acediff3.editors.right.ace.on('change', diff);

  if (acediff3.options.left.copyLinkEnabled) {
    query.on(`#${acediff3.options.classes.gutter1}`, 'click', `.${acediff3.options.classes.newCodeConnectorLink}`, (e) => {
      copy(acediff3, e, C.LTR);
    });
  }
  if (acediff3.options.right.copyLinkEnabled) {
    query.on(`#${acediff3.options.classes.gutter2}`, 'click', `.${acediff3.options.classes.newCodeConnectorLink}`, (e) => {
      copy(acediff3, e, C.RTL);
    });
  }

  const onResize = debounce(() => {
    // eslint-disable-next-line no-param-reassign
    acediff3.editors.availableHeight = document.getElementById(acediff3.options.common.id).offsetHeight;

    // TODO this should re-init gutter
    acediff3.diff();
  }, 250);

  window.addEventListener('resize', onResize);
  removeEventHandlers = () => {
    window.removeEventListener('resize', onResize);
  };
}

function copy(acediff3, e, dir) {
  const diffIndex = parseInt(e.target.getAttribute('data-diff-index'), 10);
  const diff = dir === C.LTR ? acediff3.diffs1[diffIndex] : acediff3.diffs2[diffIndex];
  let sourceEditor;
  let targetEditor;

  let startLine;
  let endLine;
  let targetStartLine;
  let targetEndLine;
  if (dir === C.LTR) {
    sourceEditor = acediff3.editors.left;
    targetEditor = acediff3.editors.common;
    startLine = diff.leftStartLine;
    endLine = diff.leftEndLine;
    targetStartLine = diff.rightStartLine;
    targetEndLine = diff.rightEndLine;
  } else {
    sourceEditor = acediff3.editors.right;
    targetEditor = acediff3.editors.common;
    startLine = diff.rightStartLine;
    endLine = diff.rightEndLine;
    targetStartLine = diff.leftStartLine;
    targetEndLine = diff.leftEndLine;
  }

  let contentToInsert = '';
  for (let i = startLine; i < endLine; i += 1) {
    contentToInsert += `${getLine(sourceEditor, i)}\n`;
  }

  // keep track of the scroll height
  const h = targetEditor.ace.getSession().getScrollTop();
  targetEditor.ace.getSession().replace(new Range(targetStartLine, 0, targetEndLine, 0), contentToInsert);
  targetEditor.ace.getSession().setScrollTop(parseInt(h, 10));

  acediff3.diff();
}

function getLineLengths(editor) {
  const lines = editor.ace.getSession().doc.getAllLines();
  const lineLengths = [];
  lines.forEach((line) => {
    lineLengths.push(line.length + 1); // +1 for the newline char
  });
  return lineLengths;
}

// shows a diff in one of the two editors.
function showDiff(acediff3, editor, startLine, endLine, className) {
  const editorInstance = acediff3.editors[editor];

  if (endLine < startLine) { // can this occur? Just in case.
    // eslint-disable-next-line no-param-reassign
    endLine = startLine;
  }

  const classNames = `${className} ${(endLine > startLine) ? 'lines' : 'targetOnly'}`;

  // to get Ace to highlight the full row we just set the start and end chars to 0 and 1
  editorInstance.markers.push(
    editorInstance.ace.session.addMarker(
      new Range(
        startLine,
        0,
        endLine - 1 /* because endLine is always + 1 */,
        1,
      ), classNames, 'fullLine',
    ),
  );
}

// called onscroll. Updates the gap to ensure the connectors are all lining up
function updateGap(acediff) {
  clearDiffs(acediff);
  decorate(acediff);

  // reposition the copy containers containing all the arrows
  positionCopyContainers(acediff);
}

function clearDiffs(acediff3) {
  acediff3.editors.left.markers.forEach((marker) => {
    acediff3.editors.left.ace.getSession().removeMarker(marker);
  }, acediff3);
  acediff3.editors.common.markers.forEach((marker) => {
    acediff3.editors.common.ace.getSession().removeMarker(marker);
  }, acediff3);
  acediff3.editors.right.markers.forEach((marker) => {
    acediff3.editors.right.ace.getSession().removeMarker(marker);
  }, acediff3);
}

function addConnector(acediff3, leftEditor, rightEditor, leftStartLine, leftEndLine, rightStartLine, rightEndLine) {
  const leftScrollTop = leftEditor.ace.getSession().getScrollTop();
  const rightScrollTop = rightEditor.ace.getSession().getScrollTop();

  // All connectors, regardless of ltr or rtl
  // have the same point system, even if p1 === p3 or p2 === p4
  //  p1   p2
  //
  //  p3   p4

  acediff3.connectorYOffset = 1;

  const p1_x = -1;
  const p1_y = (leftStartLine * acediff3.lineHeight) - leftScrollTop + 0.5;
  const p2_x = acediff3.gutterWidth + 1;
  const p2_y = rightStartLine * acediff3.lineHeight - rightScrollTop + 0.5;
  const p3_x = -1;
  const p3_y = (leftEndLine * acediff3.lineHeight) - leftScrollTop + acediff3.connectorYOffset + 0.5;
  const p4_x = acediff3.gutterWidth + 1;
  const p4_y = (rightEndLine * acediff3.lineHeight) - rightScrollTop + acediff3.connectorYOffset + 0.5;
  const curve1 = getCurve(p1_x, p1_y, p2_x, p2_y);
  const curve2 = getCurve(p4_x, p4_y, p3_x, p3_y);

  const verticalLine1 = `L${p2_x},${p2_y} ${p4_x},${p4_y}`;
  const verticalLine2 = `L${p3_x},${p3_y} ${p1_x},${p1_y}`;
  const d = `${curve1} ${verticalLine1} ${curve2} ${verticalLine2}`;

  const el = document.createElementNS(C.SVG_NS, 'path');
  el.setAttribute('d', d);
  el.setAttribute('class', acediff3.options.classes.connector);
  acediff3.gutterSVG.appendChild(el);
}

function addCopyArrows(acediff3, info, diffIndex) {
  if (info.leftEndLine > info.leftStartLine && acediff3.options.left.copyLinkEnabled) {
    const arrow = createArrow({
      className: acediff3.options.classes.newCodeConnectorLink,
      topOffset: info.leftStartLine * acediff3.lineHeight,
      tooltip: 'Copy to right',
      diffIndex,
      arrowContent: acediff3.options.classes.newCodeConnectorLinkContent,
    });
    acediff3.copyRightContainer.appendChild(arrow);
  }

  if (info.rightEndLine > info.rightStartLine && acediff3.options.right.copyLinkEnabled) {
    const arrow = createArrow({
      className: acediff3.options.classes.deletedCodeConnectorLink,
      topOffset: info.rightStartLine * acediff3.lineHeight,
      tooltip: 'Copy to left',
      diffIndex,
      arrowContent: acediff3.options.classes.deletedCodeConnectorLinkContent,
    });
    acediff3.copyLeftContainer.appendChild(arrow);
  }
}

function positionCopyContainers(acediff3) {
  const commonTopOffset = acediff3.editors.common.ace.getSession().getScrollTop();
  acediff3.copyRightContainer.style.cssText = `top: ${-commonTopOffset}px`;
  acediff3.copyLeftContainer.style.cssText = `top: ${-commonTopOffset}px`;
}

/**
 // eslint-disable-next-line max-len
 * This method takes the raw diffing info from the Google lib and returns a nice clean object of the following
 * form:
 * {
 *   leftStartLine:
 *   leftEndLine:
 *   rightStartLine:
 *   rightEndLine:
 * }
 *
 * Ultimately, that's all the info we need to highlight the appropriate lines in the left + right editor, add the
 * SVG connectors, and include the appropriate <<, >> arrows.
 *
 * Note: leftEndLine and rightEndLine are always the start of the NEXT line, so for a single line diff, there will
 * be 1 separating the startLine and endLine values. So if leftStartLine === leftEndLine or rightStartLine ===
 * rightEndLine, it means that new content from the other editor is being inserted and a single 1px line will be
 * drawn.
 */
function computeDiff(acediff3, diffType, offsetLeft, offsetRight, diffText) {
  let lineInfo = {};

  // this was added in to hack around an oddity with the Google lib. Sometimes it would include a newline
  // as the first char for a diff, other times not - and it would change when you were typing on-the-fly. This
  // is used to level things out so the diffs don't appear to shift around
  let newContentStartsWithNewline = /^\n/.test(diffText);

  if (diffType === C.DIFF_INSERT) {
    // pretty confident this returns the right stuff for the left editor: start & end line & char
    var info = getSingleDiffInfo(acediff3.editors.left, offsetLeft, diffText);

    // this is the ACTUAL undoctored current line in the other editor. It's always right. Doesn't mean it's
    // going to be used as the start line for the diff though.
    var currentLineOtherEditor = getLineForCharPosition(acediff3.editors.right, offsetRight);
    var numCharsOnLineOtherEditor = getCharsOnLine(acediff3.editors.right, currentLineOtherEditor);
    const numCharsOnLeftEditorStartLine = getCharsOnLine(acediff3.editors.left, info.startLine);
    var numCharsOnLine = getCharsOnLine(acediff3.editors.left, info.startLine);

    // this is necessary because if a new diff starts on the FIRST char of the left editor, the diff can comes
    // back from google as being on the last char of the previous line so we need to bump it up one
    let rightStartLine = currentLineOtherEditor;
    if (numCharsOnLine === 0 && newContentStartsWithNewline) {
      newContentStartsWithNewline = false;
    }
    if (info.startChar === 0 && isLastChar(acediff3.editors.right, offsetRight, newContentStartsWithNewline)) {
      rightStartLine = currentLineOtherEditor + 1;
    }

    var sameLineInsert = info.startLine === info.endLine;

    // whether or not this diff is a plain INSERT into the other editor, or overwrites a line take a little work to
    // figure out. This feels like the hardest part of the entire script.
    var numRows = 0;
    if (

      // dense, but this accommodates two scenarios:
      // 1. where a completely fresh new line is being inserted in left editor, we want the line on right to stay a 1px line
      // 2. where a new character is inserted at the start of a newline on the left but the line contains other stuff,
      //    we DO want to make it a full line
      (info.startChar > 0 || (sameLineInsert && diffText.length < numCharsOnLeftEditorStartLine))

      // if the right editor line was empty, it's ALWAYS a single line insert [not an OR above?]
      && numCharsOnLineOtherEditor > 0

      // if the text being inserted starts mid-line
      && (info.startChar < numCharsOnLeftEditorStartLine)) {
      numRows++;
    }

    lineInfo = {
      leftStartLine: info.startLine,
      leftEndLine: info.endLine + 1,
      rightStartLine,
      rightEndLine: rightStartLine + numRows,
    };
  } else {
    var info = getSingleDiffInfo(acediff3.editors.right, offsetRight, diffText);

    var currentLineOtherEditor = getLineForCharPosition(acediff3.editors.left, offsetLeft);
    var numCharsOnLineOtherEditor = getCharsOnLine(acediff3.editors.left, currentLineOtherEditor);
    const numCharsOnRightEditorStartLine = getCharsOnLine(acediff3.editors.right, info.startLine);
    var numCharsOnLine = getCharsOnLine(acediff3.editors.right, info.startLine);

    // this is necessary because if a new diff starts on the FIRST char of the left editor, the diff can comes
    // back from google as being on the last char of the previous line so we need to bump it up one
    let leftStartLine = currentLineOtherEditor;
    if (numCharsOnLine === 0 && newContentStartsWithNewline) {
      newContentStartsWithNewline = false;
    }
    if (info.startChar === 0 && isLastChar(acediff3.editors.left, offsetLeft, newContentStartsWithNewline)) {
      leftStartLine = currentLineOtherEditor + 1;
    }

    var sameLineInsert = info.startLine === info.endLine;
    var numRows = 0;
    if (

      // dense, but this accommodates two scenarios:
      // 1. where a completely fresh new line is being inserted in left editor, we want the line on right to stay a 1px line
      // 2. where a new character is inserted at the start of a newline on the left but the line contains other stuff,
      //    we DO want to make it a full line
      (info.startChar > 0 || (sameLineInsert && diffText.length < numCharsOnRightEditorStartLine))

      // if the right editor line was empty, it's ALWAYS a single line insert [not an OR above?]
      && numCharsOnLineOtherEditor > 0

      // if the text being inserted starts mid-line
      && (info.startChar < numCharsOnRightEditorStartLine)) {
      numRows++;
    }

    lineInfo = {
      leftStartLine,
      leftEndLine: leftStartLine + numRows,
      rightStartLine: info.startLine,
      rightEndLine: info.endLine + 1,
    };
  }

  return lineInfo;
}

// helper to return the startline, endline, startChar and endChar for a diff in a particular editor. Pretty
// fussy function
function getSingleDiffInfo(editor, offset, diffString) {
  const info = {
    startLine: 0,
    startChar: 0,
    endLine: 0,
    endChar: 0,
  };
  const endCharNum = offset + diffString.length;
  let runningTotal = 0;
  let startLineSet = false;
  let endLineSet = false;

  editor.lineLengths.forEach((lineLength, lineIndex) => {
    runningTotal += lineLength;

    if (!startLineSet && offset < runningTotal) {
      info.startLine = lineIndex;
      info.startChar = offset - runningTotal + lineLength;
      startLineSet = true;
    }

    if (!endLineSet && endCharNum <= runningTotal) {
      info.endLine = lineIndex;
      info.endChar = endCharNum - runningTotal + lineLength;
      endLineSet = true;
    }
  });

  // if the start char is the final char on the line, it's a newline & we ignore it
  if (info.startChar > 0 && getCharsOnLine(editor, info.startLine) === info.startChar) {
    info.startLine++;
    info.startChar = 0;
  }

  // if the end char is the first char on the line, we don't want to highlight that extra line
  if (info.endChar === 0) {
    info.endLine--;
  }

  const endsWithNewline = /\n$/.test(diffString);
  if (info.startChar > 0 && endsWithNewline) {
    info.endLine++;
  }

  return info;
}

// note that this and everything else in this script uses 0-indexed row numbers
function getCharsOnLine(editor, line) {
  return getLine(editor, line).length;
}

function getLineForCharPosition(editor, offsetChars) {
  const lines = editor.ace.getSession().doc.getAllLines();
  let foundLine = 0;
  let runningTotal = 0;

  for (let i = 0; i < lines.length; i += 1) {
    runningTotal += lines[i].length + 1; // +1 needed for newline char
    if (offsetChars <= runningTotal) {
      foundLine = i;
      break;
    }
  }
  return foundLine;
}

function isLastChar(editor, char, startsWithNewline) {
  const lines = editor.ace.getSession().doc.getAllLines();
  let runningTotal = 0;

  for (let i = 0; i < lines.length; i += 1) {
    runningTotal += lines[i].length + 1; // +1 needed for newline char
    let comparison = runningTotal;
    if (startsWithNewline) {
      comparison -= 1;
    }

    if (char === comparison) {
      break;
    }
  }
  return isLastChar;
}

function createGutter(acediff3) {
  acediff3.gutterHeight = document.getElementById(acediff3.options.classes.gutter1).clientHeight;
  acediff3.gutterWidth = document.getElementById(acediff3.options.classes.gutter1).clientWidth;

  const leftHeight = getTotalHeight(acediff3, C.EDITOR_LEFT);
  const commonHeight = getTotalHeight(acediff3, C.EDITOR_COMMON);
  const rightHeight = getTotalHeight(acediff3, C.EDITOR_RIGHT);
  const height = Math.max(leftHeight, rightHeight, commonHeight, acediff3.gutterHeight);

  acediff3.gutterSVG = document.createElementNS(C.SVG_NS, 'svg');
  acediff3.gutterSVG.setAttribute('width', acediff3.gutterWidth);
  acediff3.gutterSVG.setAttribute('height', height);

  document.getElementById(acediff3.options.classes.gutter1).appendChild(acediff3.gutterSVG);
  document.getElementById(acediff3.options.classes.gutter2).appendChild(acediff3.gutterSVG);
}

// acediff3.editors.left.ace.getSession().getLength() * acediff3.lineHeight
function getTotalHeight(acediff3, editor) {
  const ed = (editor === C.EDITOR_COMMON) ? acediff3.editors.common : acediff3.editors.right;
  return ed.ace.getSession().getLength() * acediff3.lineHeight;
}

// creates two contains for positioning the copy left + copy right arrows
function createCopyContainers(acediff3) {
  acediff3.copyRightContainer = document.createElement('div');
  acediff3.copyRightContainer.setAttribute('class', acediff3.options.classes.copyRightContainer);
  acediff3.copyLeftContainer = document.createElement('div');
  acediff3.copyLeftContainer.setAttribute('class', acediff3.options.classes.copyLeftContainer);

  document.getElementById(acediff3.options.classes.gutter1).appendChild(acediff3.copyRightContainer);
  document.getElementById(acediff3.options.classes.gutter2).appendChild(acediff3.copyLeftContainer);
}

function clearGutter(acediff3) {
  // gutter.innerHTML = '';
  document.getElementById(acediff3.options.classes.gutter1).removeChild(acediff3.gutterSVG);
  document.getElementById(acediff3.options.classes.gutter2).removeChild(acediff3.gutterSVG);
  createGutter(acediff3);
}

function clearArrows(acediff3) {
  acediff3.copyLeftContainer.innerHTML = '';
  acediff3.copyRightContainer.innerHTML = '';
}

/*
  * This combines multiple rows where, say, line 1 => line 1, line 2 => line 2, line 3-4 => line 3. That could be
  * reduced to a single connector line 1=4 => line 1-3
  */
function simplifyDiffs(acediff3, diffs) {
  const groupedDiffs = [];

  function compare(val) {
    return (acediff3.options.diffGranularity === C.DIFF_GRANULARITY_SPECIFIC) ? val < 1 : val <= 1;
  }

  diffs.forEach((diff, index) => {
    if (index === 0) {
      groupedDiffs.push(diff);
      return;
    }

    // loop through all grouped diffs. If this new diff lies between an existing one, we'll just add to it, rather
    // than create a new one
    let isGrouped = false;
    for (let i = 0; i < groupedDiffs.length; i += 1) {
      if (compare(Math.abs(diff.leftStartLine - groupedDiffs[i].leftEndLine))
        && compare(Math.abs(diff.rightStartLine - groupedDiffs[i].rightEndLine))) {
        // update the existing grouped diff to expand its horizons to include this new diff start + end lines
        groupedDiffs[i].leftStartLine = Math.min(diff.leftStartLine, groupedDiffs[i].leftStartLine);
        groupedDiffs[i].rightStartLine = Math.min(diff.rightStartLine, groupedDiffs[i].rightStartLine);
        groupedDiffs[i].leftEndLine = Math.max(diff.leftEndLine, groupedDiffs[i].leftEndLine);
        groupedDiffs[i].rightEndLine = Math.max(diff.rightEndLine, groupedDiffs[i].rightEndLine);
        isGrouped = true;
        break;
      }
    }

    if (!isGrouped) {
      groupedDiffs.push(diff);
    }
  });

  // clear out any single line diffs (i.e. single line on both editors)
  const fullDiffs = [];
  groupedDiffs.forEach((diff) => {
    if (diff.leftStartLine === diff.leftEndLine && diff.rightStartLine === diff.rightEndLine) {
      return;
    }
    fullDiffs.push(diff);
  });

  return fullDiffs;
}

function decorate(acediff3) {
  clearGutter(acediff3);
  clearArrows(acediff3);

  acediff3.diffs1.forEach((info, diffIndex) => {
    if (acediff3.options.showDiffs) {
      showDiff(acediff3, C.EDITOR_LEFT, info.leftStartLine, info.leftEndLine, acediff3.options.classes.diff);
      showDiff(acediff3, C.EDITOR_COMMON, info.rightStartLine, info.rightEndLine, acediff3.options.classes.diff);

      if (acediff3.options.showConnectors) {
        addConnector(acediff3, acediff3.editors.left, acediff3.editors.common, info.leftStartLine, info.leftEndLine, info.rightStartLine, info.rightEndLine);
      }
      addCopyArrows(acediff3, info, diffIndex);
    }
  }, acediff3);
  acediff3.diffs2.forEach((info, diffIndex) => {
    if (acediff3.options.showDiffs) {
      showDiff(acediff3, C.EDITOR_COMMON, info.leftStartLine, info.leftEndLine, acediff3.options.classes.diff);
      showDiff(acediff3, C.EDITOR_RIGHT, info.rightStartLine, info.rightEndLine, acediff3.options.classes.diff);

      if (acediff3.options.showConnectors) {
        addConnector(acediff3, acediff3.editors.common, acediff3.editors.right, info.leftStartLine, info.leftEndLine, info.rightStartLine, info.rightEndLine);
      }
      addCopyArrows(acediff3, info, diffIndex);
    }
  }, acediff3);
}

module.exports = AceDiff3;
