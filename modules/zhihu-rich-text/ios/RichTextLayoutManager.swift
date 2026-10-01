import UIKit

struct RichTextDrawDecoration {
  let range: NSRange
  let kind: String
  let color: UIColor
  let thickness: CGFloat
  let offset: CGFloat
}

/** TextKit 1 uses the same visual line geometry for text, selection and range decorations. */
final class RichTextLayoutManager: NSLayoutManager {
  var decorations: [RichTextDrawDecoration] = []
  var quotes: [NSRange] = []
  var quoteColor = UIColor.gray
  var scale: CGFloat = 1

  override func drawGlyphs(forGlyphRange glyphsToShow: NSRange, at origin: CGPoint) {
    super.drawGlyphs(forGlyphRange: glyphsToShow, at: origin)
    guard let container = textContainers.first,
          let storage = textStorage, let context = UIGraphicsGetCurrentContext() else { return }
    let source = storage.string as NSString
    context.saveGState()
    context.translateBy(x: origin.x, y: origin.y)
    for decoration in decorations {
      let glyphs = glyphRange(forCharacterRange: decoration.range, actualCharacterRange: nil)
      let visible = NSIntersectionRange(glyphs, glyphsToShow)
      guard visible.length > 0 else { continue }
      enumerateLineFragments(forGlyphRange: visible) { lineRect, _, _, lineGlyphs, _ in
        var part = NSIntersectionRange(glyphs, lineGlyphs)
        guard part.length > 0 else { return }
        var characters = self.characterRange(forGlyphRange: part, actualGlyphRange: nil)
        while characters.length > 0 && source.character(at: NSMaxRange(characters) - 1) == 10 {
          characters.length -= 1
        }
        guard characters.length > 0 else { return }
        part = self.glyphRange(forCharacterRange: characters, actualCharacterRange: nil)
        let baseline = lineRect.minY + self.location(forGlyphAt: part.location).y + decoration.offset
        self.enumerateEnclosingRects(forGlyphRange: part, withinSelectedGlyphRange: NSRange(location: NSNotFound, length: 0), in: container) { rect, _ in
          self.drawDecoration(decoration, from: rect.minX, to: rect.maxX, baseline: baseline, context: context)
        }
      }
    }
    context.setStrokeColor(quoteColor.cgColor)
    context.setLineWidth(max(1, 2 * scale))
    context.setLineDash(phase: 0, lengths: [])
    for quote in quotes {
      let glyphs = NSIntersectionRange(glyphRange(forCharacterRange: quote, actualCharacterRange: nil), glyphsToShow)
      guard glyphs.length > 0 else { continue }
      let rect = boundingRect(forGlyphRange: glyphs, in: container)
      context.move(to: CGPoint(x: 2 * scale, y: rect.minY))
      context.addLine(to: CGPoint(x: 2 * scale, y: rect.maxY))
      context.strokePath()
    }
    context.restoreGState()
  }

  private func drawDecoration(_ decoration: RichTextDrawDecoration, from left: CGFloat, to right: CGFloat, baseline: CGFloat, context: CGContext) {
    guard right > left else { return }
    context.saveGState()
    context.setStrokeColor(decoration.color.cgColor)
    context.setLineWidth(decoration.thickness)
    context.setLineCap(decoration.kind == "dotted" ? .round : .butt)
    switch decoration.kind {
    case "dashed": context.setLineDash(phase: 0, lengths: [4 * scale, 3 * scale])
    case "dotted": context.setLineDash(phase: 0, lengths: [max(0.1, 0.1 * scale), 2.5 * scale])
    default: context.setLineDash(phase: 0, lengths: [])
    }
    context.move(to: CGPoint(x: left, y: baseline))
    if decoration.kind == "wavy" {
      var x = left
      var direction: CGFloat = -1
      let halfWave = max(2, 2.8 * scale)
      while x < right {
        let next = min(right, x + halfWave)
        context.addQuadCurve(to: CGPoint(x: next, y: baseline), control: CGPoint(x: (x + next) / 2, y: baseline + direction * 2 * scale))
        x = next
        direction *= -1
      }
    } else {
      context.addLine(to: CGPoint(x: right, y: baseline))
    }
    context.strokePath()
    context.restoreGState()
  }
}

final class FlowTextView: UITextView {
  var copyResolver: ((NSRange) -> String?)?

  override func copy(_ sender: Any?) {
    if let text = copyResolver?(selectedRange) {
      UIPasteboard.general.string = text
    } else {
      super.copy(sender)
    }
  }
}
