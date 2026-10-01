import Foundation

@main
struct ModelsSmoke {
  static func expect(_ condition: @autoclosure () -> Bool, _ description: String) {
    precondition(condition(), description)
  }

  static func main() throws {
    let text = "甲😀\u{fffc}\n乙" as NSString
    expect(text.length == 6, "The bridge must use UTF-16 offsets")
    expect(validRichTextBoundary(1, in: text), "The emoji start is valid")
    expect(!validRichTextBoundary(2, in: text), "A surrogate pair cannot be split")
    expect(validRichTextBoundary(3, in: text), "The emoji end is valid")
    expect(richTextRange(["start": 1, "end": 3], in: text) == NSRange(location: 1, length: 2), "Emoji ranges use both UTF-16 units")
    expect(richTextRange(["start": 1, "end": 2], in: text) == nil, "Malformed UTF-16 ranges are rejected")
    expect(richTextRange(["start": true, "end": 3], in: text) == nil, "JSON booleans are not numeric offsets")
    expect(richTextRange(["start": -1, "end": 3], in: text) == nil, "Negative offsets are rejected")
    expect(richTextRange(["start": 0, "end": 7], in: text) == nil, "Out-of-bounds offsets are rejected")
    expect(!validRichTextRange(NSRange(location: NSNotFound, length: 1), in: text), "NSNotFound is rejected without overflow")
    expect(!validRichTextRange(NSRange(location: 1, length: Int.max), in: text), "Oversized ranges are rejected without overflow")

    let payload: [String: Any] = [
      "id": "smoke-flow", "textVersion": "one", "text": text as String,
      "attachments": [
        ["start": 3, "end": 4, "kind": "formula", "copyText": "x²"],
        ["start": 0, "end": 1, "kind": "image", "copyText": "incorrect replacement"],
        ["start": 99, "end": 100, "kind": "image", "copyText": "out of bounds"]
      ]
    ]
    let json = String(decoding: try JSONSerialization.data(withJSONObject: payload), as: UTF8.self)
    guard let flow = RichTextFlow.parse(json) else { fatalError("Valid flow did not parse") }
    expect(flow.selectionText(NSRange(location: 0, length: 6)) == "甲😀x²\n乙", "Cross-paragraph copy replaces only real attachments")
    expect(flow.selectionText(NSRange(location: 1, length: 2)) == "😀", "Partial selection preserves supplementary characters")
    expect(flow.selectionText(NSRange(location: 3, length: 1)) == "x²", "Attachment copy uses semantic text")
    expect(flow.selectionText(NSRange(location: 2, length: 2)) == nil, "Invalid native selections cannot produce a source string")
    expect(RichTextFlow.parse("{") == nil, "Malformed JSON is rejected")
    expect(RichTextFlow.parse("{\"id\":\"missing-fields\"}") == nil, "Flow identity and text are mandatory")
    print("iOS rich text model smoke: 17 checks passed")
  }
}
