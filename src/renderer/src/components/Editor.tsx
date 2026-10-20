import { useEffect, useRef, type ReactNode } from 'react'
import { EditorContent, Mark, mergeAttributes, useEditor, type Editor as TiptapEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Placeholder } from '@tiptap/extension-placeholder'
import { Plugin, PluginKey } from '@tiptap/pm/state'

/**
 * Marks text the AI wrote (rendered gray). Anything the user types or pastes loses the
 * mark, so their own words always show in full ink, as in Granola.
 */
const AiText = Mark.create({
  name: 'aiText',
  inclusive: false,
  parseHTML() {
    return [{ tag: 'span[data-ai]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-ai': '' }), 0]
  },
  addProseMirrorPlugins() {
    const type = this.type
    return [
      new Plugin({
        key: new PluginKey('aiTextOwnership'),
        appendTransaction(transactions, _old, state) {
          const ranges: [number, number][] = []
          transactions.forEach((t, ti) => {
            if (!t.docChanged) return
            const maps = t.mapping.maps
            maps.forEach((map, mi) => {
              map.forEach((_a, _b, start, end) => {
                if (end <= start) return
                let s = start
                let e = end
                for (let k = mi + 1; k < maps.length; k++) {
                  s = maps[k].map(s, -1)
                  e = maps[k].map(e, 1)
                }
                for (let tj = ti + 1; tj < transactions.length; tj++) {
                  s = transactions[tj].mapping.map(s, -1)
                  e = transactions[tj].mapping.map(e, 1)
                }
                ranges.push([s, e])
              })
            })
          })
          if (!ranges.length) return null
          const tr = state.tr
          const size = state.doc.content.size
          for (const [s, e] of ranges) tr.removeMark(Math.max(0, s), Math.min(size, e), type)
          return tr.docChanged ? tr : null
        }
      })
    ]
  }
})

export function Editor({
  content,
  placeholder,
  onChange,
  onEditor
}: {
  content: string
  placeholder: string
  onChange: (html: string) => void
  onEditor?: (editor: TiptapEditor) => void
}): ReactNode {
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3] } }), Placeholder.configure({ placeholder }), AiText],
    content,
    editorProps: { attributes: { class: 'prose', spellcheck: 'true' } },
    onUpdate: ({ editor }) => onChangeRef.current(editor.getHTML())
  })
  useEffect(() => {
    if (editor && onEditor) onEditor(editor)
  }, [editor, onEditor])
  return <EditorContent editor={editor} />
}
