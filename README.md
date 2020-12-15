# Ace-diff3

This is a wrapper for [Ace Editor](http://ace.c9.io/) to provide a 3-panel diffing/merging tool that visualizes differences in three documents and allows users to copy changes between them.

It's based on a fork of [Ace Diff](https://github.com/ace-diff/ace-diff) and built on top of [google-diff-match-patch](https://code.google.com/p/google-diff-match-patch/) library. That lib handles the hard part: the computation of the document diffs.
Ace-diff 3 just visualizes that information as line-diffs in the editors.

## How to Install

```bash
yarn && yarn build
```
Copy the files from ```dist/``` into your project.

### HTML

```html
<div class="acediff3"></div>
```

### JavaScript
Here's an example of how you'd instantiate AceDiff3.

```js
const differ = new AceDiff({
  ace: window.ace, // You Ace Editor instance
  element: '.acediff3',
  left: {
    content: 'your local file content here',
  },
  common: {
    content: 'your base file content here',
  },
  right: {
    content: 'your incoming file content here',
  },
});
```

Everything else is the same as Ace Diff - See the [Ace Diff Source](https://github.com/ace-diff/ace-diff) for information.

## License
MIT.
