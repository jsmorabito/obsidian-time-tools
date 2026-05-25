# Third-party notices

Time Manager incorporates code derived from the following MIT-licensed projects. Their original copyright notices are reproduced here in accordance with their license terms.

---

## obsidian-periodic-notes

Source: <https://github.com/liamcain/obsidian-periodic-notes>

```
MIT License

Copyright (c) 2021 Liam Cain

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Files adapted from this project: `src/utils/template.ts`, `src/utils/paths.ts`, `src/utils/relative-date.ts`, `src/periodic/constants.ts`, `src/periodic/icons.ts`, `src/periodic/types.ts`, parts of `src/periodic/commands.ts` and `src/periodic/api.ts`.

---

## Obsidian-Daily-Notes-Editor

Source: <https://github.com/quorafind/Obsidian-Daily-Notes-Editor>

Daily Notes Editor's repository does not ship a top-level LICENSE file, but its `package.json` and `manifest.json` declare an MIT license. The MIT license terms apply.

```
MIT License

Copyright (c) 2022 Boninall (Quorafind)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Files adapted from this project: `src/editor/leafView.ts`, `src/editor/workspace-patches.ts`, `src/editor/file-manager.ts`, `src/editor/view.ts`, `src/editor/DailyNote.svelte`, `src/editor/DailyNoteEditorView.svelte`, `styles.css`.

---

## obsidian-hover-editor (via Daily Notes Editor)

`src/editor/leafView.ts` carries an attribution comment in its header noting that the embedded-leaf approach originated in <https://github.com/nothingislost/obsidian-hover-editor>, also MIT-licensed. Daily Notes Editor adapted it first; Time Manager inherits the further adaptation.
