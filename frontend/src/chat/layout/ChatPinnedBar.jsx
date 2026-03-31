export function ChatPinnedBar({ previewText }) {
  return (
    <div className="gchat-pinned-bar">
      <strong>Pinned:</strong> {previewText ?? ''}
    </div>
  )
}
